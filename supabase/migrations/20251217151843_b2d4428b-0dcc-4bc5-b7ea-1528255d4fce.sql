-- Remover constraint antiga e adicionar nova com 'plano'
ALTER TABLE public.agendamentos 
DROP CONSTRAINT IF EXISTS agendamentos_tipo_agendamento_check;

ALTER TABLE public.agendamentos 
ADD CONSTRAINT agendamentos_tipo_agendamento_check 
CHECK (tipo_agendamento = ANY (ARRAY['normal'::text, 'encaixe_manual'::text, 'plano'::text]));