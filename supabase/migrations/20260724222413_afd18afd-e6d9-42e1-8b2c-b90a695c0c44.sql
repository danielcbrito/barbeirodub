
CREATE OR REPLACE FUNCTION public.get_client_loyalty_for_barber_view(p_user_id uuid, p_barbeiro_id uuid)
RETURNS TABLE(client_points integer, required_points integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_allowed boolean;
  v_tenant_id uuid;
  v_points integer;
  v_required integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  v_allowed := (
    auth.uid() = p_user_id
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'tenant_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'ti'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.barbeiros b
      WHERE b.id = p_barbeiro_id AND b.user_id = auth.uid()
    )
  );

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT COALESCE(pontos, 0) INTO v_points
  FROM public.pontos WHERE user_id = p_user_id LIMIT 1;

  IF p_barbeiro_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant_id FROM public.barbeiros WHERE id = p_barbeiro_id;
  END IF;

  SELECT pontos_necessarios INTO v_required
  FROM public.promocoes
  WHERE ativo = true
    AND ((v_tenant_id IS NOT NULL AND tenant_id = v_tenant_id) OR (v_tenant_id IS NULL AND tenant_id IS NULL))
  ORDER BY created_at DESC NULLS LAST
  LIMIT 1;

  IF v_required IS NULL OR v_required < 2 THEN
    v_required := 8;
  END IF;

  RETURN QUERY SELECT COALESCE(v_points, 0)::integer, v_required::integer;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_client_loyalty_for_barber_view(uuid, uuid) TO authenticated, service_role;
