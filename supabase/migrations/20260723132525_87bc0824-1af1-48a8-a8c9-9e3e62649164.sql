-- Remove política que permitia qualquer barbeiro do tenant ler todos os ciclos
DROP POLICY IF EXISTS "Tenant staff ve ciclos do proprio tenant" ON public.ciclos_indicacao;

-- Substitui por política restrita a tenant_admin (dono do tenant ou membro com papel administrativo)
CREATE POLICY "Tenant admins veem ciclos do proprio tenant"
ON public.ciclos_indicacao
FOR SELECT
TO authenticated
USING (
  tenant_id IS NOT NULL
  AND has_role(auth.uid(), 'tenant_admin'::app_role)
  AND (
    tenant_id IN (SELECT id FROM public.tenants WHERE owner_user_id = auth.uid())
    OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  )
);
