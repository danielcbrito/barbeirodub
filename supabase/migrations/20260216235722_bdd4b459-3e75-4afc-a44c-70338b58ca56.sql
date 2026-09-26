-- Corrigir saque 42cd103c que o Asaas reportou como TRANSFER_FAILED mas ficou "concluido" no app
UPDATE public.saques 
SET status = 'falhou', 
    motivo_cancelamento = 'Autorização externa recusada pelo Asaas (TRANSFER_FAILED)',
    processado_em = NULL,
    updated_at = now()
WHERE id = '42cd103c-a346-4467-9fa6-37e4c9e31ca9';