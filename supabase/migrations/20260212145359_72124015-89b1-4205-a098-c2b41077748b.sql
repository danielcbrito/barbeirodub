ALTER TABLE public.webhook_config
  ADD COLUMN IF NOT EXISTS lembrete_webhook_url text,
  ADD COLUMN IF NOT EXISTS lembrete_ativo boolean DEFAULT false;