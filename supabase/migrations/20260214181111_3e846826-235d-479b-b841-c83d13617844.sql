
CREATE OR REPLACE FUNCTION public.calcular_saldo_barbeiro(p_user_id uuid, p_barbeiro_id uuid DEFAULT NULL)
RETURNS TABLE(
  saldo_disponivel numeric,
  saldo_processando numeric,
  total_entradas numeric,
  total_saques numeric,
  total_depositos numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entradas numeric := 0;
  v_depositos_confirmados numeric := 0;
  v_saques_concluidos numeric := 0;
  v_saques_pendentes numeric := 0;
  v_data_corte timestamptz;
BEGIN
  -- Marco zero
  SELECT mz.data_corte INTO v_data_corte
  FROM financeiro_marco_zero mz
  ORDER BY mz.created_at DESC
  LIMIT 1;

  IF v_data_corte IS NULL THEN
    v_data_corte := '1970-01-01'::timestamptz;
  END IF;

  -- ENTRADAS: apenas pagamentos feitos PELO APP (pix online, cartão online, app)
  -- Exclui: cash, cartão presencial, pagamento na barbearia
  IF p_barbeiro_id IS NOT NULL THEN
    SELECT COALESCE(SUM(preco), 0) INTO v_entradas
    FROM agendamentos
    WHERE barbeiro_id = p_barbeiro_id
      AND status = 'completed'
      AND payment_method IN ('pix', 'credit_card', 'debit_card', 'app')
      AND created_at >= v_data_corte;
  ELSE
    -- Admin: todos os agendamentos pagos pelo app
    SELECT COALESCE(SUM(preco), 0) INTO v_entradas
    FROM agendamentos
    WHERE status = 'completed'
      AND payment_method IN ('pix', 'credit_card', 'debit_card', 'app')
      AND created_at >= v_data_corte;
  END IF;

  -- Depósitos confirmados após marco zero
  SELECT COALESCE(SUM(valor), 0) INTO v_depositos_confirmados
  FROM depositos
  WHERE user_id = p_user_id
    AND status = 'confirmado'
    AND created_at >= v_data_corte;

  -- Saques concluídos após marco zero
  SELECT COALESCE(SUM(valor), 0) INTO v_saques_concluidos
  FROM saques
  WHERE user_id = p_user_id
    AND status = 'concluido'
    AND created_at >= v_data_corte;

  -- Saques pendentes/processando após marco zero
  SELECT COALESCE(SUM(valor), 0) INTO v_saques_pendentes
  FROM saques
  WHERE user_id = p_user_id
    AND status IN ('pendente', 'processando')
    AND created_at >= v_data_corte;

  saldo_disponivel := (v_entradas + v_depositos_confirmados) - v_saques_concluidos - v_saques_pendentes;
  saldo_processando := v_saques_pendentes;
  total_entradas := v_entradas;
  total_saques := v_saques_concluidos;
  total_depositos := v_depositos_confirmados;

  IF saldo_disponivel < 0 THEN
    saldo_disponivel := 0;
  END IF;

  RETURN NEXT;
END;
$$;
