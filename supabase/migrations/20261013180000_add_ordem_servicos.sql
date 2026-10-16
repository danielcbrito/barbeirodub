-- Adiciona coluna de ordem para organizacao personalizada de servicos e planos
ALTER TABLE public.servicos ADD COLUMN IF NOT EXISTS ordem integer DEFAULT 0;
ALTER TABLE public.planos ADD COLUMN IF NOT EXISTS ordem integer DEFAULT 0;

-- Indices para otimizar busca ordenada
CREATE INDEX IF NOT EXISTS idx_servicos_ordem ON public.servicos(tenant_id, ordem);
CREATE INDEX IF NOT EXISTS idx_planos_ordem ON public.planos(tenant_id, ordem);
