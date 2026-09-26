
-- ============================================
-- 1. Reestruturar tabela taxas_gateway para suportar taxa fixa + percentual
-- ============================================

-- Adicionar colunas para taxa composta (fixa + percentual)
ALTER TABLE public.taxas_gateway 
ADD COLUMN IF NOT EXISTS taxa_fixa numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS taxa_percentual numeric DEFAULT 0;

-- Migrar dados existentes para as novas colunas
UPDATE public.taxas_gateway 
SET taxa_fixa = valor_taxa, taxa_percentual = 0 
WHERE tipo_taxa = 'fixo';

UPDATE public.taxas_gateway 
SET taxa_percentual = valor_taxa, taxa_fixa = 0 
WHERE tipo_taxa = 'percentual';

-- Atualizar com as taxas REAIS do Asaas (valores atuais)
-- PIX: R$ 0,99 fixo (promocional)
UPDATE public.taxas_gateway 
SET taxa_fixa = 0.99, taxa_percentual = 0, 
    descricao = 'Taxa Asaas: R$ 0,99 por recebimento via Pix'
WHERE metodo_pagamento = 'pix';

-- Cartão de Crédito: 2,99% + R$ 0,49 (à vista)
UPDATE public.taxas_gateway 
SET taxa_fixa = 0.49, taxa_percentual = 2.99,
    descricao = 'Taxa Asaas: 2,99% + R$ 0,49 por recebimento via Cartão de Crédito'
WHERE metodo_pagamento = 'credit_card';

-- Cartão de Débito: 1,89% + R$ 0,35 (online)
UPDATE public.taxas_gateway 
SET taxa_fixa = 0.35, taxa_percentual = 1.89,
    descricao = 'Taxa Asaas: 1,89% + R$ 0,35 por recebimento via Cartão de Débito'
WHERE metodo_pagamento = 'debit_card';

-- App (pagamento interno): sem taxa
UPDATE public.taxas_gateway 
SET taxa_fixa = 0, taxa_percentual = 0
WHERE metodo_pagamento = 'app';

-- ============================================
-- 2. Atualizar função calcular_saldo_barbeiro para usar taxa composta
-- ============================================

CREATE OR REPLACE FUNCTION public.calcular_saldo_barbeiro(
  p_user_id uuid,
  p_barbeiro_id uuid DEFAULT NULL
)
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

  -- ENTRADAS: pagamentos pelo APP com desconto de taxas compostas (fixa + percentual)
  IF p_barbeiro_id IS NOT NULL THEN
    SELECT COALESCE(SUM(
      a.preco - (
        COALESCE(t.taxa_fixa, 0) + 
        ROUND(a.preco * COALESCE(t.taxa_percentual, 0) / 100, 2)
      )
    ), 0) INTO v_entradas
    FROM agendamentos a
    LEFT JOIN taxas_gateway t ON t.metodo_pagamento = a.payment_method AND t.ativo = true
    WHERE a.barbeiro_id = p_barbeiro_id
      AND a.status = 'completed'
      AND a.payment_method IN ('pix', 'credit_card', 'debit_card', 'app')
      AND a.created_at >= v_data_corte;
  ELSE
    SELECT COALESCE(SUM(
      a.preco - (
        COALESCE(t.taxa_fixa, 0) + 
        ROUND(a.preco * COALESCE(t.taxa_percentual, 0) / 100, 2)
      )
    ), 0) INTO v_entradas
    FROM agendamentos a
    LEFT JOIN taxas_gateway t ON t.metodo_pagamento = a.payment_method AND t.ativo = true
    WHERE a.status = 'completed'
      AND a.payment_method IN ('pix', 'credit_card', 'debit_card', 'app')
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
