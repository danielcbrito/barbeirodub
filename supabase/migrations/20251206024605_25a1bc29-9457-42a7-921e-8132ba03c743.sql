-- Restaurar créditos do Edson de Melo para os 7 agendamentos cancelados que usaram crédito
-- user_id: 0465ba6b-6c74-42f3-8e85-b0ffb862b9b7

-- Inserir estornos para cada agendamento cancelado que usou crédito
INSERT INTO public.creditos (user_id, valor, origem, agendamento_origem_id, usado)
VALUES 
  -- 25b3c89d-2c5a-43e4-844d-28ed6054fb03 - 2025-12-19 14:00
  ('0465ba6b-6c74-42f3-8e85-b0ffb862b9b7', 25, 'estorno_cancelamento', '25b3c89d-2c5a-43e4-844d-28ed6054fb03', false),
  -- d7a0caaa-26be-459b-8300-f4a288e8e155 - 2025-12-17 14:40
  ('0465ba6b-6c74-42f3-8e85-b0ffb862b9b7', 25, 'estorno_cancelamento', 'd7a0caaa-26be-459b-8300-f4a288e8e155', false),
  -- 2e462f38-8231-4c45-a5e5-cecf72774c3d - 2025-12-17 16:10
  ('0465ba6b-6c74-42f3-8e85-b0ffb862b9b7', 25, 'estorno_cancelamento', '2e462f38-8231-4c45-a5e5-cecf72774c3d', false),
  -- 1d6083ed-b380-4aad-946d-73a44ac6cff7 - 2025-12-17 16:10
  ('0465ba6b-6c74-42f3-8e85-b0ffb862b9b7', 25, 'estorno_cancelamento', '1d6083ed-b380-4aad-946d-73a44ac6cff7', false),
  -- a6ff2d93-ccf2-410f-a2ff-27d284792454 - 2025-12-17 16:40
  ('0465ba6b-6c74-42f3-8e85-b0ffb862b9b7', 25, 'estorno_cancelamento', 'a6ff2d93-ccf2-410f-a2ff-27d284792454', false),
  -- 5f1d6bc2-00eb-4a04-ac0a-e4942db411bb - 2025-12-17 16:00
  ('0465ba6b-6c74-42f3-8e85-b0ffb862b9b7', 25, 'estorno_cancelamento', '5f1d6bc2-00eb-4a04-ac0a-e4942db411bb', false),
  -- 238b3c74-a6f8-48af-8077-525609caeb73 - 2025-12-17 16:40
  ('0465ba6b-6c74-42f3-8e85-b0ffb862b9b7', 25, 'estorno_cancelamento', '238b3c74-a6f8-48af-8077-525609caeb73', false);