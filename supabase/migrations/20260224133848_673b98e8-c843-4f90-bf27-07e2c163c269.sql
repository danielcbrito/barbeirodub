-- Adicionar depósito de R$ 27,00 confirmado na carteira do Túlio
INSERT INTO depositos (user_id, barbeiro_id, valor, status, confirmado_em)
VALUES (
  'a46b3160-c1ca-478c-8a8b-68f50a82d27d',
  '767c51a7-7323-4933-8fc5-9a666f6baa7c',
  27.00,
  'confirmado',
  now()
);