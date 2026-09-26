
-- ============================================================
-- 1) PROFILES: escopar tenant_admin ao próprio tenant
-- ============================================================

-- Helper: perfis "visíveis" ao tenant do usuário logado
CREATE OR REPLACE FUNCTION public.profile_visible_to_tenant_admin(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- 1) O próprio perfil
    SELECT 1 WHERE p_profile_id = auth.uid()
  ) OR EXISTS (
    -- 2) Barbeiros do mesmo tenant do admin logado
    SELECT 1
    FROM public.barbeiros b_target
    JOIN public.tenants t ON t.id = b_target.tenant_id
    WHERE b_target.user_id = p_profile_id
      AND t.owner_user_id = auth.uid()
  ) OR EXISTS (
    -- 3) Membros do mesmo tenant
    SELECT 1
    FROM public.tenant_members tm_target
    JOIN public.tenants t ON t.id = tm_target.tenant_id
    WHERE tm_target.user_id = p_profile_id
      AND t.owner_user_id = auth.uid()
  ) OR EXISTS (
    -- 4) Clientes que agendaram com barbeiros do tenant do admin logado
    SELECT 1
    FROM public.agendamentos a
    JOIN public.barbeiros b ON b.id = a.barbeiro_id
    JOIN public.tenants t ON t.id = b.tenant_id
    WHERE a.user_id = p_profile_id
      AND t.owner_user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "Tenant admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Barbers can view profiles of their clients" ON public.profiles;

CREATE POLICY "Tenant admins view profiles in their tenant"
ON public.profiles
FOR SELECT
USING (
  public.has_role(auth.uid(), 'tenant_admin'::app_role)
  AND public.profile_visible_to_tenant_admin(id)
);

CREATE POLICY "Barbers and users can view relevant profiles"
ON public.profiles
FOR SELECT
USING (
  -- próprio perfil
  id = auth.uid()
  OR
  -- barbeiro vê clientes que agendaram com ele
  EXISTS (
    SELECT 1
    FROM public.agendamentos a
    JOIN public.barbeiros b ON b.id = a.barbeiro_id
    WHERE a.user_id = profiles.id
      AND b.user_id = auth.uid()
  )
);

-- ============================================================
-- 2) configuracoes_horario: remover write de tenant_admin
--    (é a tabela de padrões GLOBAIS do sistema, sem tenant_id)
-- ============================================================
DROP POLICY IF EXISTS "Tenant admins podem gerenciar configurações" ON public.configuracoes_horario;

-- ============================================================
-- 3) INDICACOES / CREDITOS_INDICACAO: sem tenant_id → 
--    remover visão global de tenant_admin e barber
-- ============================================================
DROP POLICY IF EXISTS "Staff ve todas indicacoes" ON public.indicacoes;
CREATE POLICY "Super admin ve todas indicacoes"
ON public.indicacoes
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'ti'::app_role)
);

DROP POLICY IF EXISTS "Staff ve todos creditos" ON public.creditos_indicacao;
CREATE POLICY "Super admin ve todos creditos"
ON public.creditos_indicacao
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'ti'::app_role)
);

-- ============================================================
-- 4) CICLOS_INDICACAO: já tem tenant_id → escopar por tenant
-- ============================================================
DROP POLICY IF EXISTS "Autenticados podem ver ciclos" ON public.ciclos_indicacao;
DROP POLICY IF EXISTS "Admin atualiza ciclos" ON public.ciclos_indicacao;
DROP POLICY IF EXISTS "Admin cria ciclos" ON public.ciclos_indicacao;

CREATE POLICY "Super admin ve todos ciclos"
ON public.ciclos_indicacao
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'ti'::app_role)
);

CREATE POLICY "Tenant staff ve ciclos do proprio tenant"
ON public.ciclos_indicacao
FOR SELECT
USING (
  tenant_id IS NOT NULL
  AND tenant_id IN (
    SELECT id FROM public.tenants WHERE owner_user_id = auth.uid()
    UNION
    SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
    UNION
    SELECT tenant_id FROM public.barbeiros WHERE user_id = auth.uid() AND deleted_at IS NULL
  )
);

CREATE POLICY "Tenant admin cria ciclos do proprio tenant"
ON public.ciclos_indicacao
FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'ti'::app_role)
  OR (
    public.has_role(auth.uid(), 'tenant_admin'::app_role)
    AND tenant_id IN (SELECT id FROM public.tenants WHERE owner_user_id = auth.uid())
  )
);

CREATE POLICY "Tenant admin atualiza ciclos do proprio tenant"
ON public.ciclos_indicacao
FOR UPDATE
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'ti'::app_role)
  OR (
    public.has_role(auth.uid(), 'tenant_admin'::app_role)
    AND tenant_id IN (SELECT id FROM public.tenants WHERE owner_user_id = auth.uid())
  )
);

-- ============================================================
-- 5) pagamentos_plano_barbearia: tenant_admin só do próprio tenant
-- ============================================================
DROP POLICY IF EXISTS "barbers_view_plan_payments" ON public.pagamentos_plano_barbearia;

CREATE POLICY "barbers_and_tenant_view_plan_payments"
ON public.pagamentos_plano_barbearia
FOR SELECT
USING (
  -- Super admin / TI
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'ti'::app_role)
  -- Barbeiro dono do pagamento
  OR barbeiro_id IN (
    SELECT id FROM public.barbeiros WHERE user_id = auth.uid()
  )
  -- Tenant admin: só barbeiros do seu tenant
  OR (
    public.has_role(auth.uid(), 'tenant_admin'::app_role)
    AND barbeiro_id IN (
      SELECT b.id FROM public.barbeiros b
      JOIN public.tenants t ON t.id = b.tenant_id
      WHERE t.owner_user_id = auth.uid()
    )
  )
);
