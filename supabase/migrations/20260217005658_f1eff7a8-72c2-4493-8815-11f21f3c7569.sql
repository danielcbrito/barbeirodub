
-- Adicionar campo para armazenar a API key da subconta Asaas do barbeiro
-- Isso é necessário para que saques sejam feitos diretamente da subconta
ALTER TABLE public.barbeiros_private
ADD COLUMN IF NOT EXISTS asaas_api_key TEXT;

-- Comentário de segurança
COMMENT ON COLUMN public.barbeiros_private.asaas_api_key IS 'API key da subconta Asaas do barbeiro (gerada na criação da subconta). Usada para transferências/saques.';
