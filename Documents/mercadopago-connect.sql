-- Mercado Pago Connect: rodar uma vez no SQL Editor do Supabase.
ALTER TABLE public.barber_payment_accounts ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'woovi';
ALTER TABLE public.barber_payment_accounts ALTER COLUMN full_name DROP NOT NULL;
CREATE TABLE IF NOT EXISTS public.barber_mp_credentials (
  barbeiro_id uuid PRIMARY KEY REFERENCES public.barbeiros(id) ON DELETE CASCADE,
  mp_user_id text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.barber_mp_credentials FROM anon, authenticated;
GRANT ALL ON public.barber_mp_credentials TO service_role;
ALTER TABLE public.barber_mp_credentials ENABLE ROW LEVEL SECURITY;
