CREATE TABLE public.loja_cupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  produto_id uuid REFERENCES public.produtos(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  descricao text,
  tipo_desconto text NOT NULL DEFAULT 'percentual',
  valor_desconto numeric NOT NULL DEFAULT 0,
  valor_minimo numeric NOT NULL DEFAULT 0,
  max_usos_total integer,
  max_usos_por_cliente integer DEFAULT 1,
  usos_count integer NOT NULL DEFAULT 0,
  valido_de timestamptz NOT NULL DEFAULT now(),
  valido_ate timestamptz,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loja_cupons_tipo_chk CHECK (tipo_desconto IN ('percentual','valor')),
  CONSTRAINT loja_cupons_codigo_tenant_uk UNIQUE (tenant_id, codigo)
);

CREATE INDEX idx_loja_cupons_tenant ON public.loja_cupons(tenant_id, ativo);
CREATE INDEX idx_loja_cupons_produto ON public.loja_cupons(produto_id);

GRANT SELECT ON public.loja_cupons TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loja_cupons TO authenticated;
GRANT ALL ON public.loja_cupons TO service_role;

ALTER TABLE public.loja_cupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cupons ativos visiveis para clientes"
ON public.loja_cupons FOR SELECT
TO authenticated, anon
USING (ativo = true);

CREATE POLICY "Dono da barbearia gerencia cupons da loja"
ON public.loja_cupons FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = loja_cupons.tenant_id AND t.owner_user_id = auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = loja_cupons.tenant_id AND t.owner_user_id = auth.uid())
);

CREATE TRIGGER update_loja_cupons_updated_at
BEFORE UPDATE ON public.loja_cupons
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();