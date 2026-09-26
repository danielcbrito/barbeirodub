
CREATE OR REPLACE FUNCTION public.get_plan_usage_for_barber_view(p_user_id uuid, p_barbeiro_id uuid)
 RETURNS TABLE(assinatura_id uuid, plan_limit integer, used_count integer, has_plan boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    OR public.has_role(auth.uid(), 'ti'::public.app_role)
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
    SELECT s.id, s.plano_id, s.next_billing_date, s.status::text AS sub_status
    FROM public.assinaturas s
    WHERE s.user_id = p_user_id
      AND s.status IN ('active', 'pending_cash')
    ORDER BY s.created_at DESC
    LIMIT 1
  ),
  cycle AS (
    SELECT
      ls.id,
      ls.plano_id,
      ls.sub_status,
      COALESCE((ls.next_billing_date - INTERVAL '1 month')::date, '-infinity'::date) AS cycle_start,
      COALESCE(ls.next_billing_date, 'infinity'::date) AS cycle_end
    FROM latest_sub ls
  )
  SELECT
    c.id AS assinatura_id,
    CASE
      WHEN c.sub_status = 'pending_cash' THEN 1
      ELSE COALESCE(p.limite_agendamentos_mes, 4)
    END::integer AS plan_limit,
    public.count_subscription_uses_in_cycle(c.id, c.cycle_start, c.cycle_end)::integer AS used_count,
    true AS has_plan
  FROM cycle c
  LEFT JOIN public.planos p ON p.id = c.plano_id

  UNION ALL

  SELECT
    NULL::uuid AS assinatura_id,
    4::integer AS plan_limit,
    0::integer AS used_count,
    false AS has_plan
  WHERE NOT EXISTS (SELECT 1 FROM latest_sub);
END;
$function$;
