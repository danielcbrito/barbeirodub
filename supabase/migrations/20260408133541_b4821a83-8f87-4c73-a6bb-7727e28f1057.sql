
-- Adicionar coluna unidade_id para bloqueios por unidade
ALTER TABLE client_booking_blocks
ADD COLUMN IF NOT EXISTS unidade_id UUID 
  REFERENCES tenant_unidades(id) ON DELETE CASCADE;

-- Índice para buscas por unidade
CREATE INDEX IF NOT EXISTS idx_cbb_unidade 
  ON client_booking_blocks(unidade_id)
  WHERE unidade_id IS NOT NULL;

-- Índice para buscas por tenant + cliente
CREATE INDEX IF NOT EXISTS idx_cbb_tenant_client
  ON client_booking_blocks(tenant_id, client_user_id);
