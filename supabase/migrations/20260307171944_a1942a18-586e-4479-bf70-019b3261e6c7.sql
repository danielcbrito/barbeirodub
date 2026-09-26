CREATE OR REPLACE FUNCTION public.get_plan_usage_for_barber_view(
  p_user_id uuid,
  p_barbeiro_id uuid
)
RETURNS TABLE(
  assinatura_id uuid,
  plan_limit integer,
  used_count integer,
  has_plan boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  v_allowed := (
    auth.uid() = p_user_id
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'tenant_admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.barbeiros b
      WHERE b.id = p_barbeiro_id
        AND b.user_id = auth.uid()
    )
  );

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  RETURN QUERY
  WITH latest_sub AS (
    SELECT s.id, s.plano_id
    FROM public.assinaturas s
    WHERE s.user_id = p_user_id
      AND s.barbeiro_id = p_barbeiro_id
      AND s.status IN ('active', 'pending_cash')
    ORDER BY s.created_at DESC
    LIMIT 1
  )
  SELECT
    ls.id AS assinatura_id,
    COALESCE(p.limite_agendamentos_mes, 4)::integer AS plan_limit,
    COALESCE((
      SELECT COUNT(*)::integer
      FROM public.plano_agendamentos_usos u
      WHERE u.assinatura_id = ls.id
        AND u.released_at IS NULL
    ), 0) AS used_count,
    true AS has_plan
  FROM latest_sub ls
  LEFT JOIN public.planos p ON p.id = ls.plano_id

  UNION ALL

  SELECT
    NULL::uuid AS assinatura_id,
    4::integer AS plan_limit,
    0::integer AS used_count,
    false AS has_plan
  WHERE NOT EXISTS (SELECT 1 FROM latest_sub);
END;
$$;