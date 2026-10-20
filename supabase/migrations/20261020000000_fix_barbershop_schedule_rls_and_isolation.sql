-- ==============================================================================
-- Migration: Correção de RLS e Isolamento dos Horários da Barbearia vs Barbeiro
-- Data: 2026-10-20
--
-- Objetivos:
-- 1. Resolver o erro: "new row violates row-level security policy for table configuracoes_horario"
-- 2. Garantir isolamento total:
--    - Horário da Barbearia (configuracoes_horario_unidade): alterado apenas por equipe da própria barbearia (tenant_id).
--      Não altera horário pessoal de nenhum barbeiro.
--    - Horário do Barbeiro (configuracoes_horario_barbeiro): alterado apenas pelo próprio barbeiro ou admin da loja.
--      Não altera horário da barbearia nem de outros barbeiros.
-- 3. Corrigir permissão de execução de has_role (permission denied for function has_role).
-- 4. Habilitar Realtime em configuracoes_horario_unidade e configuracoes_horario_barbeiro.
-- ==============================================================================

-- 1. Garantir permissões de execução para has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    )
  END
$function$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO anon, authenticated, service_role;

-- 2. Função helper para verificar se o usuário é equipe autorizada do tenant
CREATE OR REPLACE FUNCTION public.is_tenant_staff(_tenant_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (
    _user_id IS NOT NULL AND _tenant_id IS NOT NULL AND (
      public.has_role(_user_id, 'admin'::app_role)
      OR public.has_role(_user_id, 'ti'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.tenants t
        WHERE t.id = _tenant_id AND t.owner_user_id = _user_id
      )
      OR EXISTS (
        SELECT 1 FROM public.barbeiros b
        WHERE b.tenant_id = _tenant_id AND b.user_id = _user_id AND b.deleted_at IS NULL
      )
      OR EXISTS (
        SELECT 1 FROM public.tenant_members tm
        WHERE tm.tenant_id = _tenant_id AND tm.user_id = _user_id
      )
      OR (
        public.has_role(_user_id, 'tenant_admin'::app_role)
        AND EXISTS (
          SELECT 1 FROM public.barbeiros b WHERE b.user_id = _user_id AND b.tenant_id = _tenant_id
          UNION
          SELECT 1 FROM public.tenants t WHERE t.owner_user_id = _user_id AND t.id = _tenant_id
        )
      )
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_tenant_staff(uuid, uuid) TO anon, authenticated, service_role;

-- 3. Garantir tabela configuracoes_horario_unidade com estrutura e índices corretos
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

-- Índices únicos para evitar duplicidades
CREATE UNIQUE INDEX IF NOT EXISTS idx_config_horario_unidade_tenant_dia
  ON public.configuracoes_horario_unidade (tenant_id, dia_semana)
  WHERE unidade_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_config_horario_unidade_unit_dia
  ON public.configuracoes_horario_unidade (unidade_id, dia_semana)
  WHERE unidade_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_config_horario_unidade_lookup
  ON public.configuracoes_horario_unidade (tenant_id, unidade_id, dia_semana);

-- Habilitar RLS em configuracoes_horario_unidade
ALTER TABLE public.configuracoes_horario_unidade ENABLE ROW LEVEL SECURITY;

-- Políticas para configuracoes_horario_unidade
DROP POLICY IF EXISTS "Leitura pública dos horários da unidade" ON public.configuracoes_horario_unidade;
DROP POLICY IF EXISTS "configuracoes_horario_unidade_select" ON public.configuracoes_horario_unidade;
DROP POLICY IF EXISTS "configuracoes_horario_unidade_manage" ON public.configuracoes_horario_unidade;
DROP POLICY IF EXISTS "Staff gerencia horários da unidade" ON public.configuracoes_horario_unidade;

CREATE POLICY "configuracoes_horario_unidade_select"
ON public.configuracoes_horario_unidade
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "configuracoes_horario_unidade_manage"
ON public.configuracoes_horario_unidade
FOR ALL
TO authenticated
USING (public.is_tenant_staff(tenant_id, auth.uid()))
WITH CHECK (public.is_tenant_staff(tenant_id, auth.uid()));

-- Grants para configuracoes_horario_unidade
GRANT SELECT ON public.configuracoes_horario_unidade TO anon, authenticated;
GRANT ALL ON public.configuracoes_horario_unidade TO authenticated, service_role;

-- 4. Garantir RLS e isolamento em configuracoes_horario_barbeiro
ALTER TABLE public.configuracoes_horario_barbeiro ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_config_horario_barbeiro_barb_dia
  ON public.configuracoes_horario_barbeiro (barbeiro_id, dia_semana);

DROP POLICY IF EXISTS "Todos podem ver horários dos barbeiros" ON public.configuracoes_horario_barbeiro;
DROP POLICY IF EXISTS "Tenant admin can view tenant barber hours" ON public.configuracoes_horario_barbeiro;
DROP POLICY IF EXISTS "Tenant admin can manage tenant barber hours" ON public.configuracoes_horario_barbeiro;
DROP POLICY IF EXISTS "Barbeiros podem gerenciar seus próprios horários" ON public.configuracoes_horario_barbeiro;
DROP POLICY IF EXISTS "configuracoes_horario_barbeiro_select" ON public.configuracoes_horario_barbeiro;
DROP POLICY IF EXISTS "configuracoes_horario_barbeiro_manage" ON public.configuracoes_horario_barbeiro;

CREATE POLICY "configuracoes_horario_barbeiro_select"
ON public.configuracoes_horario_barbeiro
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "configuracoes_horario_barbeiro_manage"
ON public.configuracoes_horario_barbeiro
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.barbeiros b
    WHERE b.id = configuracoes_horario_barbeiro.barbeiro_id
      AND (
        b.user_id = auth.uid()
        OR public.is_tenant_staff(b.tenant_id, auth.uid())
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.barbeiros b
    WHERE b.id = configuracoes_horario_barbeiro.barbeiro_id
      AND (
        b.user_id = auth.uid()
        OR public.is_tenant_staff(b.tenant_id, auth.uid())
      )
  )
);

GRANT SELECT ON public.configuracoes_horario_barbeiro TO anon, authenticated;
GRANT ALL ON public.configuracoes_horario_barbeiro TO authenticated, service_role;

-- 5. Exceções de horário da barbearia (horarios_excepcionais)
ALTER TABLE public.horarios_excepcionais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ver exceções de horário" ON public.horarios_excepcionais;
DROP POLICY IF EXISTS "Admin plataforma gerencia exceções de horário" ON public.horarios_excepcionais;
DROP POLICY IF EXISTS "Tenant admin gerencia exceções do próprio tenant" ON public.horarios_excepcionais;
DROP POLICY IF EXISTS "horarios_excepcionais_select" ON public.horarios_excepcionais;
DROP POLICY IF EXISTS "horarios_excepcionais_manage" ON public.horarios_excepcionais;

CREATE POLICY "horarios_excepcionais_select"
ON public.horarios_excepcionais
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "horarios_excepcionais_manage"
ON public.horarios_excepcionais
FOR ALL
TO authenticated
USING (public.is_tenant_staff(tenant_id, auth.uid()))
WITH CHECK (public.is_tenant_staff(tenant_id, auth.uid()));

GRANT SELECT ON public.horarios_excepcionais TO anon, authenticated;
GRANT ALL ON public.horarios_excepcionais TO authenticated, service_role;

-- 6. Exceções de horário do barbeiro (horarios_excepcionais_barbeiro)
ALTER TABLE public.horarios_excepcionais_barbeiro ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "horarios_excepcionais_barbeiro_select" ON public.horarios_excepcionais_barbeiro;
DROP POLICY IF EXISTS "horarios_excepcionais_barbeiro_manage" ON public.horarios_excepcionais_barbeiro;
DROP POLICY IF EXISTS "Barbeiros podem gerenciar suas exceções" ON public.horarios_excepcionais_barbeiro;
DROP POLICY IF EXISTS "Tenant admin can manage tenant barber exceptions" ON public.horarios_excepcionais_barbeiro;

CREATE POLICY "horarios_excepcionais_barbeiro_select"
ON public.horarios_excepcionais_barbeiro
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "horarios_excepcionais_barbeiro_manage"
ON public.horarios_excepcionais_barbeiro
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.barbeiros b
    WHERE b.id = horarios_excepcionais_barbeiro.barbeiro_id
      AND (
        b.user_id = auth.uid()
        OR public.is_tenant_staff(b.tenant_id, auth.uid())
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.barbeiros b
    WHERE b.id = horarios_excepcionais_barbeiro.barbeiro_id
      AND (
        b.user_id = auth.uid()
        OR public.is_tenant_staff(b.tenant_id, auth.uid())
      )
  )
);

GRANT SELECT ON public.horarios_excepcionais_barbeiro TO anon, authenticated;
GRANT ALL ON public.horarios_excepcionais_barbeiro TO authenticated, service_role;

-- 7. Configurações gerais da barbearia em informacoes_empresa
ALTER TABLE public.informacoes_empresa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "informacoes_empresa_select" ON public.informacoes_empresa;
DROP POLICY IF EXISTS "informacoes_empresa_manage" ON public.informacoes_empresa;

CREATE POLICY "informacoes_empresa_select"
ON public.informacoes_empresa
FOR SELECT
TO anon, authenticated
USING (
  tenant_id IS NULL
  OR public.is_tenant_staff(tenant_id, auth.uid())
  OR chave LIKE 'public_%'
  OR chave LIKE 'taxa_cancelamento_%'
  OR chave = 'expediente'
);

CREATE POLICY "informacoes_empresa_manage"
ON public.informacoes_empresa
FOR ALL
TO authenticated
USING (
  tenant_id IS NOT NULL AND public.is_tenant_staff(tenant_id, auth.uid())
)
WITH CHECK (
  tenant_id IS NOT NULL AND public.is_tenant_staff(tenant_id, auth.uid())
);

GRANT SELECT ON public.informacoes_empresa TO anon, authenticated;
GRANT ALL ON public.informacoes_empresa TO authenticated, service_role;

-- 8. Configurar REPLICA IDENTITY FULL e Publicação Realtime
ALTER TABLE public.configuracoes_horario_unidade REPLICA IDENTITY FULL;
ALTER TABLE public.configuracoes_horario_barbeiro REPLICA IDENTITY FULL;
ALTER TABLE public.horarios_excepcionais REPLICA IDENTITY FULL;
ALTER TABLE public.horarios_excepcionais_barbeiro REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.configuracoes_horario_unidade;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.configuracoes_horario_barbeiro;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.horarios_excepcionais;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.horarios_excepcionais_barbeiro;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
