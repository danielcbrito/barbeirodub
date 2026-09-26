REVOKE EXECUTE ON FUNCTION public.get_barber_boot_bundle() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_barber_boot_bundle() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_barber_boot_bundle() TO authenticated, service_role;