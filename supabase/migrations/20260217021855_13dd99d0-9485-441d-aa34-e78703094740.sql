-- Reverter saque de R$42 do Túlio
UPDATE saques SET status = 'falhou', motivo_cancelamento = 'Estorno manual — saque revertido pelo admin' WHERE id = '9458b7c8-c0db-494a-a23d-0f7060298175';

-- Criar saque concluído de R$40 para Orlando
INSERT INTO saques (user_id, barbeiro_id, valor, chave_pix_valor, chave_pix_tipo, status, processado_em)
VALUES ('070cdd3b-83cf-41b1-bf67-e0295515e9e1', 'cb5d06ae-8254-4290-a9d1-60369c249dc5', 40, 'Manual admin', 'manual', 'concluido', now());