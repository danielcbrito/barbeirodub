
-- Remover constraint de unicidade no instance_name para permitir que múltiplos barbeiros
-- da mesma barbearia compartilhem a mesma instância WhatsApp física
ALTER TABLE public.whatsapp_instances DROP CONSTRAINT IF EXISTS whatsapp_instances_instance_name_key;
