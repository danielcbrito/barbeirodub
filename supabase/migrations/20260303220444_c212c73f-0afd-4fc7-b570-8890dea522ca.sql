-- Allow barbers to read promocoes from their tenant
CREATE POLICY "Barbers can view tenant promocoes"
ON public.promocoes
FOR SELECT
TO authenticated
USING (
  tenant_id IN (
    SELECT b.tenant_id FROM public.barbeiros b
    WHERE b.user_id = auth.uid()
      AND b.tenant_id IS NOT NULL
      AND b.deleted_at IS NULL
  )
);

-- Allow barbers to update promocoes in their tenant (toggle ativo, edit)
CREATE POLICY "Barbers can update tenant promocoes"
ON public.promocoes
FOR UPDATE
TO authenticated
USING (
  tenant_id IN (
    SELECT b.tenant_id FROM public.barbeiros b
    WHERE b.user_id = auth.uid()
      AND b.tenant_id IS NOT NULL
      AND b.deleted_at IS NULL
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT b.tenant_id FROM public.barbeiros b
    WHERE b.user_id = auth.uid()
      AND b.tenant_id IS NOT NULL
      AND b.deleted_at IS NULL
  )
);