
CREATE OR REPLACE FUNCTION public.check_cpf_available_for_barber(p_cpf text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean text;
  v_taken boolean;
BEGIN
  v_clean := regexp_replace(coalesce(p_cpf,''), '\D', '', 'g');
  IF length(v_clean) <> 11 THEN
    RETURN jsonb_build_object('available', false, 'reason', 'invalid');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE regexp_replace(coalesce(p.cpf,''), '\D', '', 'g') = v_clean
      AND ur.role IN ('tenant_admin','admin','unit_admin','barbeiro')
  ) INTO v_taken;

  RETURN jsonb_build_object('available', NOT v_taken, 'reason',
    CASE WHEN v_taken THEN 'barber_exists' ELSE 'ok' END);
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_cpf_available_for_barber(text) TO anon, authenticated;
