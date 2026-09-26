
-- ═══════════════════════════════════════════════════════════════════
-- MULTI-TENANT ARCHITECTURE
-- Cada barbearia que se cadastra vira um "tenant" isolado.
-- A barbearia DUB original (tenant_id = NULL) continua funcionando.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Tabela de tenants (barbearias cadastradas via SaaS)
CREATE TABLE IF NOT EXISTS public.tenants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,          -- dono/admin da barbearia
  nome          text NOT NULL,           -- nome da barbearia
  slogan        text,
  cnpj          text,
  cpf           text,
  email         text,
  telefone      text,
  whatsapp      text,
  site          text,
  logo_url      text,
  rua           text,
  numero        text,
  bairro        text,
  cidade        text,
  estado        text,
  endereco_completo text,
  onboarding_completed boolean NOT NULL DEFAULT false,
  onboarding_step      integer NOT NULL DEFAULT 1,
  ativo                boolean NOT NULL DEFAULT true,
  created_at    timestamp with time zone NOT NULL DEFAULT now(),
  updated_at    timestamp with time zone NOT NULL DEFAULT now()
);

-- 2. RLS no tenants
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Dono pode ver e atualizar seu próprio tenant
CREATE POLICY "tenant_owner_select"
  ON public.tenants FOR SELECT
  USING (owner_user_id = auth.uid());

CREATE POLICY "tenant_owner_update"
  ON public.tenants FOR UPDATE
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "tenant_owner_insert"
  ON public.tenants FOR INSERT
  WITH CHECK (owner_user_id = auth.uid());

-- 3. Função helper: retorna tenant_id do usuário autenticado (como tenant admin)
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.tenants WHERE owner_user_id = auth.uid() LIMIT 1;
$$;

-- 4. Novo role para donos de barbearia (tenant_admin)
-- Adicionar ao enum existente app_role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'tenant_admin';

-- 5. Tabela de membros de um tenant (barbeiros que trabalham numa barbearia SaaS)
CREATE TABLE IF NOT EXISTS public.tenant_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  role       text NOT NULL DEFAULT 'barber', -- barber | admin
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;

-- Dono do tenant pode gerenciar membros
CREATE POLICY "tenant_admin_manage_members"
  ON public.tenant_members FOR ALL
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- Membros podem ver a si mesmos
CREATE POLICY "tenant_member_self_select"
  ON public.tenant_members FOR SELECT
  USING (user_id = auth.uid());

-- 6. Storage bucket para logos de tenant
INSERT INTO storage.buckets (id, name, public)
VALUES ('tenant-logos', 'tenant-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "tenant_logo_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'tenant-logos');

CREATE POLICY "tenant_logo_owner_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'tenant-logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "tenant_logo_owner_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'tenant-logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "tenant_logo_owner_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'tenant-logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 7. Trigger para atualizar updated_at no tenants
CREATE OR REPLACE FUNCTION public.update_tenants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_tenants_updated_at();
