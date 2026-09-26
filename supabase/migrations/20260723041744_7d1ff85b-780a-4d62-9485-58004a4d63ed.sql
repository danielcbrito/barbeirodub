
REVOKE ALL ON FUNCTION public.profile_visible_to_tenant_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_visible_to_tenant_admin(uuid) TO authenticated, service_role;
