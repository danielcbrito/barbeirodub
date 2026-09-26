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
    COALESCE(SUM(COALESCE(preco_final, preco)) FILTER (WHERE data >= v_month_start AND status = 'completed'), 0) AS mr,
    COALESCE(SUM(COALESCE(preco_final, preco)) FILTER (WHERE data >= v_last_month_start AND data <= v_last_month_end AND status = 'completed'), 0) AS lmr
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
    'clientName', COALESCE(pr.nome, 'Cliente'),
    'serviceName', COALESCE(s.nome, 'Serviço')
  ) INTO v_next
  FROM public.agendamentos a
  LEFT JOIN public.profiles pr ON pr.id = a.user_id
  LEFT JOIN public.servicos s ON s.id = a.servico_id
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
        'clientName', COALESCE(a.nome_cliente, 'Cliente'),
        'serviceName', COALESCE(a.nome_servico, 'Serviço')
      ) AS row_json,
      row_number() OVER () AS ord
    FROM (
      SELECT ag.id, ag.data, ag.hora, ag.status, pr.nome AS nome_cliente, s.nome AS nome_servico
      FROM public.agendamentos ag
      LEFT JOIN public.profiles pr ON pr.id = ag.user_id
      LEFT JOIN public.servicos s ON s.id = ag.servico_id
      WHERE ag.barbeiro_id = p_barbeiro_id AND ag.status = 'completed'
      ORDER BY ag.data DESC, ag.hora DESC
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

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.barbeiros LOOP
    PERFORM public.refresh_barber_home_snapshot(r.id);
  END LOOP;
END $$;