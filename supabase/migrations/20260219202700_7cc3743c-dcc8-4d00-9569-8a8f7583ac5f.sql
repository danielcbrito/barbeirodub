
-- Activate the santos barber record in their own tenant
UPDATE barbeiros 
SET ativo = true, deleted_at = NULL
WHERE id = '716e8c8f-19d0-4e2f-93ea-b7128b859859' 
  AND tenant_id = 'e1df0a70-d316-4a5a-9174-edc28b9fce04';
