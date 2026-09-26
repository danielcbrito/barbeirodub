-- Adicionar campo para solicitação de remarcação
ALTER TABLE public.agendamentos
ADD COLUMN remarcacao_solicitada boolean DEFAULT false,
ADD COLUMN motivo_remarcacao text;

-- Comentários explicativos
COMMENT ON COLUMN public.agendamentos.remarcacao_solicitada IS 'Indica se o barbeiro solicitou remarcação deste agendamento';
COMMENT ON COLUMN public.agendamentos.motivo_remarcacao IS 'Motivo informado pelo barbeiro para a solicitação de remarcação';