-- Adjust foreign key so deleting an appointment also removes related payments
ALTER TABLE public.pagamentos
  DROP CONSTRAINT IF EXISTS pagamentos_agendamento_id_fkey;

ALTER TABLE public.pagamentos
  ADD CONSTRAINT pagamentos_agendamento_id_fkey
  FOREIGN KEY (agendamento_id)
  REFERENCES public.agendamentos(id)
  ON DELETE CASCADE;