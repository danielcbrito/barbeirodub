
-- ═══════════════════════════════════════════════════
-- Tabela de faixas de preço por quantidade de barbeiros
-- ═══════════════════════════════════════════════════
CREATE TABLE public.tenant_plano_faixas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plano_id uuid NOT NULL REFERENCES public.tenant_planos(id) ON DELETE CASCADE,
  min_barbeiros int NOT NULL DEFAULT 1,
  max_barbeiros int, -- NULL = ilimitado
  preco_cheio numeric(10,2) NOT NULL,
  preco_promocional numeric(10,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Inserir faixas para o plano default
INSERT INTO public.tenant_plano_faixas (plano_id, min_barbeiros, max_barbeiros, preco_cheio, preco_promocional)
SELECT id, 1, 1, 49.90, 49.90 FROM public.tenant_planos WHERE destaque = true LIMIT 1;

INSERT INTO public.tenant_plano_faixas (plano_id, min_barbeiros, max_barbeiros, preco_cheio, preco_promocional)
SELECT id, 2, 2, 99.80, 79.90 FROM public.tenant_planos WHERE destaque = true LIMIT 1;

INSERT INTO public.tenant_plano_faixas (plano_id, min_barbeiros, max_barbeiros, preco_cheio, preco_promocional)
SELECT id, 3, 3, 149.70, 109.90 FROM public.tenant_planos WHERE destaque = true LIMIT 1;

INSERT INTO public.tenant_plano_faixas (plano_id, min_barbeiros, max_barbeiros, preco_cheio, preco_promocional)
SELECT id, 4, 4, 199.60, 129.90 FROM public.tenant_planos WHERE destaque = true LIMIT 1;

INSERT INTO public.tenant_plano_faixas (plano_id, min_barbeiros, max_barbeiros, preco_cheio, preco_promocional)
SELECT id, 5, NULL, 249.50, 149.90 FROM public.tenant_planos WHERE destaque = true LIMIT 1;

-- RLS
ALTER TABLE public.tenant_plano_faixas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Qualquer um pode ler faixas de preço"
  ON public.tenant_plano_faixas FOR SELECT
  USING (true);

-- ═══════════════════════════════════════════════════
-- Adicionar campos Cakto na tabela de assinaturas do tenant
-- ═══════════════════════════════════════════════════
ALTER TABLE public.tenant_assinaturas
  ADD COLUMN IF NOT EXISTS cakto_order_id text,
  ADD COLUMN IF NOT EXISTS cakto_subscription_id text,
  ADD COLUMN IF NOT EXISTS cakto_customer_email text,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS qtd_barbeiros int NOT NULL DEFAULT 1;

-- Log de eventos Cakto para auditoria
CREATE TABLE public.tenant_cakto_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id),
  event_type text NOT NULL,
  cakto_order_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_cakto_events ENABLE ROW LEVEL SECURITY;

-- Apenas service_role pode inserir (via edge function)
CREATE POLICY "Service role manages cakto events"
  ON public.tenant_cakto_events
  FOR ALL USING (true) WITH CHECK (true);
