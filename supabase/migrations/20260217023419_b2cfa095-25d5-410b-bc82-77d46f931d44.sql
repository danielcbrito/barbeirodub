
-- 1. Marcar TODOS os saques do Túlio como 'falhou' (estorno)
UPDATE public.saques 
SET status = 'falhou', 
    motivo_cancelamento = 'Estorno manual — limpeza de histórico pelo admin'
WHERE user_id = 'a46b3160-c1ca-478c-8a8b-68f50a82d27d'
  AND status = 'concluido';

-- 2. Deletar TODOS os saques do Túlio
DELETE FROM public.saques 
WHERE user_id = 'a46b3160-c1ca-478c-8a8b-68f50a82d27d';

-- 3. Deletar TODOS os depósitos do Túlio  
DELETE FROM public.depositos 
WHERE user_id = 'a46b3160-c1ca-478c-8a8b-68f50a82d27d';
