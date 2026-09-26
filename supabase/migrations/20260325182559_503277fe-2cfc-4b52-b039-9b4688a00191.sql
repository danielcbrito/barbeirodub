
-- ═══════════════════════════════════════════════════════════
-- RPC renovar_plano_cliente
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.renovar_plano_cliente(
  p_assinatura_id UUID,
  p_forma_pagamento TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_assinatura RECORD;
  v_plano RECORD;
  v_usos_restantes INTEGER;
  v_limite INTEGER;
BEGIN
  SELECT * INTO v_assinatura
  FROM assinaturas
  WHERE id = p_assinatura_id
    AND user_id = auth.uid()
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Assinatura não encontrada ou inativa');
  END IF;

  SELECT * INTO v_plano FROM planos WHERE id = v_assinatura.plano_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Plano não encontrado');
  END IF;

  v_limite := COALESCE(v_plano.limite_agendamentos_mes, 4);
  v_usos_restantes := v_limite - COALESCE(v_assinatura.usos_ciclo_atual, 0);

  IF v_usos_restantes > 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Você ainda tem ' || v_usos_restantes || ' serviço(s) disponível(is) neste ciclo. Use todos antes de renovar.',
      'usos_restantes', v_usos_restantes
    );
  END IF;

  IF p_forma_pagamento = 'cash' THEN
    UPDATE assinaturas SET
      ciclo_inicio = CURRENT_DATE,
      ciclo_fim = CURRENT_DATE + INTERVAL '30 days',
      usos_ciclo_atual = 0,
      total_renovacoes = total_renovacoes + 1,
      renovada_antecipadamente = (CURRENT_DATE < v_assinatura.ciclo_fim),
      next_billing_date = (CURRENT_DATE + INTERVAL '30 days')::date,
      status = 'pending_cash',
      cash_payment_confirmed = false,
      payment_method = 'cash',
      updated_at = now()
    WHERE id = p_assinatura_id;

    RETURN json_build_object(
      'success', true,
      'forma_pagamento', 'cash',
      'novo_ciclo_inicio', CURRENT_DATE,
      'novo_ciclo_fim', CURRENT_DATE + INTERVAL '30 days',
      'aguardando_confirmacao', true
    );
  END IF;

  UPDATE assinaturas SET
    status = 'pending_renewal',
    payment_method = p_forma_pagamento::payment_method,
    updated_at = now()
  WHERE id = p_assinatura_id;

  RETURN json_build_object(
    'success', true,
    'requer_pagamento', true,
    'forma_pagamento', p_forma_pagamento,
    'assinatura_id', p_assinatura_id,
    'valor', v_plano.preco_mensal
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- RPC get_assinatura_status
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_assinatura_status(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'tem_plano', true,
    'assinatura_id', a.id,
    'status', a.status,
    'plano_nome', p.nome,
    'plano_preco', p.preco_mensal,
    'servico_id', p.servico_id,
    'servico_nome', s.nome,
    'servico_duracao', s.duracao,
    'limite_usos', COALESCE(p.limite_agendamentos_mes, 4),
    'usos_realizados', COALESCE(a.usos_ciclo_atual, 0),
    'usos_restantes', COALESCE(p.limite_agendamentos_mes, 4) - COALESCE(a.usos_ciclo_atual, 0),
    'pode_renovar', (COALESCE(p.limite_agendamentos_mes, 4) - COALESCE(a.usos_ciclo_atual, 0)) <= 0,
    'ciclo_inicio', a.ciclo_inicio,
    'ciclo_fim', a.ciclo_fim,
    'dias_restantes', GREATEST(0, (a.ciclo_fim - CURRENT_DATE)),
    'total_renovacoes', COALESCE(a.total_renovacoes, 0),
    'payment_method', a.payment_method,
    'barbeiro_id', a.barbeiro_id
  ) INTO v_result
  FROM assinaturas a
  JOIN planos p ON p.id = a.plano_id
  LEFT JOIN servicos s ON s.id = p.servico_id
  WHERE a.user_id = p_user_id
    AND a.status IN ('active', 'pending_renewal', 'pending_cash')
  ORDER BY a.created_at DESC
  LIMIT 1;

  RETURN COALESCE(v_result, json_build_object('tem_plano', false));
END;
$$;
