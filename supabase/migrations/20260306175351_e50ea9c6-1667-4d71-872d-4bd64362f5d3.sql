-- Fix: scope plan usage count to the CURRENT subscription (assinatura_id),
-- not globally by user_id. This ensures that when a client cancels and
-- re-subscribes, usage resets to zero for the new subscription.

CREATE OR REPLACE FUNCTION public.consume_plan_use_on_appointment_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_assinatura_id uuid;
  v_limite integer;
  v_usados integer;
  v_competencia date;
  v_sub_status text;
BEGIN
  -- Apenas para agendamentos via plano
  IF COALESCE(NEW.payment_method, '') <> 'plano' AND COALESCE(NEW.tipo_agendamento, '') <> 'plano' THEN
    RETURN NEW;
  END IF;

  v_competencia := date_trunc('month', NEW.data)::date;

  -- Assinatura ativa OU pending_cash do usuário (mais recente)
  SELECT a.id, COALESCE(p.limite_agendamentos_mes, 4), a.status::text
    INTO v_assinatura_id, v_limite, v_sub_status
  FROM public.assinaturas a
  JOIN public.planos p ON p.id = a.plano_id
  WHERE a.user_id = NEW.user_id
    AND a.status IN ('active', 'pending_cash')
  ORDER BY a.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_assinatura_id IS NULL THEN
    RAISE EXCEPTION 'NO_ACTIVE_SUBSCRIPTION';
  END IF;

  -- Para pending_cash, limite é 1 (apenas o primeiro corte)
  IF v_sub_status = 'pending_cash' THEN
    v_limite := 1;
  END IF;

  -- Contagem de usos APENAS para a assinatura atual (não global)
  -- Isso garante que ao cancelar e reassinar, a contagem reinicia
  SELECT COUNT(*)
    INTO v_usados
  FROM public.plano_agendamentos_usos u
  WHERE u.assinatura_id = v_assinatura_id
    AND u.released_at IS NULL;

  IF v_usados >= v_limite THEN
    RAISE EXCEPTION 'PLAN_LIMIT_REACHED';
  END IF;

  -- Registra o consumo vinculado à assinatura atual
  INSERT INTO public.plano_agendamentos_usos (user_id, assinatura_id, agendamento_id, competencia)
  VALUES (NEW.user_id, v_assinatura_id, NEW.id, v_competencia)
  ON CONFLICT (agendamento_id) DO NOTHING;

  -- Consistência do agendamento
  UPDATE public.agendamentos
  SET payment_method = 'plano',
      tipo_agendamento = 'plano',
      is_free = CASE WHEN v_sub_status = 'pending_cash' THEN false ELSE true END,
      preco = CASE WHEN v_sub_status = 'pending_cash' THEN NEW.preco ELSE 0 END,
      updated_at = now()
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;