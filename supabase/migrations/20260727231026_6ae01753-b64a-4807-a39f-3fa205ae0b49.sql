CREATE OR REPLACE FUNCTION public.get_client_home_bundle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_snap public.client_home_snapshot;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_snap
  FROM public.client_home_snapshot
  WHERE user_id = v_user_id;

  IF NOT FOUND
     OR (
       v_snap.is_stale = true
       AND v_snap.profile = '{}'::jsonb
       AND v_snap.appointments = '[]'::jsonb
       AND v_snap.pending_bookings = '[]'::jsonb
       AND v_snap.updated_at >= now() - interval '1 day'
     ) THEN
    PERFORM public.refresh_client_home_snapshot(v_user_id);
    SELECT * INTO v_snap
    FROM public.client_home_snapshot
    WHERE user_id = v_user_id;
  END IF;

  RETURN jsonb_build_object(
    'profile', COALESCE(v_snap.profile, '{}'::jsonb),
    'appointments', COALESCE(v_snap.appointments, '[]'::jsonb),
    'pendingBookings', COALESCE(v_snap.pending_bookings, '[]'::jsonb),
    'hasActivePlan', COALESCE(v_snap.has_active_plan, false),
    'availableCredits', COALESCE(v_snap.available_credits, 0),
    'paidCompletedCount', COALESCE(v_snap.paid_completed_count, 0),
    'totalCompletedCount', COALESCE(v_snap.total_completed_count, 0),
    'redemptionsTotal', COALESCE(v_snap.redemptions_total, 0),
    'redemptionsAvailable', COALESCE(v_snap.redemptions_available, 0),
    'requiredPoints', COALESCE(v_snap.required_points, 8),
    'points', COALESCE(v_snap.points, 0),
    'loyaltyActive', COALESCE(v_snap.loyalty_active, false),
    'isStale', COALESCE(v_snap.is_stale, false),
    'updatedAt', v_snap.updated_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_client_home_bundle() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_client_home_bundle() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_client_home_bundle() TO authenticated, service_role;