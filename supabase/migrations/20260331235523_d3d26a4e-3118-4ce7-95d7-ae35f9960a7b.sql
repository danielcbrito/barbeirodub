CREATE OR REPLACE FUNCTION public.is_tenant_owner_by_tenant(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = p_tenant_id
      AND t.owner_user_id = auth.uid()
  );
$$;

CREATE TABLE public.client_booking_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_user_id uuid NOT NULL,
  scope text NOT NULL,
  barbeiro_id uuid REFERENCES public.barbeiros(id) ON DELETE CASCADE,
  blocked_by_user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT client_booking_blocks_scope_check CHECK (scope IN ('tenant', 'barber')),
  CONSTRAINT client_booking_blocks_barbeiro_scope_check CHECK (
    (scope = 'tenant' AND barbeiro_id IS NULL)
    OR (scope = 'barber' AND barbeiro_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX client_booking_blocks_unique_tenant_scope
  ON public.client_booking_blocks (tenant_id, client_user_id, scope, COALESCE(barbeiro_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX client_booking_blocks_tenant_idx ON public.client_booking_blocks (tenant_id);
CREATE INDEX client_booking_blocks_client_idx ON public.client_booking_blocks (client_user_id);
CREATE INDEX client_booking_blocks_barbeiro_idx ON public.client_booking_blocks (barbeiro_id) WHERE barbeiro_id IS NOT NULL;

ALTER TABLE public.client_booking_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant owners can view booking blocks"
ON public.client_booking_blocks FOR SELECT TO authenticated
USING (
  public.is_tenant_owner_by_tenant(tenant_id)
  OR EXISTS (
    SELECT 1 FROM public.barbeiros b
    WHERE b.user_id = auth.uid()
      AND b.tenant_id = client_booking_blocks.tenant_id
      AND b.deleted_at IS NULL
  )
);

CREATE POLICY "Tenant owners manage tenant booking blocks"
ON public.client_booking_blocks FOR ALL TO authenticated
USING (public.is_tenant_owner_by_tenant(tenant_id))
WITH CHECK (public.is_tenant_owner_by_tenant(tenant_id));

CREATE POLICY "Barbers manage own booking blocks"
ON public.client_booking_blocks FOR ALL TO authenticated
USING (
  scope = 'barber'
  AND EXISTS (
    SELECT 1 FROM public.barbeiros b
    WHERE b.id = client_booking_blocks.barbeiro_id
      AND b.user_id = auth.uid()
      AND b.deleted_at IS NULL
  )
)
WITH CHECK (
  scope = 'barber'
  AND EXISTS (
    SELECT 1 FROM public.barbeiros b
    WHERE b.id = client_booking_blocks.barbeiro_id
      AND b.user_id = auth.uid()
      AND b.deleted_at IS NULL
      AND b.tenant_id = client_booking_blocks.tenant_id
  )
  AND blocked_by_user_id = auth.uid()
);

CREATE TRIGGER set_client_booking_blocks_updated_at
BEFORE UPDATE ON public.client_booking_blocks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.is_client_blocked_for_barber(
  p_tenant_id uuid,
  p_client_user_id uuid,
  p_barbeiro_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.client_booking_blocks cbb
    WHERE cbb.tenant_id = p_tenant_id
      AND cbb.client_user_id = p_client_user_id
      AND (
        (cbb.scope = 'tenant' AND cbb.barbeiro_id IS NULL)
        OR (cbb.scope = 'barber' AND cbb.barbeiro_id = p_barbeiro_id)
      )
  );
$$;

INSERT INTO public.client_booking_blocks (tenant_id, client_user_id, scope, barbeiro_id, blocked_by_user_id)
SELECT DISTINCT
  tc.tenant_id,
  tc.user_id,
  'tenant',
  CAST(NULL AS uuid),
  COALESCE(t.owner_user_id, tc.added_by, tc.user_id)
FROM public.tenant_clientes tc
LEFT JOIN public.tenants t ON t.id = tc.tenant_id
WHERE COALESCE(tc.blocked, false) = true
ON CONFLICT (tenant_id, client_user_id, scope, COALESCE(barbeiro_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;