
-- 1. RESTAURAR CRÉDITO DO CLIENTE AFETADO
INSERT INTO creditos (user_id, valor, origem, agendamento_origem_id)
SELECT 
  a.user_id,
  p.valor,
  'cancelamento',
  a.id
FROM agendamentos a
INNER JOIN pagamentos p ON p.agendamento_id = a.id AND p.status = 'paid'
LEFT JOIN creditos c ON c.agendamento_origem_id = a.id AND c.origem = 'cancelamento'
WHERE a.status IN ('cancelled_by_user', 'cancelled_by_admin')
  AND c.id IS NULL;
