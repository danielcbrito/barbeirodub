-- Migration: Fix cancellation debt settlement on appointment insert
-- Problem: When a barber creates an encaixe/appointment for an existing client who had past cancellation records,
-- trg_auto_settle_cancellation_debt fired settle_client_debts(), which updated informacoes_empresa.
-- That triggered guard_barber_debt_release(), which threw UNAUTHORIZED_CANCELLATION_DEBT_CHANGE and aborted the booking.
-- Solution:
-- 1. Settle client debts only when there are actually pending debts (don't update if already settled/dispensed/liberado).
-- 2. Allow internal settlement via app.settle_debts session variable and status 'pago' in guard_barber_debt_release.
-- 3. Wrap trg_auto_settle_cancellation_debt in an exception block so that debt accounting never blocks customer booking.

CREATE OR REPLACE FUNCTION public.settle_client_debts(p_client_id uuid, p_correlation text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.informacoes_empresa%ROWTYPE;
  val jsonb;
  itens jsonb;
  updated_itens jsonb := '[]'::jsonb;
  item jsonb;
  has_pending boolean := false;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('cancel-debt:' || p_client_id::text, 0));

  SELECT * INTO r FROM public.informacoes_empresa
  WHERE categoria = 'debitos_cliente' AND chave = 'debito_cancelamento_' || p_client_id::text
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'settled', 0);
  END IF;

  val := r.valor::jsonb;

  -- Verifica se existe qualquer item pendente no registro
  IF val ? 'itens' AND jsonb_typeof(val->'itens') = 'array' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(val->'itens')
    LOOP
      IF item->>'status' = 'pendente' THEN
        has_pending := true;
        EXIT;
      END IF;
    END LOOP;
  ELSE
    -- Formato de item único legado
    IF val->>'status' = 'pendente' THEN
      has_pending := true;
    END IF;
  END IF;

  -- Se não há débitos pendentes (já está liberado, dispensado ou pago), não precisa atualizar nada
  IF NOT has_pending THEN
    RETURN jsonb_build_object('success', true, 'settled', 0);
  END IF;

  -- Há débitos pendentes: autoriza quitação interna no trigger
  PERFORM set_config('app.settle_debts', '1', true);

  IF val ? 'itens' AND jsonb_typeof(val->'itens') = 'array' THEN
    itens := val->'itens';
    FOR item IN SELECT * FROM jsonb_array_elements(itens)
    LOOP
      IF item->>'status' = 'pendente' THEN
        item := item || jsonb_build_object('status', 'pago', 'paid_at', now(), 'correlation_id', p_correlation);
      END IF;
      updated_itens := updated_itens || jsonb_build_array(item);
    END LOOP;
  ELSE
    updated_itens := jsonb_build_array(val || jsonb_build_object('status', 'pago', 'paid_at', now(), 'correlation_id', p_correlation));
  END IF;

  val := val || jsonb_build_object(
    'status', 'pago',
    'total_pendente', 0,
    'valor_taxa', 0,
    'paid_at', now(),
    'correlation_id', p_correlation,
    'itens', updated_itens
  );

  UPDATE public.informacoes_empresa
  SET valor = val::text, atualizado_em = now()
  WHERE id = r.id;

  RETURN jsonb_build_object('success', true, 'settled', 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_barber_debt_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE o jsonb; n jsonb;
BEGIN
IF auth.role() IS DISTINCT FROM 'authenticated' THEN RETURN NEW; END IF;
-- Bypass para liquidação interna de débitos pelo sistema
IF current_setting('app.settle_debts', true) = '1' THEN RETURN NEW; END IF;

IF OLD.categoria<>'debitos_cliente' AND OLD.chave NOT LIKE 'debito_cancelamento_%' AND NEW.categoria<>'debitos_cliente' AND NEW.chave NOT LIKE 'debito_cancelamento_%' THEN RETURN NEW; END IF;
o:=OLD.valor::jsonb; n:=NEW.valor::jsonb;
IF NOT public.owns_cancellation_debt(OLD.tenant_id,o->>'barbeiro_id',o->>'cliente_id') OR
(to_jsonb(NEW)-ARRAY['valor','ativo','atualizado_em']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['valor','ativo','atualizado_em']) OR
(n-ARRAY['status','dispensado_em','liberado_em']) IS DISTINCT FROM (o-ARRAY['status','dispensado_em','liberado_em']) OR
n->>'status' NOT IN ('liberado_manual','dispensado', 'pago') OR n->>'status' IS NULL OR
(o->>'status' IS DISTINCT FROM 'pendente' AND o->>'status' IS DISTINCT FROM n->>'status') THEN
RAISE EXCEPTION 'UNAUTHORIZED_CANCELLATION_DEBT_CHANGE' USING ERRCODE='42501'; END IF;
NEW.atualizado_em:=now(); RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_auto_settle_cancellation_debt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NEW.status = 'confirmed' AND (OLD.status IS NULL OR OLD.status <> 'confirmed') THEN
    BEGIN
      PERFORM public.settle_client_debts(NEW.user_id, NEW.id::text);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'trg_auto_settle_cancellation_debt falhou para agendamento %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;
