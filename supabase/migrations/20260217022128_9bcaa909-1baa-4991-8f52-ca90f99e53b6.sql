-- Reverter o saque incorreto do Orlando
UPDATE saques SET status = 'falhou', motivo_cancelamento = 'Estorno manual — registro incorreto' WHERE id = '280584d7-bd1f-445c-b6fe-4b13b71a80aa';

-- Criar depósito confirmado de R$40 para o Orlando
INSERT INTO depositos (user_id, barbeiro_id, valor, status, confirmado_em)
VALUES ('070cdd3b-83cf-41b1-bf67-e0295515e9e1', 'cb5d06ae-8254-4290-a9d1-60369c249dc5', 40, 'confirmado', now());