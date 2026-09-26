-- Adicionar campo para webhook dedicado de WhatsApp na tabela webhook_config
ALTER TABLE public.webhook_config 
ADD COLUMN IF NOT EXISTS whatsapp_webhook_url TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_ativo BOOLEAN DEFAULT true;