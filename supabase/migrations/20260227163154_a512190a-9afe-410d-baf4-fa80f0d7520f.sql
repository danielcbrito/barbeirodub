-- Adicionar tenant_id à tabela informacoes_empresa para isolamento multi-tenant
ALTER TABLE public.informacoes_empresa ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Criar índice para performance
CREATE INDEX idx_informacoes_empresa_tenant_id ON public.informacoes_empresa(tenant_id);

-- Criar constraint UNIQUE para evitar duplicatas por tenant
-- Primeiro, remover a constraint unique existente se houver
ALTER TABLE public.informacoes_empresa DROP CONSTRAINT IF EXISTS informacoes_empresa_chave_key;

-- Nova constraint: chave + categoria + tenant_id (NULL para dados globais)
CREATE UNIQUE INDEX uq_informacoes_empresa_tenant ON public.informacoes_empresa(chave, categoria, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Atualizar RLS policies
DROP POLICY IF EXISTS "Admins can manage all company info" ON public.informacoes_empresa;
DROP POLICY IF EXISTS "Anyone can view active company info" ON public.informacoes_empresa;

-- Admin global: acessa apenas dados sem tenant_id (dados da DUB original)
CREATE POLICY "Admin global manages own company info"
ON public.informacoes_empresa FOR ALL
TO authenticated
USING (
  tenant_id IS NULL AND has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  tenant_id IS NULL AND has_role(auth.uid(), 'admin'::app_role)
);

-- Tenant admin: acessa apenas dados do seu tenant
CREATE POLICY "Tenant admin manages own company info"
ON public.informacoes_empresa FOR ALL
TO authenticated
USING (
  tenant_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM tenants t WHERE t.id = informacoes_empresa.tenant_id AND t.owner_user_id = auth.uid()
  )
)
WITH CHECK (
  tenant_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM tenants t WHERE t.id = informacoes_empresa.tenant_id AND t.owner_user_id = auth.uid()
  )
);

-- Leitura pública de dados ativos (para clientes verem info da barbearia)
CREATE POLICY "Public can view active company info"
ON public.informacoes_empresa FOR SELECT
USING (ativo = true);