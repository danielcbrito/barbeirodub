
-- Tabela de Unidades (filiais) de um tenant
CREATE TABLE public.tenant_unidades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  slug TEXT,
  -- Identificação
  cnpj TEXT,
  cpf TEXT,
  email TEXT,
  telefone TEXT,
  whatsapp TEXT,
  site TEXT,
  logo_url TEXT,
  -- Endereço
  cep TEXT,
  rua TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  estado TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  -- Status
  ativo BOOLEAN NOT NULL DEFAULT true,
  is_sede BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_tenant_unidades_tenant ON public.tenant_unidades(tenant_id);

-- Trigger updated_at
CREATE TRIGGER set_tenant_unidades_updated_at
  BEFORE UPDATE ON public.tenant_unidades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.tenant_unidades ENABLE ROW LEVEL SECURITY;

-- Política: tenant_admin pode ver/gerenciar unidades do seu tenant
CREATE POLICY "tenant_admin_manage_unidades"
  ON public.tenant_unidades
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (SELECT id FROM public.tenants WHERE owner_user_id = auth.uid())
  )
  WITH CHECK (
    tenant_id IN (SELECT id FROM public.tenants WHERE owner_user_id = auth.uid())
  );

-- Admin global pode gerenciar tudo
CREATE POLICY "admin_manage_all_unidades"
  ON public.tenant_unidades
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Barbeiros podem ver unidades do seu tenant (leitura)
CREATE POLICY "barber_view_unidades"
  ON public.tenant_unidades
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.barbeiros 
      WHERE user_id = auth.uid() AND ativo = true AND deleted_at IS NULL
    )
  );
