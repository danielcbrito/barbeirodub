INSERT INTO public.depositos (user_id, valor, status, confirmado_em)
VALUES ('a46b3160-c1ca-478c-8a8b-68f50a82d27d', 38.00, 'confirmado', now());

-- Remover o crédito errado que foi inserido antes
DELETE FROM public.creditos 
WHERE user_id = 'a46b3160-c1ca-478c-8a8b-68f50a82d27d' 
  AND valor = 38.00 
  AND origem = 'promocao'
  AND created_at >= '2026-02-16 23:00:00';