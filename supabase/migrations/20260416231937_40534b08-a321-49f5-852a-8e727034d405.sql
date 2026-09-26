-- ============================================
-- MIGRAÇÃO ASAAS → EFÍ BANK (Fase 1: Banco)
-- Modelo B1: DUB recebe + repasse PIX automático
-- ============================================

-- 1. Tabela de cobranças PIX criadas na Efí
CREATE TABLE IF NOT EXISTS public.efi_pix_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  txid TEXT NOT NULL UNIQUE,
  loc_id BIGINT,
  br_code TEXT,
  qr_code_image TEXT,
  valor NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  barbeiro_id UUID NOT NULL REFERENCES public.barbeiros(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL,
  chave_pix_destino TEXT NOT NULL,
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'PENDENTE'
    CHECK (status IN ('PENDENTE','PAGO','EXPIRADO','CANCELADO','ERRO')),
  expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  e2e_id TEXT,
  raw_charge JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_efi_charges_barbeiro ON public.efi_pix_charges(barbeiro_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_efi_charges_status ON public.efi_pix_charges(status);
CREATE INDEX IF NOT EXISTS idx_efi_charges_user ON public.efi_pix_charges(user_id, created_at DESC);

-- 2. Tabela de repasses PIX (DUB → barbeiro)
CREATE TABLE IF NOT EXISTS public.efi_pix_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id UUID NOT NULL REFERENCES public.efi_pix_charges(id) ON DELETE RESTRICT,
  barbeiro_id UUID NOT NULL REFERENCES public.barbeiros(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL UNIQUE,
  efi_id_envio TEXT,
  e2e_id TEXT,
  chave_pix_destino TEXT NOT NULL,
  valor NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  status TEXT NOT NULL DEFAULT 'PENDENTE'
    CHECK (status IN ('PENDENTE','PROCESSANDO','CONCLUIDO','FALHOU')),
  error_message TEXT,
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_efi_payouts_barbeiro ON public.efi_pix_payouts(barbeiro_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_efi_payouts_charge ON public.efi_pix_payouts(charge_id);
CREATE INDEX IF NOT EXISTS idx_efi_payouts_status ON public.efi_pix_payouts(status);

-- 3. Idempotência de webhooks Efí
CREATE TABLE IF NOT EXISTS public.efi_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_signature TEXT NOT NULL UNIQUE, -- hash do payload (txid + e2eId + valor)
  txid TEXT,
  e2e_id TEXT,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_efi_webhook_txid ON public.efi_webhook_events(txid);

-- 4. Triggers de updated_at
DROP TRIGGER IF EXISTS trg_efi_charges_updated ON public.efi_pix_charges;
CREATE TRIGGER trg_efi_charges_updated BEFORE UPDATE ON public.efi_pix_charges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_efi_payouts_updated ON public.efi_pix_payouts;
CREATE TRIGGER trg_efi_payouts_updated BEFORE UPDATE ON public.efi_pix_payouts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. RLS
ALTER TABLE public.efi_pix_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.efi_pix_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.efi_webhook_events ENABLE ROW LEVEL SECURITY;

-- Cobranças: barbeiro vê as suas; cliente vê as que criou; admin/ti veem tudo
CREATE POLICY "Barbeiro vê suas cobranças Efí"
  ON public.efi_pix_charges FOR SELECT
  USING (
    barbeiro_id IN (SELECT id FROM public.barbeiros WHERE user_id = auth.uid())
    OR user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'ti')
  );

CREATE POLICY "Sistema insere cobranças (via edge fn)"
  ON public.efi_pix_charges FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Sistema atualiza cobranças (via edge fn)"
  ON public.efi_pix_charges FOR UPDATE
  USING (true);

-- Payouts: barbeiro vê os seus; admin/ti veem tudo
CREATE POLICY "Barbeiro vê seus repasses"
  ON public.efi_pix_payouts FOR SELECT
  USING (
    barbeiro_id IN (SELECT id FROM public.barbeiros WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'ti')
  );

CREATE POLICY "Sistema gerencia repasses"
  ON public.efi_pix_payouts FOR ALL
  USING (true) WITH CHECK (true);

-- Webhook events: apenas admin/ti
CREATE POLICY "Admin/TI vê eventos webhook"
  ON public.efi_webhook_events FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ti'));

CREATE POLICY "Sistema insere eventos webhook"
  ON public.efi_webhook_events FOR INSERT
  WITH CHECK (true);

-- 6. View: extrato consolidado por barbeiro (recebido + repassado)
CREATE OR REPLACE VIEW public.efi_barbeiro_extrato AS
SELECT
  c.barbeiro_id,
  c.id AS charge_id,
  c.txid,
  c.valor AS valor_recebido,
  c.status AS charge_status,
  c.descricao,
  c.created_at AS recebido_em,
  c.paid_at,
  p.id AS payout_id,
  p.valor AS valor_repassado,
  p.status AS payout_status,
  p.completed_at AS repassado_em,
  p.error_message AS payout_erro
FROM public.efi_pix_charges c
LEFT JOIN public.efi_pix_payouts p ON p.charge_id = c.id;