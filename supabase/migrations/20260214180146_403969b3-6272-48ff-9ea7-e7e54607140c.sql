
-- ============================================
-- FUNÇÃO SEGURA: Calcular saldo disponível do barbeiro
-- Saldo = (pagamentos de agendamentos concluídos) + (depósitos confirmados) - (saques concluídos)
-- SECURITY DEFINER para rodar com permissões elevadas
-- ============================================

CREATE OR REPLACE FUNCTION public.calcular_saldo_barbeiro(p_user_id UUID, p_barbeiro_id UUID DEFAULT NULL)
RETURNS TABLE (
  saldo_disponivel NUMERIC,
  saldo_processando NUMERIC,
  total_entradas NUMERIC,
  total_saques NUMERIC,
  total_depositos NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entradas NUMERIC := 0;
  v_saques_concluidos NUMERIC := 0;
  v_saques_pendentes NUMERIC := 0;
  v_depositos_confirmados NUMERIC := 0;
  v_depositos_pendentes NUMERIC := 0;
BEGIN
  -- 1. ENTRADAS: Agendamentos concluídos atribuídos ao barbeiro (100% do valor)
  IF p_barbeiro_id IS NOT NULL THEN
    SELECT COALESCE(SUM(a.preco), 0) INTO v_entradas
    FROM agendamentos a
    WHERE a.barbeiro_id = p_barbeiro_id
      AND a.status = 'completed';
  ELSE
    -- Admin: todos os agendamentos concluídos
    SELECT COALESCE(SUM(a.preco), 0) INTO v_entradas
    FROM agendamentos a
    WHERE a.status = 'completed';
  END IF;

  -- 2. SAQUES CONCLUÍDOS (já transferidos)
  SELECT COALESCE(SUM(s.valor), 0) INTO v_saques_concluidos
  FROM saques s
  WHERE s.user_id = p_user_id
    AND s.status = 'concluido';

  -- 3. SAQUES EM PROCESSAMENTO (reservados, não disponíveis)
  SELECT COALESCE(SUM(s.valor), 0) INTO v_saques_pendentes
  FROM saques s
  WHERE s.user_id = p_user_id
    AND s.status IN ('pendente', 'processando');

  -- 4. DEPÓSITOS CONFIRMADOS
  SELECT COALESCE(SUM(d.valor), 0) INTO v_depositos_confirmados
  FROM depositos d
  WHERE d.user_id = p_user_id
    AND d.status = 'confirmado';

  -- 5. DEPÓSITOS PENDENTES
  SELECT COALESCE(SUM(d.valor), 0) INTO v_depositos_pendentes
  FROM depositos d
  WHERE d.user_id = p_user_id
    AND d.status = 'pendente';

  -- RETORNO
  saldo_disponivel := (v_entradas + v_depositos_confirmados) - v_saques_concluidos - v_saques_pendentes;
  saldo_processando := v_saques_pendentes + v_depositos_pendentes;
  total_entradas := v_entradas + v_depositos_confirmados;
  total_saques := v_saques_concluidos;
  total_depositos := v_depositos_confirmados;

  -- Saldo nunca negativo (proteção)
  IF saldo_disponivel < 0 THEN
    saldo_disponivel := 0;
  END IF;

  RETURN NEXT;
END;
$$;

-- ============================================
-- FUNÇÃO SEGURA: Validar saque (anti-fraude)
-- Verifica se o barbeiro tem saldo suficiente antes de permitir
-- ============================================

CREATE OR REPLACE FUNCTION public.validar_saque(p_user_id UUID, p_barbeiro_id UUID, p_valor NUMERIC)
RETURNS TABLE (
  permitido BOOLEAN,
  saldo_atual NUMERIC,
  motivo TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saldo RECORD;
  v_saques_recentes INT;
BEGIN
  -- Calcular saldo atual
  SELECT * INTO v_saldo FROM public.calcular_saldo_barbeiro(p_user_id, p_barbeiro_id);

  saldo_atual := v_saldo.saldo_disponivel;

  -- Validação 1: Valor positivo
  IF p_valor <= 0 THEN
    permitido := FALSE;
    motivo := 'Valor do saque deve ser maior que zero';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Validação 2: Valor mínimo R$ 5,00
  IF p_valor < 5.00 THEN
    permitido := FALSE;
    motivo := 'Valor mínimo para saque é R$ 5,00';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Validação 3: Saldo suficiente
  IF p_valor > v_saldo.saldo_disponivel THEN
    permitido := FALSE;
    motivo := 'Saldo insuficiente para este saque';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Validação 4: Limite de saques por dia (máx 3)
  SELECT COUNT(*) INTO v_saques_recentes
  FROM saques s
  WHERE s.user_id = p_user_id
    AND s.created_at >= NOW() - INTERVAL '24 hours'
    AND s.status NOT IN ('cancelado', 'falhou');

  IF v_saques_recentes >= 3 THEN
    permitido := FALSE;
    motivo := 'Limite de 3 saques por dia atingido';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Tudo OK
  permitido := TRUE;
  motivo := 'Saque autorizado';
  RETURN NEXT;
END;
$$;
