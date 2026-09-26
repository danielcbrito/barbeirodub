
-- Reverter agendamento do Willy (12/12 às 12:00) para confirmed
UPDATE agendamentos 
SET status = 'confirmed', ponto_liberado = false, cliente_confirmou = false, barbeiro_confirmou = false
WHERE id = '7ac2b9de-2332-4b76-944e-fd36d980c6c0';

-- Reverter agendamento do Wesley (13/12 às 11:40) para confirmed  
UPDATE agendamentos 
SET status = 'confirmed', ponto_liberado = false, cliente_confirmou = false, barbeiro_confirmou = false
WHERE id = '0e667db2-fb01-4005-a981-db799ee0bbe8';

-- Decrementar ponto do Willy (indevido)
UPDATE pontos SET pontos = GREATEST(pontos - 1, 0) WHERE user_id = '9188c9a2-612e-4365-a732-e37391ba62fc';

-- Decrementar ponto do Wesley (indevido)
UPDATE pontos SET pontos = GREATEST(pontos - 1, 0) WHERE user_id = '1df68856-f84b-4c03-a0c6-57d7d02c145b';
