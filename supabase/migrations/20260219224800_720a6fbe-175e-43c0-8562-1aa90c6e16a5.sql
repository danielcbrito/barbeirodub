-- Atualizar taxa do Pix para o valor pós-promoção (promoção expirou em 16/02/2026)
UPDATE taxas_gateway 
SET taxa_fixa = 1.99, 
    valor_taxa = 1.99, 
    descricao = 'Taxa Asaas: R$ 1,99 por recebimento via Pix',
    updated_at = now()
WHERE metodo_pagamento = 'pix' AND ativo = true;