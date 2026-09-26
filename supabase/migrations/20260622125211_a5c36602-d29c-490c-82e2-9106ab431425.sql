
ALTER TABLE public.barbeiros
  ADD COLUMN IF NOT EXISTS woovi_subaccount_name TEXT,
  ADD COLUMN IF NOT EXISTS woovi_pix_key_type TEXT,
  ADD COLUMN IF NOT EXISTS woovi_auto_withdraw_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS woovi_auto_withdraw_min_centavos INTEGER NOT NULL DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS woovi_last_auto_withdraw_at TIMESTAMPTZ;

COMMENT ON COLUMN public.barbeiros.woovi_pix_key_type IS 'cpf | cnpj | email | phone | random';
COMMENT ON COLUMN public.barbeiros.woovi_auto_withdraw_min_centavos IS 'Saldo mínimo (centavos) para disparar saque automático diário';
