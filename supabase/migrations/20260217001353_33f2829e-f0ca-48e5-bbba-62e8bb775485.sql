
-- Adicionar campos de subconta Asaas na tabela barbeiros
ALTER TABLE public.barbeiros 
ADD COLUMN IF NOT EXISTS asaas_account_id TEXT,
ADD COLUMN IF NOT EXISTS asaas_wallet_id TEXT;

-- Comentários para documentação
COMMENT ON COLUMN public.barbeiros.asaas_account_id IS 'ID da subconta do barbeiro no Asaas (marketplace)';
COMMENT ON COLUMN public.barbeiros.asaas_wallet_id IS 'Wallet ID da subconta do barbeiro no Asaas para split de pagamentos';
