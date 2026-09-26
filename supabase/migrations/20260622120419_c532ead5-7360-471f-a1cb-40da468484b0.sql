
ALTER TABLE public.barbeiros ADD COLUMN IF NOT EXISTS woovi_pix_key TEXT;

CREATE TABLE IF NOT EXISTS public.woovi_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id UUID REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  barbeiro_id UUID REFERENCES public.barbeiros(id) ON DELETE SET NULL,
  correlation_id TEXT UNIQUE NOT NULL,
  charge_id TEXT,
  br_code TEXT,
  qr_code_image TEXT,
  value_centavos INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  paid_at TIMESTAMPTZ,
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.woovi_charges TO authenticated;
GRANT ALL ON public.woovi_charges TO service_role;

ALTER TABLE public.woovi_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Barbeiro vê suas próprias charges Woovi"
  ON public.woovi_charges
  FOR SELECT
  TO authenticated
  USING (
    barbeiro_id IN (SELECT id FROM public.barbeiros WHERE user_id = auth.uid())
  );

CREATE POLICY "Service role gerencia charges Woovi"
  ON public.woovi_charges
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_woovi_charges_agendamento ON public.woovi_charges(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_woovi_charges_barbeiro ON public.woovi_charges(barbeiro_id);
CREATE INDEX IF NOT EXISTS idx_woovi_charges_status ON public.woovi_charges(status);

CREATE TRIGGER update_woovi_charges_updated_at
  BEFORE UPDATE ON public.woovi_charges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
