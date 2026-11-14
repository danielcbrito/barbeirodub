-- ════════════════════════════════════════════════════════════════
-- CORREÇÃO RLS: Permitir tenant_admins (membros) atualizarem agendamentos
-- ════════════════════════════════════════════════════════════════
--
-- Problema: A política "Tenant admin can update tenant appointments"
-- (migração 20260219193230) só cobre o owner_user_id do tenant.
-- Quando um usuário é membro do tenant (tenant_members com role='admin')
-- mas NÃO é o proprietário (owner_user_id), a política não se aplica.
-- Junto com a ausência de role 'admin' na tabela user_roles, o UPDATE
-- em agendamentos é barrado pelo RLS, gerando erro ao "registrar falta".
--
-- Correção: Estender a política para também incluir membros do tenant
-- com role='admin' via tabela tenant_members.

DROP POLICY IF EXISTS "Tenant admin can update tenant appointments" ON public.agendamentos;

CREATE POLICY "Tenant admin can update tenant appointments"
ON public.agendamentos
FOR UPDATE
USING (
  barbeiro_id IN (
    SELECT b.id
    FROM barbeiros b
    WHERE b.tenant_id IS NOT NULL
      AND b.tenant_id IN (
        -- Proprietário do tenant
        SELECT t.id FROM public.tenants t WHERE t.owner_user_id = auth.uid()
        UNION
        -- Membro do tenant com role de admin
        SELECT tm.tenant_id
        FROM public.tenant_members tm
        WHERE tm.user_id = auth.uid()
          AND tm.role = 'admin'
      )
  )
)
WITH CHECK (
  barbeiro_id IN (
    SELECT b.id
    FROM barbeiros b
    WHERE b.tenant_id IS NOT NULL
      AND b.tenant_id IN (
        SELECT t.id FROM public.tenants t WHERE t.owner_user_id = auth.uid()
        UNION
        SELECT tm.tenant_id
        FROM public.tenant_members tm
        WHERE tm.user_id = auth.uid()
          AND tm.role = 'admin'
      )
  )
);
