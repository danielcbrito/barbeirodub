
-- Allow tenant_admin to manage configuracoes_horario
-- Since the table has no tenant_id, tenant admins share the global config
-- This is acceptable because each tenant's barbers get their own copy via initialize_barber_hours
CREATE POLICY "Tenant admins podem gerenciar configurações"
ON public.configuracoes_horario
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'tenant_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'tenant_admin'::app_role));
