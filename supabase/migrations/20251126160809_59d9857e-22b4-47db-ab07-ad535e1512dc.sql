-- Adjust foreign keys to allow deleting services and plans with cascading behavior

-- 1) Drop existing foreign key from agendamentos.servico_id
ALTER TABLE public.agendamentos
  DROP CONSTRAINT IF EXISTS agendamentos_servico_id_fkey;

-- Recreate with ON DELETE CASCADE so related appointments are removed when a service is deleted
ALTER TABLE public.agendamentos
  ADD CONSTRAINT agendamentos_servico_id_fkey
  FOREIGN KEY (servico_id)
  REFERENCES public.servicos(id)
  ON DELETE CASCADE;

-- 2) Drop existing foreign key from assinaturas.plano_id
ALTER TABLE public.assinaturas
  DROP CONSTRAINT IF EXISTS assinaturas_plano_id_fkey;

-- Recreate with ON DELETE CASCADE so related subscriptions are removed when a plan is deleted
ALTER TABLE public.assinaturas
  ADD CONSTRAINT assinaturas_plano_id_fkey
  FOREIGN KEY (plano_id)
  REFERENCES public.planos(id)
  ON DELETE CASCADE;