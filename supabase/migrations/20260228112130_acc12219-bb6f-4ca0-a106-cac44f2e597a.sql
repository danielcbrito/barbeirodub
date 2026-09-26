
-- Allow barbers to view subscriptions assigned to them (critical for PendingPlanPayments)
CREATE POLICY "Barbers can view assigned subscriptions"
  ON public.assinaturas
  FOR SELECT
  USING (
    barbeiro_id IN (
      SELECT id FROM public.barbeiros WHERE user_id = auth.uid()
    )
  );

-- Allow tenant_admin to view all subscriptions linked to their barbers
CREATE POLICY "Tenant admins can view tenant subscriptions"
  ON public.assinaturas
  FOR ALL
  USING (
    has_role(auth.uid(), 'tenant_admin'::app_role)
    AND barbeiro_id IN (
      SELECT b.id FROM public.barbeiros b
      JOIN public.tenants t ON b.tenant_id = t.id
      WHERE t.owner_user_id = auth.uid()
    )
  );
