-- ==============================================================================
-- Migration: 20261020060000_fix_configuracoes_horario_rls_resilience.sql
-- Objetivo:
-- 1. Resolver definitivamente o erro:
--    "new row violates row-level security policy for table configuracoes_horario"
-- 2. Garantir que a tabela legado global configuracoes_horario não bloqueie requisições
--    feitas por administradores de tenant ou barbeiros do sistema.
-- 3. Garantir isolamento e integridade das tabelas multi-tenant:
--    - configuracoes_horario_unidade (horários da barbearia / unidades)
--    - configuracoes_horario_barbeiro (horários de cada barbeiro na cadeira)
-- ==============================================================================

-- 1. Garantir permissões de execução para has_role e is_tenant_staff
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_tenant_staff') THEN
    GRANT EXECUTE ON FUNCTION public.is_tenant_staff(uuid, uuid) TO anon, authenticated, service_role;
  END IF;
END $$;

-- 2. Corrigir políticas de RLS em public.configuracoes_horario
ALTER TABLE public.configuracoes_horario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins podem gerenciar configurações" ON public.configuracoes_horario;
DROP POLICY IF EXISTS "Tenant admins podem gerenciar configurações" ON public.configuracoes_horario;
DROP POLICY IF EXISTS "Tenant staff pode atualizar fallback configuracoes_horario" ON public.configuracoes_horario;
DROP POLICY IF EXISTS "Todos podem ver configurações" ON public.configuracoes_horario;

-- Leitura pública para qualquer cliente ou usuário
CREATE POLICY "Todos podem ver configurações"
ON public.configuracoes_horario FOR SELECT
TO anon, authenticated
USING (true);

-- Permissão de gravação para administradores, equipe de tenant e barbeiros
CREATE POLICY "Tenant staff pode atualizar fallback configuracoes_horario"
ON public.configuracoes_horario FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'tenant_admin'::app_role)
  OR public.has_role(auth.uid(), 'ti'::app_role)
  OR EXISTS (SELECT 1 FROM public.barbeiros b WHERE b.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.tenants t WHERE t.owner_user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.user_id = auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'tenant_admin'::app_role)
  OR public.has_role(auth.uid(), 'ti'::app_role)
  OR EXISTS (SELECT 1 FROM public.barbeiros b WHERE b.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.tenants t WHERE t.owner_user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.user_id = auth.uid())
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.configuracoes_horario TO authenticated, service_role;
GRANT SELECT ON public.configuracoes_horario TO anon;

-- 3. Garantir índices e integridade em configuracoes_horario_unidade
CREATE TABLE IF NOT EXISTS public.configuracoes_horario_unidade (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  unidade_id uuid REFERENCES public.tenant_unidades(id) ON DELETE CASCADE,
  dia_semana integer NOT NULL CHECK (dia_semana >= 0 AND dia_semana <= 6),
  aberto boolean NOT NULL DEFAULT true,
  hora_abertura time without time zone NOT NULL DEFAULT '09:00'::time,
  hora_fechamento time without time zone NOT NULL DEFAULT '20:00'::time,
  hora_almoco_inicio time without time zone,
  hora_almoco_fim time without time zone,
  delay_entre_servicos integer NOT NULL DEFAULT 10,
  slot_interval_minutes integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_config_horario_unidade_tenant_dia
  ON public.configuracoes_horario_unidade (tenant_id, dia_semana)
  WHERE unidade_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_config_horario_unidade_unit_dia
  ON public.configuracoes_horario_unidade (unidade_id, dia_semana)
  WHERE unidade_id IS NOT NULL;

ALTER TABLE public.configuracoes_horario_unidade ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "configuracoes_horario_unidade_select" ON public.configuracoes_horario_unidade;
DROP POLICY IF EXISTS "configuracoes_horario_unidade_manage" ON public.configuracoes_horario_unidade;

CREATE POLICY "configuracoes_horario_unidade_select"
ON public.configuracoes_horario_unidade FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "configuracoes_horario_unidade_manage"
ON public.configuracoes_horario_unidade FOR ALL
TO authenticated
USING (
  public.is_tenant_staff(tenant_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  public.is_tenant_staff(tenant_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.configuracoes_horario_unidade TO authenticated, service_role;
GRANT SELECT ON public.configuracoes_horario_unidade TO anon;
