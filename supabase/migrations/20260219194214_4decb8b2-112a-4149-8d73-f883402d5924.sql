
-- ═══════════════════════════════════════════════════════════════
-- ISOLAMENTO COMPLETO DE TENANTS: servicos + webhook_config
-- ═══════════════════════════════════════════════════════════════

-- 1) Adicionar tenant_id à tabela servicos (nullable = serviços globais DUB)
ALTER TABLE public.servicos ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- 2) Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_servicos_tenant_id ON public.servicos(tenant_id);

-- 3) RLS: tenant_admin pode gerenciar serviços do seu tenant
CREATE POLICY "Tenant admin can view own tenant services"
ON public.servicos FOR SELECT
USING (
  tenant_id IS NULL  -- serviços globais DUB visíveis para todos
  OR tenant_id = public.get_user_tenant_id()
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Tenant admin can insert own tenant services"
ON public.servicos FOR INSERT
WITH CHECK (
  tenant_id = public.get_user_tenant_id()
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Tenant admin can update own tenant services"
ON public.servicos FOR UPDATE
USING (
  tenant_id = public.get_user_tenant_id()
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Tenant admin can delete own tenant services"
ON public.servicos FOR DELETE
USING (
  tenant_id = public.get_user_tenant_id()
  OR public.has_role(auth.uid(), 'admin')
);

-- 4) Tabela de configuração de webhook por tenant
CREATE TABLE IF NOT EXISTS public.tenant_webhook_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) UNIQUE,
  webhook_url text,
  ativo boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.tenant_webhook_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admin can manage own webhook config"
ON public.tenant_webhook_config FOR ALL
USING (tenant_id = public.get_user_tenant_id())
WITH CHECK (tenant_id = public.get_user_tenant_id());

-- Trigger para updated_at
CREATE TRIGGER set_tenant_webhook_config_updated_at
  BEFORE UPDATE ON public.tenant_webhook_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Tabela de templates de mensagem por tenant
CREATE TABLE IF NOT EXISTS public.tenant_mensagem_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  slug text NOT NULL,
  conteudo text NOT NULL,
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, slug)
);

ALTER TABLE public.tenant_mensagem_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admin can manage own message templates"
ON public.tenant_mensagem_templates FOR ALL
USING (tenant_id = public.get_user_tenant_id())
WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE TRIGGER set_tenant_mensagem_templates_updated_at
  BEFORE UPDATE ON public.tenant_mensagem_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
