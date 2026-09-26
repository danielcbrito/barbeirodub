-- 1) Snapshot table
CREATE TABLE IF NOT EXISTS public.barber_home_snapshot (
  barbeiro_id uuid PRIMARY KEY REFERENCES public.barbeiros(id) ON DELETE CASCADE,
  computed_for_date date NOT NULL DEFAULT CURRENT_DATE,
  today_count integer NOT NULL DEFAULT 0,
  yesterday_count integer NOT NULL DEFAULT 0,
  pending_cash_count integer NOT NULL DEFAULT 0,
  month_cuts integer NOT NULL DEFAULT 0,
  last_month_cuts integer NOT NULL DEFAULT 0,
  apt_month_revenue numeric NOT NULL DEFAULT 0,
  apt_last_month_revenue numeric NOT NULL DEFAULT 0,
  plan_cash_month numeric NOT NULL DEFAULT 0,
  plan_cash_last_month numeric NOT NULL DEFAULT 0,
  plan_pix_month numeric NOT NULL DEFAULT 0,
  plan_pix_last_month numeric NOT NULL DEFAULT 0,
  next_appointment jsonb,
  recent_appointments jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_stale boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.barber_home_snapshot TO authenticated;
GRANT ALL ON public.barber_home_snapshot TO service_role;

ALTER TABLE public.barber_home_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "snapshot owner read" ON public.barber_home_snapshot;
CREATE POLICY "snapshot owner read"
ON public.barber_home_snapshot
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.barbeiros b
    LEFT JOIN public.tenants t ON t.id = b.tenant_id
    WHERE b.id = barber_home_snapshot.barbeiro_id
      AND (
        b.user_id = auth.uid()
        OR t.owner_user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'tenant_admin'::app_role)
      )
  )
);

CREATE INDEX IF NOT EXISTS idx_bhs_stale ON public.barber_home_snapshot(is_stale) WHERE is_stale = true;

