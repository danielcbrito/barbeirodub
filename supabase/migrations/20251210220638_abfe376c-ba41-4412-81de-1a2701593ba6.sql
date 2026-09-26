
-- Reverter agendamento do Kaique (16:30) para confirmed
UPDATE agendamentos 
SET status = 'confirmed', ponto_liberado = false, cliente_confirmou = false
WHERE id = '2ea9dcf2-290a-46ff-88c4-20320f0bd1bd';

-- Reverter agendamento do João Vitor (17:50) para confirmed  
UPDATE agendamentos 
SET status = 'confirmed', ponto_liberado = false, cliente_confirmou = false
WHERE id = '35e4629c-6d03-47f5-bc14-cc5a50f39731';

-- Decrementar ponto do Kaique (indevido)
UPDATE pontos SET pontos = GREATEST(pontos - 1, 0) WHERE user_id = '9135b3bf-ed0f-493d-b74c-1e3675d68616';

-- Decrementar ponto do João Vitor (indevido)
UPDATE pontos SET pontos = GREATEST(pontos - 1, 0) WHERE user_id = '6533e1b3-e674-4086-9662-b5770e1c3146';
