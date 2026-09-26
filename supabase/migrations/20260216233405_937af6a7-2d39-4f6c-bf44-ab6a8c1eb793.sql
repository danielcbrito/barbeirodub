-- Corrigir saque que falhou no Asaas mas está como concluido no app
UPDATE public.saques 
SET status = 'falhou', 
    motivo_cancelamento = 'Autorização externa recusada pelo Asaas',
    processado_em = NULL,
    updated_at = now()
WHERE id = '09d8b642-9391-4515-94dc-a04db8a27ec9';