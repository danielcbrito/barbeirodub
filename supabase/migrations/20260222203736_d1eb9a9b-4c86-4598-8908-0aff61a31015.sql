-- Allow tenant_admin to view all profiles (needed for client names in confirmations)
CREATE POLICY "Tenant admins can view all profiles"
ON public.profiles
FOR SELECT
USING (has_role(auth.uid(), 'tenant_admin'::app_role));
