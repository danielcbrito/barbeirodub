-- Recria a tabela de cupons removida na limpeza; a tela admin /cupons continua ativa e depende dela.
CREATE TABLE IF NOT EXISTS public.discount_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  nome text,
  percent numeric NOT NULL CHECK (percent >= 0 AND percent <= 100),
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS discount_coupons_tenant_code_key
  ON public.discount_coupons (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), code);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discount_coupons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discount_coupons TO service_role;

ALTER TABLE public.discount_coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_manage_discount_coupons"
  ON public.discount_coupons
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);