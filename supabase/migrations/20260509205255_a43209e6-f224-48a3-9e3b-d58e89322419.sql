
CREATE POLICY "Barbers can create subscriptions for clients"
ON public.assinaturas
FOR INSERT
TO authenticated
WITH CHECK (
  barbeiro_id IN (
    SELECT id FROM public.barbeiros WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Tenant admins can create subscriptions for tenant clients"
ON public.assinaturas
FOR INSERT
TO authenticated
WITH CHECK (
  barbeiro_id IN (
    SELECT b.id
    FROM public.barbeiros b
    JOIN public.tenants t ON b.tenant_id = t.id
    WHERE t.owner_user_id = auth.uid()
  )
);
