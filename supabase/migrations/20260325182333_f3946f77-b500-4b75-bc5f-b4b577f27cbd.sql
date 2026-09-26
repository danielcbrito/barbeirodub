
-- ═══════════════════════════════════════════════════════════
-- PASSO 2: Adicionar colunas de ciclo à tabela assinaturas
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.assinaturas
  ADD COLUMN IF NOT EXISTS ciclo_inicio DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS ciclo_fim DATE DEFAULT (CURRENT_DATE + INTERVAL '30 days'),
  ADD COLUMN IF NOT EXISTS usos_ciclo_atual INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_renovacoes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS renovada_antecipadamente BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.assinaturas.ciclo_inicio IS 'Data em que o ciclo atual começou';
COMMENT ON COLUMN public.assinaturas.ciclo_fim IS 'Data em que o ciclo atual termina (ciclo_inicio + 30 dias)';
COMMENT ON COLUMN public.assinaturas.usos_ciclo_atual IS 'Quantos dos serviços do plano já foram usados neste ciclo';
COMMENT ON COLUMN public.assinaturas.total_renovacoes IS 'Contador histórico de renovações do cliente';
COMMENT ON COLUMN public.assinaturas.renovada_antecipadamente IS 'True se o cliente renovou antes do fim do ciclo';

-- Preencher ciclo_inicio/ciclo_fim para assinaturas ativas existentes
UPDATE public.assinaturas
SET
  ciclo_inicio = COALESCE(next_billing_date - INTERVAL '30 days', created_at::date),
  ciclo_fim = COALESCE(next_billing_date, (created_at + INTERVAL '30 days')::date)
WHERE status IN ('active', 'pending_cash', 'suspended');

-- Preencher usos_ciclo_atual com contagem real de plano_agendamentos_usos
UPDATE public.assinaturas a
SET usos_ciclo_atual = sub.cnt
FROM (
  SELECT pau.assinatura_id, COUNT(*) AS cnt
  FROM public.plano_agendamentos_usos pau
  WHERE pau.released_at IS NULL
  GROUP BY pau.assinatura_id
) sub
WHERE a.id = sub.assinatura_id;
