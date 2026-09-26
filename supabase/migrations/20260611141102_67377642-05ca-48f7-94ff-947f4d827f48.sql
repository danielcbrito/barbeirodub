-- Primeiro, removemos a política antiga para recriá-la com as permissões corretas
DROP POLICY IF EXISTS "Admins can create appointments for any user" ON public.agendamentos;

-- Criamos a nova política com escopo ampliado para barbeiros do mesmo tenant
CREATE POLICY "Admins and Barbers can create appointments" ON public.agendamentos
FOR INSERT TO authenticated
WITH CHECK (
  -- Caso 1: Usuário é admin global
  has_role(auth.uid(), 'admin'::app_role)
  OR 
  -- Caso 2: Usuário é o próprio barbeiro do agendamento
  (barbeiro_id IN (SELECT id FROM public.barbeiros WHERE user_id = auth.uid()))
  OR
  -- Caso 3: Usuário é um barbeiro ativo do MESMO tenant (Barbeiro de outra unidade ou admin de unidade)
  EXISTS (
    SELECT 1 FROM public.barbeiros b_auth
    JOIN public.barbeiros b_target ON b_auth.tenant_id = b_target.tenant_id
    WHERE b_auth.user_id = auth.uid()
      AND b_auth.ativo = true
      AND b_target.id = agendamentos.barbeiro_id
  )
  OR
  -- Caso 4: Usuário é o dono do tenant (Tenant Admin)
  EXISTS (
    SELECT 1 FROM public.tenants t
    JOIN public.barbeiros b ON t.id = b.tenant_id
    WHERE t.owner_user_id = auth.uid()
      AND b.id = agendamentos.barbeiro_id
  )
);

-- Garantir que as permissões de SELECT também cubram os barbeiros do tenant para validações
DROP POLICY IF EXISTS "Barber can view own appointments" ON public.agendamentos;
CREATE POLICY "Barbers can view tenant appointments" ON public.agendamentos
FOR SELECT TO authenticated
USING (
  (auth.uid() = user_id) -- O próprio cliente
  OR
  (barbeiro_id IN (SELECT id FROM public.barbeiros WHERE user_id = auth.uid())) -- O barbeiro direto
  OR
  EXISTS ( -- Barbeiros do mesmo tenant
    SELECT 1 FROM public.barbeiros b_auth
    JOIN public.barbeiros b_target ON b_auth.tenant_id = b_target.tenant_id
    WHERE b_auth.user_id = auth.uid()
      AND b_auth.ativo = true
      AND b_target.id = agendamentos.barbeiro_id
  )
  OR
  EXISTS ( -- Dono do tenant
    SELECT 1 FROM public.tenants t
    JOIN public.barbeiros b ON t.id = b.tenant_id
    WHERE t.owner_user_id = auth.uid()
      AND b.id = agendamentos.barbeiro_id
  )
  OR
  has_role(auth.uid(), 'admin'::app_role) -- Admin global
);