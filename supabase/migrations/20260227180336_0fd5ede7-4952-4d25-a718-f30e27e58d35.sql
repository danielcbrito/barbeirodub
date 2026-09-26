-- Remove Pedro's inherited WhatsApp record entirely (he never connected his own)
DELETE FROM public.whatsapp_instances
WHERE barbeiro_id = 'ee238642-bc38-4de6-ba86-9eed40262fc7';

-- Also make instance_name nullable for future flexibility
ALTER TABLE public.whatsapp_instances ALTER COLUMN instance_name DROP NOT NULL;