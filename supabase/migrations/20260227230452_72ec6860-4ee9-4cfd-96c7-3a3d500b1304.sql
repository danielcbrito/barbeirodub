CREATE OR REPLACE FUNCTION public.calcular_saldo_barbeiro(p_user_id uuid, p_barbeiro_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(saldo_disponivel numeric, saldo_processando numeric, total_entradas numeric, total_saques numeric, total_depositos numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entradas numeric := 0;
  v_entradas_credito numeric := 0;
  v_entradas_plano numeric := 0;
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

  -- ENTRADAS DIGITAIS: Pagamentos verificados pelo gateway (PIX, cartão)
  IF p_barbeiro_id IS NOT NULL THEN
    SELECT COALESCE(SUM(
      a.preco - (
        COALESCE(t.taxa_fixa, 0) + 
        ROUND(a.preco * COALESCE(t.taxa_percentual, 0) / 100, 2)
      )
    ), 0) INTO v_entradas
    FROM agendamentos a
    INNER JOIN pagamentos p ON p.agendamento_id = a.id 
      AND p.status = 'paid'
      AND p.gateway_payment_id IS NOT NULL
    LEFT JOIN taxas_gateway t ON t.metodo_pagamento = a.payment_method AND t.ativo = true
    WHERE a.barbeiro_id = p_barbeiro_id
      AND a.status = 'completed'
      AND a.payment_method IN ('pix', 'credit_card', 'debit_card')
      AND a.created_at >= v_data_corte;
  ELSE
    SELECT COALESCE(SUM(
      a.preco - (
        COALESCE(t.taxa_fixa, 0) + 
        ROUND(a.preco * COALESCE(t.taxa_percentual, 0) / 100, 2)
      )
    ), 0) INTO v_entradas
    FROM agendamentos a
    INNER JOIN pagamentos p ON p.agendamento_id = a.id 
      AND p.status = 'paid'
      AND p.gateway_payment_id IS NOT NULL
    LEFT JOIN taxas_gateway t ON t.metodo_pagamento = a.payment_method AND t.ativo = true
    WHERE a.status = 'completed'
      AND a.payment_method IN ('pix', 'credit_card', 'debit_card')
      AND a.created_at >= v_data_corte;
  END IF;

  -- ENTRADAS VIA CRÉDITO/CARTEIRA
  IF p_barbeiro_id IS NOT NULL THEN
    SELECT COALESCE(SUM(a.preco), 0) INTO v_entradas_credito
    FROM agendamentos a
    WHERE a.barbeiro_id = p_barbeiro_id
      AND a.status = 'completed'
      AND a.payment_method = 'credit'
      AND a.created_at >= v_data_corte;
  ELSE
    SELECT COALESCE(SUM(a.preco), 0) INTO v_entradas_credito
    FROM agendamentos a
    WHERE a.status = 'completed'
      AND a.payment_method = 'credit'
      AND a.created_at >= v_data_corte;
  END IF;

  -- ====================================================
  -- ENTRADAS VIA PLANOS (assinaturas PIX + cash)
  -- Pagamentos de assinaturas vinculados ao barbeiro
  -- ====================================================
  
  -- 1) Pagamentos PIX de assinaturas (tabela pagamentos com assinatura_id, sem agendamento)
  IF p_barbeiro_id IS NOT NULL THEN
    SELECT COALESCE(SUM(
      pg.valor - (
        COALESCE(t.taxa_fixa, 0) + 
        ROUND(pg.valor * COALESCE(t.taxa_percentual, 0) / 100, 2)
      )
    ), 0) INTO v_entradas_plano
    FROM pagamentos pg
    INNER JOIN assinaturas ass ON ass.id = pg.assinatura_id
    LEFT JOIN taxas_gateway t ON t.metodo_pagamento = 'pix' AND t.ativo = true
    WHERE ass.barbeiro_id = p_barbeiro_id
      AND pg.status = 'paid'
      AND pg.agendamento_id IS NULL
      AND pg.assinatura_id IS NOT NULL
      AND pg.created_at >= v_data_corte;
  ELSE
    SELECT COALESCE(SUM(
      pg.valor - (
        COALESCE(t.taxa_fixa, 0) + 
        ROUND(pg.valor * COALESCE(t.taxa_percentual, 0) / 100, 2)
      )
    ), 0) INTO v_entradas_plano
    FROM pagamentos pg
    INNER JOIN assinaturas ass ON ass.id = pg.assinatura_id
    LEFT JOIN taxas_gateway t ON t.metodo_pagamento = 'pix' AND t.ativo = true
    WHERE pg.status = 'paid'
      AND pg.agendamento_id IS NULL
      AND pg.assinatura_id IS NOT NULL
      AND pg.created_at >= v_data_corte;
  END IF;

  -- 2) Pagamentos manuais (cash) confirmados na barbearia
  IF p_barbeiro_id IS NOT NULL THEN
    SELECT v_entradas_plano + COALESCE(SUM(ppb.valor), 0) INTO v_entradas_plano
    FROM pagamentos_plano_barbearia ppb
    WHERE ppb.barbeiro_id = p_barbeiro_id
      AND ppb.created_at >= v_data_corte;
  ELSE
    SELECT v_entradas_plano + COALESCE(SUM(ppb.valor), 0) INTO v_entradas_plano
    FROM pagamentos_plano_barbearia ppb
    WHERE ppb.created_at >= v_data_corte;
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

  -- Saldo = entradas digitais + crédito + planos + depósitos - saques
  saldo_disponivel := (v_entradas + v_entradas_credito + v_entradas_plano + v_depositos_confirmados) - v_saques_concluidos - v_saques_pendentes;
  saldo_processando := v_saques_pendentes;
  total_entradas := v_entradas + v_entradas_credito + v_entradas_plano;
  total_saques := v_saques_concluidos;
  total_depositos := v_depositos_confirmados;

  IF saldo_disponivel < 0 THEN
    saldo_disponivel := 0;
  END IF;

  RETURN NEXT;
END;
$function$;