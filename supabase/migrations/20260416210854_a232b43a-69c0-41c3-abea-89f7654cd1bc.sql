
-- 1. Adicionar colunas necessárias na tabela pix_charges
ALTER TABLE public.pix_charges
  ADD COLUMN IF NOT EXISTS client_opened_bank_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_returned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS likely_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_confirmation_reason TEXT,
  ADD COLUMN IF NOT EXISTS late_payment BOOLEAN DEFAULT FALSE;

-- Atualizar enum/check do status para incluir novos estados
-- Como status é TEXT, não precisa alterar tipo. Apenas documentar valores válidos:
-- 'pending', 'em_verificacao', 'provavelmente_pago', 'paid', 'expired', 'cancelled', 'late_paid'

-- 2. Tabela de auditoria de decisões automáticas
CREATE TABLE IF NOT EXISTS public.pix_charge_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  charge_id UUID NOT NULL REFERENCES public.pix_charges(id) ON DELETE CASCADE,
  txid TEXT,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  decision_reason TEXT NOT NULL,
  heuristic_signals JSONB DEFAULT '{}'::jsonb,
  decided_by TEXT NOT NULL DEFAULT 'auto_worker',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pix_charge_audit_charge_id ON public.pix_charge_audit(charge_id);
CREATE INDEX IF NOT EXISTS idx_pix_charges_status_created ON public.pix_charges(status, created_at);

-- 3. RLS na tabela de auditoria
ALTER TABLE public.pix_charge_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem toda auditoria PIX"
  ON public.pix_charge_audit FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ti'));

CREATE POLICY "Barbeiros veem auditoria das próprias cobranças"
  ON public.pix_charge_audit FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pix_charges pc
    JOIN public.barbeiros b ON b.id = pc.barbeiro_id
    WHERE pc.id = pix_charge_audit.charge_id
      AND b.user_id = auth.uid()
  ));

-- Inserts apenas via service_role (worker)
-- Nenhuma policy de INSERT pública.

-- 4. Função RPC para o cliente sinalizar abertura do banco
CREATE OR REPLACE FUNCTION public.pix_signal_bank_opened(p_charge_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.pix_charges
  SET client_opened_bank_at = COALESCE(client_opened_bank_at, now()),
      updated_at = now()
  WHERE id = p_charge_id
    AND user_id = auth.uid()
    AND status IN ('pending', 'em_verificacao', 'provavelmente_pago');
END;
$$;

-- 5. Função RPC para o cliente sinalizar retorno ao app
CREATE OR REPLACE FUNCTION public.pix_signal_returned_to_app(p_charge_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.pix_charges
  SET client_returned_at = COALESCE(client_returned_at, now()),
      updated_at = now()
  WHERE id = p_charge_id
    AND user_id = auth.uid()
    AND status IN ('pending', 'em_verificacao', 'provavelmente_pago');
END;
$$;
