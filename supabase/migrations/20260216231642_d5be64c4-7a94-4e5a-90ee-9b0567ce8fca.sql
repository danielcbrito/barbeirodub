
-- ============================================
-- Tabela de taxas configuráveis por método de pagamento
-- ============================================
CREATE TABLE public.taxas_gateway (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  metodo_pagamento TEXT NOT NULL UNIQUE,
  tipo_taxa TEXT NOT NULL DEFAULT 'fixo' CHECK (tipo_taxa IN ('fixo', 'percentual')),
  valor_taxa NUMERIC NOT NULL DEFAULT 0,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.taxas_gateway ENABLE ROW LEVEL SECURITY;

-- Apenas admins podem ler/modificar
CREATE POLICY "Admins can manage taxas_gateway"
ON public.taxas_gateway
FOR ALL
USING (public.is_admin());

-- Barbeiros e admins podem ler as taxas (para exibir na UI)
CREATE POLICY "Authenticated users can read taxas"
ON public.taxas_gateway
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Inserir taxas padrão do Asaas
INSERT INTO public.taxas_gateway (metodo_pagamento, tipo_taxa, valor_taxa, descricao) VALUES
  ('pix', 'fixo', 0.99, 'Taxa fixa Asaas por recebimento via Pix'),
  ('credit_card', 'percentual', 2.99, 'Taxa percentual Asaas por recebimento via Cartão de Crédito'),
  ('debit_card', 'percentual', 1.49, 'Taxa percentual Asaas por recebimento via Cartão de Débito'),
  ('app', 'fixo', 0.00, 'Sem taxa para pagamentos internos via app');

-- ============================================
-- Atualizar calcular_saldo_barbeiro para descontar taxas
-- ============================================
CREATE OR REPLACE FUNCTION public.calcular_saldo_barbeiro(p_user_id uuid, p_barbeiro_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(saldo_disponivel numeric, saldo_processando numeric, total_entradas numeric, total_saques numeric, total_depositos numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- ENTRADAS: pagamentos pelo APP com desconto de taxas do gateway
  IF p_barbeiro_id IS NOT NULL THEN
    SELECT COALESCE(SUM(
      a.preco - CASE
        WHEN t.tipo_taxa = 'fixo' THEN COALESCE(t.valor_taxa, 0)
        WHEN t.tipo_taxa = 'percentual' THEN ROUND(a.preco * COALESCE(t.valor_taxa, 0) / 100, 2)
        ELSE 0
      END
    ), 0) INTO v_entradas
    FROM agendamentos a
    LEFT JOIN taxas_gateway t ON t.metodo_pagamento = a.payment_method AND t.ativo = true
    WHERE a.barbeiro_id = p_barbeiro_id
      AND a.status = 'completed'
      AND a.payment_method IN ('pix', 'credit_card', 'debit_card', 'app')
      AND a.created_at >= v_data_corte;
  ELSE
    -- Admin: todos os agendamentos pagos pelo app
    SELECT COALESCE(SUM(
      a.preco - CASE
        WHEN t.tipo_taxa = 'fixo' THEN COALESCE(t.valor_taxa, 0)
        WHEN t.tipo_taxa = 'percentual' THEN ROUND(a.preco * COALESCE(t.valor_taxa, 0) / 100, 2)
        ELSE 0
      END
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
$function$;

-- Atualizar validar_saque para usar a mesma lógica
-- (já chama calcular_saldo_barbeiro internamente, então herda automaticamente)
