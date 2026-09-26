
-- Tabela para vincular clientes manualmente adicionados a um tenant
CREATE TABLE IF NOT EXISTS public.tenant_clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  added_by uuid,
  UNIQUE (tenant_id, user_id)
);

ALTER TABLE public.tenant_clientes ENABLE ROW LEVEL SECURITY;

-- Tenant admins podem ver e gerenciar seus próprios clientes
CREATE POLICY "tenant_admin_manage_tenant_clientes"
  ON public.tenant_clientes
  FOR ALL
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- Admins globais podem ver tudo
CREATE POLICY "admin_full_access_tenant_clientes"
  ON public.tenant_clientes
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
