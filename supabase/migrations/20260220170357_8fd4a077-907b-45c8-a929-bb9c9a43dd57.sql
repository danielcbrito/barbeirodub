-- Fix: barbeiros_public view must only show DUB global barbers (tenant_id IS NULL)
-- Tenant barbers should NOT appear in the client-facing app
CREATE OR REPLACE VIEW public.barbeiros_public AS
SELECT id, apelido, foto_url, ativo
FROM barbeiros
WHERE ativo = true
  AND deleted_at IS NULL
  AND tenant_id IS NULL;