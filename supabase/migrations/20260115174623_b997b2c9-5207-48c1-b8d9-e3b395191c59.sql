-- =====================================================
-- ISOLAMENTO DEFINITIVO DE AGENDAMENTOS POR BARBEIRO
-- =====================================================
-- Remove a policy que permite barbeiros verem TODOS os agendamentos
-- e mantém apenas a policy que filtra por barbeiro_id

-- 1. Remover a policy problemática (barbeiros vendo tudo)
DROP POLICY IF EXISTS "Admins and barbers can view all appointments" ON public.agendamentos;

-- 2. Garantir que a policy de barbeiro existe e está correta
-- (já existe, mas vamos recriar para garantir)
DROP POLICY IF EXISTS "Barber can view own appointments" ON public.agendamentos;

CREATE POLICY "Barber can view own appointments"
ON public.agendamentos
FOR SELECT
TO authenticated
USING (
  barbeiro_id IN (
    SELECT id FROM barbeiros WHERE user_id = auth.uid()
  )
);

-- 3. Garantir que admins ainda podem ver tudo
DROP POLICY IF EXISTS "Admins can view all appointments" ON public.agendamentos;

CREATE POLICY "Admins can view all appointments"
ON public.agendamentos
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
);

-- 4. Manter a policy de usuários verem seus próprios agendamentos
-- (já existe: "Users can view own appointments")
