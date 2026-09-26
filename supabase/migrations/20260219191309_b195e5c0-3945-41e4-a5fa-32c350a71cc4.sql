
-- Function to safely assign tenant_admin role during onboarding
-- Uses SECURITY DEFINER to bypass RLS restrictions
CREATE OR REPLACE FUNCTION public.assign_tenant_admin_role(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Remove default 'cliente' role if exists (user is becoming a tenant owner)
  DELETE FROM public.user_roles 
  WHERE user_id = p_user_id AND role = 'cliente';
  
  -- Insert tenant_admin role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'tenant_admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;
