
-- Inserir instância WhatsApp da Barbearia DUB para Tulio
INSERT INTO public.whatsapp_instances (barbeiro_id, instance_name, api_key, status, connected_at)
VALUES (
  '767c51a7-7323-4933-8fc5-9a666f6baa7c',
  'testes',
  'B48087EAF9C1-4FB4-9FBF-87349E902592',
  'connected',
  now()
)
ON CONFLICT (barbeiro_id) DO UPDATE SET
  instance_name = EXCLUDED.instance_name,
  api_key = EXCLUDED.api_key,
  status = EXCLUDED.status,
  connected_at = EXCLUDED.connected_at,
  updated_at = now();

-- Inserir instância WhatsApp da Barbearia DUB para Pedro Santos
INSERT INTO public.whatsapp_instances (barbeiro_id, instance_name, api_key, status, connected_at)
VALUES (
  'ee238642-bc38-4de6-ba86-9eed40262fc7',
  'testes',
  'B48087EAF9C1-4FB4-9FBF-87349E902592',
  'connected',
  now()
)
ON CONFLICT (barbeiro_id) DO UPDATE SET
  instance_name = EXCLUDED.instance_name,
  api_key = EXCLUDED.api_key,
  status = EXCLUDED.status,
  connected_at = EXCLUDED.connected_at,
  updated_at = now();
