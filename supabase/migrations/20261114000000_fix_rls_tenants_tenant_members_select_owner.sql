-- ═════════════════════════════════════════════════════════════════════
-- CORREÇÃO RLS: Permitir tenant_owner e tenant_members verem seus próprios registros
-- ═════════════════════════════════════════════════════════════════════
--
-- Problema: A tabela `tenants` tem RLS habilitado, mas a única política SELECT
-- ("ti_read_all_tenants") requer role 'ti'. Isso bloqueia subqueries aninhadas
-- em políticas RLS de outras tabelas (ex: `barbeiros` consulta `tenants` para
-- verificar o tenant_id do owner).
--
-- Como `barbeiros` também tem RLS, e suas políticas fazem subquery em `tenants`,
-- o resultado é que NENHUMA política UPDATE em `agendamentos` consegue encontrar
-- o barbeiro/tenant válido, gerando erro 403 (PostgREST 42501) ao marcar falta.
--
-- Correção: Adicionar políticas SELECT em `tenants` e `tenant_members` para que
-- o owner/membro possa ver seus próprios registros, permitindo que as subqueries
-- aninhadas funcionem corretamente.
--
-- ═════════════════════════════════════════════════════════════════════

-- 1. Política SELECT em tenants: o dono do tenant pode ver seu próprio registro
DROP POLICY IF EXISTS "Tenant owner can view own tenant" ON public.tenants;
CREATE POLICY "Tenant owner can view own tenant"
ON public.tenants
FOR SELECT
TO authenticated
USING (owner_user_id = auth.uid());

-- 2. Política SELECT em tenant_members: o membro pode ver seus próprios registros
DROP POLICY IF EXISTS "Tenant member can view own memberships" ON public.tenant_members;
CREATE POLICY "Tenant member can view own memberships"
ON public.tenant_members
FOR SELECT
TO authenticated
USING (user_id = auth.uid());
