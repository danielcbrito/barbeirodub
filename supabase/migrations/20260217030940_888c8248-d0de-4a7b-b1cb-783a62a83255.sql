-- Adicionar barbeiro_id à tabela de assinaturas
ALTER TABLE public.assinaturas
ADD COLUMN barbeiro_id UUID REFERENCES public.barbeiros(id);

-- Index para queries por barbeiro
CREATE INDEX idx_assinaturas_barbeiro_id ON public.assinaturas(barbeiro_id);

-- Comentário
COMMENT ON COLUMN public.assinaturas.barbeiro_id IS 'Barbeiro escolhido pelo cliente para a assinatura. O pagamento é direcionado à subconta Asaas deste barbeiro.';