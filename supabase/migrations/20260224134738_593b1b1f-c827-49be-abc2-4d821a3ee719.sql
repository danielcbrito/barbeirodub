-- Atualizar marco zero para hoje, zerando histórico antigo já sacado
UPDATE financeiro_marco_zero 
SET data_corte = '2026-02-24T00:00:00+00:00'
WHERE id = '2212f334-e6c3-4665-8d6f-017d90fdc3a6';