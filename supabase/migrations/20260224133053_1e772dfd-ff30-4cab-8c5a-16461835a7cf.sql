
-- =============================================
-- 1. Atualizar taxa PIX para R$ 3,00
-- =============================================
UPDATE public.taxas_gateway
SET taxa_fixa = 3.00,
    valor_taxa = 3.00,
    descricao = 'Taxa Asaas: R$ 3,00 por recebimento via Pix',
    updated_at = now()
WHERE metodo_pagamento = 'pix' AND ativo = true;

-- =============================================
-- 2. Adicionar taxa para pagamentos via crédito/carteira (sem taxa - é dinheiro interno)
-- =============================================
INSERT INTO public.taxas_gateway (metodo_pagamento, taxa_fixa, taxa_percentual, tipo_taxa, valor_taxa, descricao, ativo)
VALUES ('credit', 0, 0, 'fixo', 0, 'Sem taxa para pagamentos via créditos/carteira do cliente', true)
ON CONFLICT DO NOTHING;

-- =============================================
-- 3. Atualizar calcular_saldo_barbeiro para incluir pagamentos via crédito
-- Créditos do cliente são dinheiro real que já entrou no banco (via PIX/cartão original)
-- Quando reutilizados, o barbeiro que atendeu deve receber no saldo
-- =============================================
CREATE OR REPLACE FUNCTION public.calcular_saldo_barbeiro(p_user_id uuid, p_barbeiro_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(saldo_disponivel numeric, saldo_processando numeric, total_entradas numeric, total_saques numeric, total_depositos numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entradas numeric := 0;
  v_entradas_credito numeric := 0;
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

  -- ENTRADAS VIA CRÉDITO/CARTEIRA: Dinheiro que já estava no sistema
  -- Não precisa de gateway_payment_id pois é transferência interna
  -- Não tem taxa (o dinheiro já teve taxa descontada quando entrou originalmente)
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

  -- Saldo = entradas digitais + entradas crédito + depósitos - saques
  saldo_disponivel := (v_entradas + v_entradas_credito + v_depositos_confirmados) - v_saques_concluidos - v_saques_pendentes;
  saldo_processando := v_saques_pendentes;
  total_entradas := v_entradas + v_entradas_credito;
  total_saques := v_saques_concluidos;
  total_depositos := v_depositos_confirmados;

  IF saldo_disponivel < 0 THEN
    saldo_disponivel := 0;
  END IF;

  RETURN NEXT;
END;
$function$;
