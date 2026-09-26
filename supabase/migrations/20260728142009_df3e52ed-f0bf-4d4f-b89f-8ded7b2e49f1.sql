CREATE OR REPLACE FUNCTION public.refresh_barber_home_snapshot(p_barbeiro_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := CURRENT_DATE;
  v_yesterday date := CURRENT_DATE - 1;
  v_month_start date := date_trunc('month', CURRENT_DATE)::date;
  v_last_month_start date := (date_trunc('month', CURRENT_DATE) - interval '1 month')::date;
  v_last_month_end date := (date_trunc('month', CURRENT_DATE) - interval '1 day')::date;
  v_now_time time := LOCALTIME;
  v_agg record;
  v_pending integer := 0;
  v_pcm numeric := 0;
  v_pclm numeric := 0;
  v_ppm numeric := 0;
  v_pplm numeric := 0;
  v_next jsonb := NULL;
  v_recent jsonb := '[]'::jsonb;
BEGIN
  IF p_barbeiro_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE data = v_today AND status IN ('pending','confirmed','completed')) AS tc,
    COUNT(*) FILTER (WHERE data = v_yesterday AND status IN ('pending','confirmed','completed')) AS yc,
    COUNT(*) FILTER (WHERE data >= v_month_start AND status = 'completed') AS mc,
    COUNT(*) FILTER (WHERE data >= v_last_month_start AND data <= v_last_month_end AND status = 'completed') AS lmc,
    COALESCE(SUM(preco) FILTER (WHERE data >= v_month_start AND status = 'completed'), 0) AS mr,
    COALESCE(SUM(preco) FILTER (WHERE data >= v_last_month_start AND data <= v_last_month_end AND status = 'completed'), 0) AS lmr
  INTO v_agg
  FROM public.agendamentos
  WHERE barbeiro_id = p_barbeiro_id AND data >= v_last_month_start;

  SELECT COUNT(*) INTO v_pending
  FROM public.assinaturas
  WHERE barbeiro_id = p_barbeiro_id
    AND payment_method = 'cash'
    AND (status IN ('suspended','pending_cash')
         OR (status = 'active' AND COALESCE(cash_payment_confirmed,false) = false));

  SELECT
    COALESCE(SUM(valor) FILTER (WHERE created_at >= v_month_start::timestamptz), 0),
    COALESCE(SUM(valor) FILTER (WHERE created_at >= v_last_month_start::timestamptz AND created_at < v_month_start::timestamptz), 0)
  INTO v_pcm, v_pclm
  FROM public.pagamentos_plano_barbearia
  WHERE barbeiro_id = p_barbeiro_id AND created_at >= v_last_month_start::timestamptz;

  -- public.payments só armazena cobranças PIX (não existe coluna payment_method)
  SELECT
    COALESCE(SUM(p.amount) FILTER (WHERE p.created_at >= v_month_start::timestamptz), 0),
    COALESCE(SUM(p.amount) FILTER (WHERE p.created_at >= v_last_month_start::timestamptz AND p.created_at < v_month_start::timestamptz), 0)
  INTO v_ppm, v_pplm
  FROM public.payments p
  WHERE p.barbeiro_id = p_barbeiro_id
    AND p.status = 'paid'
    AND p.created_at >= v_last_month_start::timestamptz;

  SELECT jsonb_build_object(
    'hora', to_char(a.hora, 'HH24:MI'),
    'clientName', COALESCE(a.cliente_nome, 'Cliente'),
    'serviceName', COALESCE(a.servico_nome, 'Serviço')
  ) INTO v_next
  FROM public.agendamentos a
  WHERE a.barbeiro_id = p_barbeiro_id
    AND ((a.data = v_today AND a.hora >= v_now_time) OR a.data > v_today)
    AND a.status IN ('pending','confirmed')
  ORDER BY a.data ASC, a.hora ASC
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(row_json ORDER BY ord), '[]'::jsonb) INTO v_recent
  FROM (
    SELECT
      jsonb_build_object(
        'id', a.id,
        'data', a.data,
        'hora', to_char(a.hora, 'HH24:MI'),
        'status', a.status::text,
        'clientName', COALESCE(a.cliente_nome, 'Cliente'),
        'serviceName', COALESCE(a.servico_nome, 'Serviço')
      ) AS row_json,
      row_number() OVER () AS ord
    FROM (
      SELECT id, data, hora, status, cliente_nome, servico_nome
      FROM public.agendamentos
      WHERE barbeiro_id = p_barbeiro_id AND status = 'completed'
      ORDER BY data DESC, hora DESC
      LIMIT 5
    ) a
  ) x;

  INSERT INTO public.barber_home_snapshot (
    barbeiro_id, computed_for_date, today_count, yesterday_count, pending_cash_count,
    month_cuts, last_month_cuts, apt_month_revenue, apt_last_month_revenue,
    plan_cash_month, plan_cash_last_month, plan_pix_month, plan_pix_last_month,
    next_appointment, recent_appointments, is_stale, updated_at
  ) VALUES (
    p_barbeiro_id, v_today, COALESCE(v_agg.tc, 0), COALESCE(v_agg.yc, 0), v_pending,
    COALESCE(v_agg.mc, 0), COALESCE(v_agg.lmc, 0), COALESCE(v_agg.mr, 0), COALESCE(v_agg.lmr, 0),
    v_pcm, v_pclm, v_ppm, v_pplm,
    v_next, v_recent, false, now()
  )
  ON CONFLICT (barbeiro_id) DO UPDATE SET
    computed_for_date = EXCLUDED.computed_for_date,
    today_count = EXCLUDED.today_count,
    yesterday_count = EXCLUDED.yesterday_count,
    pending_cash_count = EXCLUDED.pending_cash_count,
    month_cuts = EXCLUDED.month_cuts,
    last_month_cuts = EXCLUDED.last_month_cuts,
    apt_month_revenue = EXCLUDED.apt_month_revenue,
    apt_last_month_revenue = EXCLUDED.apt_last_month_revenue,
    plan_cash_month = EXCLUDED.plan_cash_month,
    plan_cash_last_month = EXCLUDED.plan_cash_last_month,
    plan_pix_month = EXCLUDED.plan_pix_month,
    plan_pix_last_month = EXCLUDED.plan_pix_last_month,
    next_appointment = EXCLUDED.next_appointment,
    recent_appointments = EXCLUDED.recent_appointments,
    is_stale = false,
    updated_at = now();
