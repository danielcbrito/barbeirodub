-- Adicionar campos para webhook de disparo na tabela webhook_config
ALTER TABLE public.webhook_config 
ADD COLUMN IF NOT EXISTS disparo_webhook_url TEXT,
ADD COLUMN IF NOT EXISTS disparo_ativo BOOLEAN DEFAULT false;