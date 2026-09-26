
-- ═══════════════════════════════════════
-- MULTI-TENANT ISOLATION: planos, cupons, promoções
-- ═══════════════════════════════════════

-- 1. PLANOS - Add tenant_id
ALTER TABLE public.planos ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
CREATE INDEX IF NOT EXISTS idx_planos_tenant_id ON public.planos(tenant_id);

-- RLS for planos
DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active plans" ON public.planos;
  DROP POLICY IF EXISTS "Admin full access to planos" ON public.planos;
  DROP POLICY IF EXISTS "Admins can manage planos" ON public.planos;
END $$;

-- Global plans (tenant_id IS NULL) readable by all authenticated + tenant plans by owner
CREATE POLICY "View plans" ON public.planos FOR SELECT
USING (
  tenant_id IS NULL 
  OR tenant_id = public.get_user_tenant_id()
  OR public.has_role(auth.uid(), 'admin')
);

-- Admin manages global plans
CREATE POLICY "Admin manages global plans" ON public.planos FOR ALL
USING (public.has_role(auth.uid(), 'admin') AND tenant_id IS NULL)
WITH CHECK (public.has_role(auth.uid(), 'admin') AND tenant_id IS NULL);

-- Tenant admin manages own plans
CREATE POLICY "Tenant admin manages own plans" ON public.planos FOR ALL
USING (public.has_role(auth.uid(), 'tenant_admin') AND tenant_id = public.get_user_tenant_id())
WITH CHECK (public.has_role(auth.uid(), 'tenant_admin') AND tenant_id = public.get_user_tenant_id());

-- 2. DISCOUNT_COUPONS - Add tenant_id
ALTER TABLE public.discount_coupons ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
CREATE INDEX IF NOT EXISTS idx_discount_coupons_tenant_id ON public.discount_coupons(tenant_id);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin can manage coupons" ON public.discount_coupons;
  DROP POLICY IF EXISTS "Admins can manage coupons" ON public.discount_coupons;
  DROP POLICY IF EXISTS "Admin full access coupons" ON public.discount_coupons;
  DROP POLICY IF EXISTS "Anyone can view active coupons" ON public.discount_coupons;
END $$;

CREATE POLICY "View coupons" ON public.discount_coupons FOR SELECT
USING (
  tenant_id IS NULL 
  OR tenant_id = public.get_user_tenant_id()
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admin manages global coupons" ON public.discount_coupons FOR ALL
USING (public.has_role(auth.uid(), 'admin') AND tenant_id IS NULL)
WITH CHECK (public.has_role(auth.uid(), 'admin') AND tenant_id IS NULL);

CREATE POLICY "Tenant admin manages own coupons" ON public.discount_coupons FOR ALL
USING (public.has_role(auth.uid(), 'tenant_admin') AND tenant_id = public.get_user_tenant_id())
WITH CHECK (public.has_role(auth.uid(), 'tenant_admin') AND tenant_id = public.get_user_tenant_id());

-- 3. PROMOCOES - Add tenant_id
ALTER TABLE public.promocoes ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
CREATE INDEX IF NOT EXISTS idx_promocoes_tenant_id ON public.promocoes(tenant_id);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin can manage promocoes" ON public.promocoes;
  DROP POLICY IF EXISTS "Anyone can view active promotions" ON public.promocoes;
  DROP POLICY IF EXISTS "Admin full access promocoes" ON public.promocoes;
END $$;

CREATE POLICY "View promocoes" ON public.promocoes FOR SELECT
USING (
  tenant_id IS NULL 
  OR tenant_id = public.get_user_tenant_id()
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admin manages global promocoes" ON public.promocoes FOR ALL
USING (public.has_role(auth.uid(), 'admin') AND tenant_id IS NULL)
WITH CHECK (public.has_role(auth.uid(), 'admin') AND tenant_id IS NULL);

CREATE POLICY "Tenant admin manages own promocoes" ON public.promocoes FOR ALL
USING (public.has_role(auth.uid(), 'tenant_admin') AND tenant_id = public.get_user_tenant_id())
WITH CHECK (public.has_role(auth.uid(), 'tenant_admin') AND tenant_id = public.get_user_tenant_id());

-- 4. DISPAROS_PROGRAMADOS - Add tenant_id for message dispatch isolation
ALTER TABLE public.disparos_programados ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
CREATE INDEX IF NOT EXISTS idx_disparos_programados_tenant_id ON public.disparos_programados(tenant_id);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin manages disparos" ON public.disparos_programados;
  DROP POLICY IF EXISTS "Admin full access disparos" ON public.disparos_programados;
END $$;

CREATE POLICY "Admin manages global disparos" ON public.disparos_programados FOR ALL
USING (public.has_role(auth.uid(), 'admin') AND tenant_id IS NULL)
WITH CHECK (public.has_role(auth.uid(), 'admin') AND tenant_id IS NULL);

CREATE POLICY "Tenant admin manages own disparos" ON public.disparos_programados FOR ALL
USING (public.has_role(auth.uid(), 'tenant_admin') AND tenant_id = public.get_user_tenant_id())
WITH CHECK (public.has_role(auth.uid(), 'tenant_admin') AND tenant_id = public.get_user_tenant_id());