END;
$function$;

-- Torna o dashboard resiliente: nunca falha por causa do recálculo
CREATE OR REPLACE FUNCTION public.get_barber_dashboard_fast(p_barbeiro_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_can_access boolean := false;
  v_snap public.barber_home_snapshot;
  v_apt_month numeric := 0;
  v_apt_last numeric := 0;
  v_plan_month numeric := 0;
  v_plan_last numeric := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_user_id AND role IN ('admin','tenant_admin')
  ) INTO v_is_admin;

  SELECT EXISTS (
    SELECT 1
    FROM public.barbeiros b
    LEFT JOIN public.tenants t ON t.id = b.tenant_id
    WHERE b.id = p_barbeiro_id
      AND (b.user_id = v_user_id OR t.owner_user_id = v_user_id OR v_is_admin)
  ) INTO v_can_access;

  IF NOT v_can_access THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_snap
  FROM public.barber_home_snapshot
  WHERE barbeiro_id = p_barbeiro_id;

  IF NOT FOUND OR v_snap.computed_for_date <> CURRENT_DATE OR COALESCE(v_snap.is_stale,false) THEN
    BEGIN
      PERFORM public.refresh_barber_home_snapshot(p_barbeiro_id);
      SELECT * INTO v_snap
      FROM public.barber_home_snapshot
      WHERE barbeiro_id = p_barbeiro_id;
    EXCEPTION WHEN OTHERS THEN
      NULL; -- mantém o snapshot anterior; nunca derruba a home
    END;
  END IF;

  v_apt_month := COALESCE(v_snap.apt_month_revenue, 0);
  v_apt_last := COALESCE(v_snap.apt_last_month_revenue, 0);
  v_plan_month := COALESCE(v_snap.plan_cash_month, 0) + COALESCE(v_snap.plan_pix_month, 0);
  v_plan_last := COALESCE(v_snap.plan_cash_last_month, 0) + COALESCE(v_snap.plan_pix_last_month, 0);

  RETURN jsonb_build_object(
    'todayCount', COALESCE(v_snap.today_count, 0),
    'yesterdayCount', COALESCE(v_snap.yesterday_count, 0),
    'pendingCount', COALESCE(v_snap.pending_cash_count, 0),
    'monthCuts', COALESCE(v_snap.month_cuts, 0),
    'lastMonthCuts', COALESCE(v_snap.last_month_cuts, 0),
    'monthRevenue', v_apt_month + v_plan_month,
    'lastMonthRevenue', v_apt_last + v_plan_last,
    'appointmentsMonthRevenue', v_apt_month,
    'planMonthRevenue', v_plan_month,
    'planCashMonth', COALESCE(v_snap.plan_cash_month, 0),
    'planPixMonth', COALESCE(v_snap.plan_pix_month, 0),
    'nextAppointment', v_snap.next_appointment,
    'recentAppointments', COALESCE(v_snap.recent_appointments, '[]'::jsonb),
    'snapshotUpdatedAt', v_snap.updated_at,
    'snapshotStale', COALESCE(v_snap.is_stale, false)
  );
END;
$function$;

-- Backfill: garante snapshot atualizado para TODOS os barbeiros
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.barbeiros LOOP
    BEGIN
      PERFORM public.refresh_barber_home_snapshot(r.id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END $$;