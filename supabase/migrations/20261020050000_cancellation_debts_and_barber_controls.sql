-- Migration: Políticas e RPCs de Gestão de Taxas de Cancelamento, Falta e Liberação Manual
-- 1. Garante que owns_cancellation_debt não quebre queries anon/públicas
GRANT EXECUTE ON FUNCTION public.owns_cancellation_debt(uuid,text,text) TO anon, authenticated, service_role;

-- 2. RPC para o barbeiro/admin dispensar manualmente a taxa de um cliente
CREATE OR REPLACE FUNCTION public.dispensar_debito_cliente(
  p_cliente_id uuid,
  p_item_id uuid DEFAULT NULL,
  p_motivo text DEFAULT 'liberado_manual'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.informacoes_empresa%ROWTYPE;
  val jsonb;
  itens jsonb;
  updated_itens jsonb := '[]'::jsonb;
  item jsonb;
  remaining_total numeric := 0;
  found_item boolean := false;
  caller_user_id uuid := auth.uid();
BEGIN
  -- Permissão: deve ser usuário autenticado
  IF caller_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('cancel-debt:' || p_cliente_id::text, 0));

  SELECT * INTO r FROM public.informacoes_empresa
  WHERE categoria = 'debitos_cliente' AND chave = 'debito_cancelamento_' || p_cliente_id::text
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Fallback: verifica se há débito na tabela cliente_debitos_cancelamento
    UPDATE public.cliente_debitos_cancelamento
    SET status = 'dispensado', updated_at = now()
    WHERE cliente_id = p_cliente_id AND status = 'pendente';

    RETURN jsonb_build_object('success', true, 'dispensado', true, 'total_pendente', 0);
  END IF;

  val := r.valor::jsonb;

  -- Atualiza itens em array
  IF val ? 'itens' AND jsonb_typeof(val->'itens') = 'array' THEN
    itens := val->'itens';
    FOR item IN SELECT * FROM jsonb_array_elements(itens)
    LOOP
      IF p_item_id IS NULL OR (item->>'id')::text = p_item_id::text THEN
        item := item || jsonb_build_object(
          'status', COALESCE(p_motivo, 'liberado_manual'),
          'dispensado_em', now(),
          'dispensado_por', caller_user_id
        );
        found_item := true;
      END IF;

      IF item->>'status' = 'pendente' THEN
        remaining_total := remaining_total + COALESCE((item->>'valor_taxa')::numeric, 0);
      END IF;

      updated_itens := updated_itens || jsonb_build_array(item);
    END LOOP;
  ELSE
    -- Legado simples sem array
    updated_itens := jsonb_build_array(
      val || jsonb_build_object(
        'status', COALESCE(p_motivo, 'liberado_manual'),
        'dispensado_em', now(),
        'dispensado_por', caller_user_id
      )
    );
    remaining_total := 0;
  END IF;

  val := val || jsonb_build_object(
    'status', CASE WHEN remaining_total > 0 THEN 'pendente' ELSE COALESCE(p_motivo, 'liberado_manual') END,
    'total_pendente', remaining_total,
    'valor_taxa', remaining_total,
    'dispensado_em', now(),
    'dispensado_por', caller_user_id,
    'itens', updated_itens
  );

  UPDATE public.informacoes_empresa
  SET valor = val::text,
      ativo = (remaining_total > 0),
      atualizado_em = now()
  WHERE id = r.id;

  -- Atualiza também tabela cliente_debitos_cancelamento se existir
  UPDATE public.cliente_debitos_cancelamento
  SET status = 'dispensado', updated_at = now()
  WHERE cliente_id = p_cliente_id AND (p_item_id IS NULL OR id = p_item_id);

  -- Notificação para o cliente informando que a taxa foi dispensada
  INSERT INTO public.notificacoes(user_id, tipo, titulo, mensagem, created_at)
  VALUES (
    p_cliente_id,
    'taxa_dispensada',
    'Taxa dispensada ✓',
    'Seu barbeiro dispensou a taxa de cancelamento/falta. Seu aplicativo está 100% liberado para novos agendamentos!',
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'dispensado', true,
    'total_pendente', remaining_total,
    'data', val
  );
END $$;

REVOKE ALL ON FUNCTION public.dispensar_debito_cliente(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispensar_debito_cliente(uuid, uuid, text) TO authenticated, service_role;

-- 3. RPC para listar débitos pendentes de cancelamento por barbeiro
CREATE OR REPLACE FUNCTION public.get_barber_pending_debts(p_barbeiro_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  res jsonb := '[]'::jsonb;
  r record;
  val jsonb;
  item jsonb;
  matching_items jsonb;
  client_id_val text;
BEGIN
  FOR r IN
    SELECT ie.id as row_id, ie.tenant_id, ie.chave, ie.valor::jsonb as val,
           p.nome as client_nome, p.telefone as client_telefone, p.avatar_url as client_avatar
    FROM public.informacoes_empresa ie
    LEFT JOIN public.profiles p ON ('debito_cancelamento_' || p.id::text) = ie.chave
    WHERE ie.categoria = 'debitos_cliente'
      AND (ie.ativo = true OR (ie.valor::jsonb->>'status' = 'pendente'))
  LOOP
    val := r.val;
    matching_items := '[]'::jsonb;

    IF val ? 'itens' AND jsonb_typeof(val->'itens') = 'array' THEN
      FOR item IN SELECT * FROM jsonb_array_elements(val->'itens')
      LOOP
        IF item->>'status' = 'pendente' AND (p_barbeiro_id IS NULL OR item->>'barbeiro_id' = p_barbeiro_id::text) THEN
          matching_items := matching_items || jsonb_build_array(item);
        END IF;
      END LOOP;
    ELSIF val->>'status' = 'pendente' AND (p_barbeiro_id IS NULL OR val->>'barbeiro_id' = p_barbeiro_id::text) THEN
      matching_items := jsonb_build_array(val);
    END IF;

    IF jsonb_array_length(matching_items) > 0 THEN
      client_id_val := COALESCE(val->>'cliente_id', substring(r.chave from 'debito_cancelamento_(.*)'));
      res := res || jsonb_build_array(jsonb_build_object(
        'row_id', r.row_id,
        'tenant_id', r.tenant_id,
        'cliente_id', client_id_val,
        'cliente_nome', COALESCE(r.client_nome, val->>'cliente_nome', 'Cliente'),
        'cliente_telefone', COALESCE(r.client_telefone, val->>'cliente_telefone', ''),
        'cliente_avatar', r.client_avatar,
        'total_pendente', COALESCE((val->>'total_pendente')::numeric, (val->>'valor_taxa')::numeric, 0),
        'status', val->>'status',
        'itens', matching_items,
        'updated_at', val->>'updated_at'
      ));
    END IF;
  END LOOP;

  RETURN res;
END $$;

REVOKE ALL ON FUNCTION public.get_barber_pending_debts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_barber_pending_debts(uuid) TO authenticated, service_role;