-- 2) Refresh function
CREATE OR REPLACE FUNCTION public.refresh_barber_home_snapshot(p_barbeiro_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  SELECT
    COUNT(*) FILTER (WHERE data = v_today AND status IN ('pending','confirmed','completed')) AS tc,
    COUNT(*) FILTER (WHERE data = v_yesterday AND status IN ('pending','confirmed','completed')) AS yc,
    COUNT(*) FILTER (WHERE data >= v_month_start AND status = 'completed') AS mc,
    COUNT(*) FILTER (WHERE data >= v_last_month_start AND data <= v_last_month_end AND status = 'completed') AS lmc,
    COALESCE(SUM(preco) FILTER (WHERE data >= v_month_start AND status = 'completed'), 0) AS mr,
    COALESCE(SUM(preco) FILTER (WHERE data >= v_last_month_start AND data <= v_last_month_end AND status = 'completed'), 0) AS lmr
  INTO v_agg
  FROM public.agendamentos
  WHERE barbeiro_id = p_barbeiro_id
    AND data >= v_last_month_start;

  SELECT COUNT(*) INTO v_pending
  FROM public.assinaturas
  WHERE barbeiro_id = p_barbeiro_id
    AND payment_method = 'cash'
    AND (
      status IN ('suspended','pending_cash')
      OR (status = 'active' AND COALESCE(cash_payment_confirmed,false) = false)
    );

  SELECT
    COALESCE(SUM(valor) FILTER (WHERE created_at >= v_month_start::timestamptz), 0),
    COALESCE(SUM(valor) FILTER (WHERE created_at >= v_last_month_start::timestamptz AND created_at < v_month_start::timestamptz), 0)
  INTO v_pcm, v_pclm
  FROM public.pagamentos_plano_barbearia
  WHERE barbeiro_id = p_barbeiro_id
    AND created_at >= v_last_month_start::timestamptz;

  SELECT
    COALESCE(SUM(p.valor) FILTER (WHERE p.created_at >= v_month_start::timestamptz), 0),
    COALESCE(SUM(p.valor) FILTER (WHERE p.created_at >= v_last_month_start::timestamptz AND p.created_at < v_month_start::timestamptz), 0)
  INTO v_ppm, v_pplm
  FROM public.payments p
  WHERE p.barbeiro_id = p_barbeiro_id
    AND p.status = 'paid'
    AND p.payment_method = 'pix'
    AND p.created_at >= v_last_month_start::timestamptz;

  SELECT to_jsonb(a) INTO v_next
  FROM (
    SELECT id, data, hora, cliente_nome, servico_nome, preco, status
    FROM public.agendamentos
    WHERE barbeiro_id = p_barbeiro_id
      AND ((data = v_today AND hora >= v_now_time) OR data > v_today)
      AND status IN ('pending','confirmed')
    ORDER BY data ASC, hora ASC
    LIMIT 1
  ) a;

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.data DESC, a.hora DESC), '[]'::jsonb) INTO v_recent
  FROM (
    SELECT id, data, hora, cliente_nome, servico_nome, preco, status
    FROM public.agendamentos
    WHERE barbeiro_id = p_barbeiro_id
      AND status = 'completed'
    ORDER BY data DESC, hora DESC
    LIMIT 5
  ) a;

  INSERT INTO public.barber_home_snapshot (
    barbeiro_id, computed_for_date, today_count, yesterday_count, pending_cash_count,
    month_cuts, last_month_cuts, apt_month_revenue, apt_last_month_revenue,
    plan_cash_month, plan_cash_last_month, plan_pix_month, plan_pix_last_month,
    next_appointment, recent_appointments, is_stale, updated_at
  ) VALUES (
    p_barbeiro_id, v_today, v_agg.tc, v_agg.yc, v_pending,
    v_agg.mc, v_agg.lmc, v_agg.mr, v_agg.lmr,
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
$$;

GRANT EXECUTE ON FUNCTION public.refresh_barber_home_snapshot(uuid) TO authenticated, service_role;

-- 3) Replace get_barber_dashboard_fast to serve from snapshot
CREATE OR REPLACE FUNCTION public.get_barber_dashboard_fast(p_barbeiro_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  SELECT * INTO v_snap FROM public.barber_home_snapshot WHERE barbeiro_id = p_barbeiro_id;

  IF NOT FOUND OR v_snap.is_stale OR v_snap.computed_for_date <> CURRENT_DATE THEN
    PERFORM public.refresh_barber_home_snapshot(p_barbeiro_id);
    SELECT * INTO v_snap FROM public.barber_home_snapshot WHERE barbeiro_id = p_barbeiro_id;
  END IF;

  v_apt_month := v_snap.apt_month_revenue;
  v_apt_last := v_snap.apt_last_month_revenue;
  v_plan_month := v_snap.plan_cash_month + v_snap.plan_pix_month;
  v_plan_last := v_snap.plan_cash_last_month + v_snap.plan_pix_last_month;

  RETURN jsonb_build_object(
    'todayCount', v_snap.today_count,
    'yesterdayCount', v_snap.yesterday_count,
    'pendingSubscriptionsCount', v_snap.pending_cash_count,
    'monthlyCuts', v_snap.month_cuts,
    'lastMonthlyCuts', v_snap.last_month_cuts,
    'monthlyRevenue', v_apt_month + v_plan_month,
    'lastMonthRevenue', v_apt_last + v_plan_last,
    'appointmentsMonthRevenue', v_apt_month,
    'planMonthRevenue', v_plan_month,
    'planCashMonth', v_snap.plan_cash_month,
    'planPixMonth', v_snap.plan_pix_month,
    'nextAppointment', v_snap.next_appointment,
    'recentAppointments', v_snap.recent_appointments,
    'snapshotUpdatedAt', v_snap.updated_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_barber_dashboard_fast(uuid) TO authenticated, service_role;

-- 4) Invalidation triggers: mark snapshot stale on relevant writes
CREATE OR REPLACE FUNCTION public.mark_barber_home_snapshot_stale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_barber uuid;
BEGIN
  v_barber := COALESCE(NEW.barbeiro_id, OLD.barbeiro_id);
  IF v_barber IS NOT NULL THEN
    UPDATE public.barber_home_snapshot SET is_stale = true WHERE barbeiro_id = v_barber;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_bhs_stale_agendamentos ON public.agendamentos;
CREATE TRIGGER trg_bhs_stale_agendamentos
AFTER INSERT OR UPDATE OR DELETE ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.mark_barber_home_snapshot_stale();

DROP TRIGGER IF EXISTS trg_bhs_stale_assinaturas ON public.assinaturas;
CREATE TRIGGER trg_bhs_stale_assinaturas
AFTER INSERT OR UPDATE OR DELETE ON public.assinaturas
FOR EACH ROW EXECUTE FUNCTION public.mark_barber_home_snapshot_stale();

DROP TRIGGER IF EXISTS trg_bhs_stale_pagamentos_plano ON public.pagamentos_plano_barbearia;
CREATE TRIGGER trg_bhs_stale_pagamentos_plano
AFTER INSERT OR UPDATE OR DELETE ON public.pagamentos_plano_barbearia
FOR EACH ROW EXECUTE FUNCTION public.mark_barber_home_snapshot_stale();

DROP TRIGGER IF EXISTS trg_bhs_stale_payments ON public.payments;
CREATE TRIGGER trg_bhs_stale_payments
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.mark_barber_home_snapshot_stale();

-- 5) Pre-seed snapshots for all active barbers (background-friendly)
INSERT INTO public.barber_home_snapshot (barbeiro_id, is_stale)
SELECT id, true FROM public.barbeiros WHERE ativo = true AND deleted_at IS NULL
ON CONFLICT (barbeiro_id) DO NOTHING;

-- 6) Daily cron to force recompute at midnight (rolls "today")
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('refresh-barber-home-snapshots-daily');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'refresh-barber-home-snapshots-daily',
      '5 3 * * *',
      $CRON$ UPDATE public.barber_home_snapshot SET is_stale = true; $CRON$
    );
  END IF;
END $$;