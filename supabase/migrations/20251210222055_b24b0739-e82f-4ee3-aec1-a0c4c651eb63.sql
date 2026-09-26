
-- Inserir notificações de confirmação para todos os agendamentos confirmados sem notificação
INSERT INTO notificacoes (user_id, agendamento_id, titulo, mensagem, tipo, lida)
SELECT 
  a.user_id,
  a.id,
  'Agendamento Confirmado ✓',
  'Seu agendamento para ' || s.nome || ' no dia ' || TO_CHAR(a.data, 'DD/MM') || ' às ' || TO_CHAR(a.hora, 'HH24:MI') || ' foi confirmado pelo barbeiro. Te esperamos!',
  'geral',
  false
FROM agendamentos a
JOIN servicos s ON a.servico_id = s.id
WHERE a.barbeiro_confirmou = true
  AND a.status IN ('confirmed', 'pending')
  AND a.data >= CURRENT_DATE
  AND NOT EXISTS (
    SELECT 1 FROM notificacoes n 
    WHERE n.agendamento_id = a.id 
    AND n.titulo LIKE '%Confirmado%'
  );
