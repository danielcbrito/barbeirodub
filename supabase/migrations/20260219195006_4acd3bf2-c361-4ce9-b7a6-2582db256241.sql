
-- Fix: Link existing tenant barbers to their correct tenants
UPDATE public.barbeiros b
SET tenant_id = t.id
FROM public.tenants t
WHERE t.owner_user_id = b.user_id
  AND b.tenant_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = b.user_id AND ur.role = 'tenant_admin'
  );

-- Fix AdminBarbeiros: global admin should only see barbeiros WITHOUT tenant_id
-- This is enforced via RLS: add policy so admin only sees global barbeiros
-- Drop existing admin select policy if it exists
DO $$
BEGIN
  -- Drop old broad admin policies that don't filter by tenant
  DROP POLICY IF EXISTS "Admin can view all barbeiros" ON public.barbeiros;
  DROP POLICY IF EXISTS "Admins can view barbeiros" ON public.barbeiros;
  DROP POLICY IF EXISTS "Admin full access to barbeiros" ON public.barbeiros;
END $$;

-- Admin sees only global (non-tenant) barbeiros
CREATE POLICY "Admin can view global barbeiros"
ON public.barbeiros FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') AND tenant_id IS NULL
);

-- Admin can manage only global barbeiros
CREATE POLICY "Admin can manage global barbeiros"
ON public.barbeiros FOR ALL
USING (
  public.has_role(auth.uid(), 'admin') AND tenant_id IS NULL
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') AND tenant_id IS NULL
);
