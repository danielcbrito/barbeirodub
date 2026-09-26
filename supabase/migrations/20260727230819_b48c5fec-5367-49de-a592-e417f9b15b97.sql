-- =========================================================
-- PERFORMANCE PASS: snapshots + targeted indexes
-- =========================================================

-- 1) Targeted indexes for the high-volume app paths
CREATE INDEX IF NOT EXISTS idx_agendamentos_user_visible_data_hora_fast
ON public.agendamentos (user_id, visivel_para_usuario, data DESC, hora DESC)
INCLUDE (id, status, duracao, preco, observacoes, cancelado_em, cliente_confirmou, barbeiro_confirmou, ponto_liberado, remarcacao_solicitada, motivo_remarcacao, tipo_agendamento, criado_por, servico_id, barbeiro_id)
WHERE status <> 'excluido';

CREATE INDEX IF NOT EXISTS idx_agendamentos_user_completed_free_fast
ON public.agendamentos (user_id, status, is_free)
WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS idx_agendamentos_barbeiro_payment_created_fast
ON public.agendamentos (barbeiro_id, status, payment_method, created_at DESC)
INCLUDE (id, preco, data, hora)
WHERE status IN ('completed', 'confirmed');

CREATE INDEX IF NOT EXISTS idx_agendamentos_barbeiro_past_clients_fast
ON public.agendamentos (barbeiro_id, data, status)
INCLUDE (user_id)
WHERE status IN ('confirmed', 'completed', 'pending');

CREATE INDEX IF NOT EXISTS idx_pending_bookings_user_created_fast
ON public.pending_bookings (user_id, created_at DESC)
INCLUDE (id, data, hora, servico_id, preco, payment_method, duracao);

CREATE INDEX IF NOT EXISTS idx_pending_bookings_barber_date_active_fast
ON public.pending_bookings (barbeiro_id, data, expires_at)
INCLUDE (id, hora, duracao)
WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assinaturas_user_status_fast
ON public.assinaturas (user_id, status, created_at DESC)
INCLUDE (id, barbeiro_id, plano_id, payment_method, cash_payment_confirmed, next_billing_date, ciclo_inicio, ciclo_fim, usos_ciclo_atual);

CREATE INDEX IF NOT EXISTS idx_resgates_user_status_fast
ON public.resgates (user_id, status, created_at DESC)
INCLUDE (id, appointment_id);

CREATE INDEX IF NOT EXISTS idx_promocoes_tenant_active_points_fast
ON public.promocoes (tenant_id, ativo)
INCLUDE (pontos_necessarios)
WHERE ativo = true;

-- 2) Client home snapshot: one already-assembled row instead of many frontend round-trips
CREATE TABLE IF NOT EXISTS public.client_home_snapshot (
  user_id uuid PRIMARY KEY,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  appointments jsonb NOT NULL DEFAULT '[]'::jsonb,
  pending_bookings jsonb NOT NULL DEFAULT '[]'::jsonb,
  has_active_plan boolean NOT NULL DEFAULT false,
  available_credits numeric NOT NULL DEFAULT 0,
  paid_completed_count integer NOT NULL DEFAULT 0,
  total_completed_count integer NOT NULL DEFAULT 0,
  redemptions_total integer NOT NULL DEFAULT 0,
  redemptions_available integer NOT NULL DEFAULT 0,
  required_points integer NOT NULL DEFAULT 8,
  points integer NOT NULL DEFAULT 0,
  loyalty_active boolean NOT NULL DEFAULT false,
  is_stale boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.client_home_snapshot TO authenticated;
GRANT ALL ON public.client_home_snapshot TO service_role;

ALTER TABLE public.client_home_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clients can read own home snapshot" ON public.client_home_snapshot;
CREATE POLICY "Clients can read own home snapshot"
ON public.client_home_snapshot
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 3) Refresh one client snapshot server-side
CREATE OR REPLACE FUNCTION public.refresh_client_home_snapshot(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile jsonb := '{}'::jsonb;
  v_appointments jsonb := '[]'::jsonb;
  v_pending_bookings jsonb := '[]'::jsonb;
  v_has_active_plan boolean := false;
  v_available_credits numeric := 0;
  v_paid_completed integer := 0;
  v_total_completed integer := 0;
  v_redemptions_total integer := 0;
  v_redemptions_available integer := 0;
  v_required_points integer := 8;
  v_points integer := 0;
  v_loyalty_active boolean := false;
  v_tenant_id uuid := NULL;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT jsonb_build_object(
    'id', p.id,
    'nome', p.nome,
    'telefone', p.telefone,
    'avatar_url', p.avatar_url,
    'banner_url', p.banner_url,
    'barbearia_preferida_id', p.barbearia_preferida_id
  ), p.barbearia_preferida_id
  INTO v_profile, v_tenant_id
  FROM public.profiles p
  WHERE p.id = p_user_id
  LIMIT 1;

  v_profile := COALESCE(v_profile, '{}'::jsonb);

  SELECT EXISTS (
    SELECT 1
    FROM public.assinaturas a
    WHERE a.user_id = p_user_id
      AND a.status IN ('active', 'pending_cash')
    LIMIT 1
  ) INTO v_has_active_plan;

  BEGIN
    SELECT COALESCE(public.get_user_available_credits(p_user_id), 0)
    INTO v_available_credits;
  EXCEPTION WHEN OTHERS THEN
    v_available_credits := 0;
  END;

  SELECT COALESCE(jsonb_agg(row_json ORDER BY data DESC, hora DESC), '[]'::jsonb)
  INTO v_appointments
  FROM (
    SELECT
      a.data,
      a.hora,
      jsonb_build_object(
        'id', a.id,
        'data', a.data,
        'hora', to_char(a.hora, 'HH24:MI'),
        'status', a.status::text,
        'duracao', a.duracao,
        'preco', a.preco,
        'observacoes', a.observacoes,
        'cancelado_em', a.cancelado_em,
        'visivel_para_usuario', a.visivel_para_usuario,
        'cliente_confirmou', a.cliente_confirmou,
        'barbeiro_confirmou', a.barbeiro_confirmou,
        'ponto_liberado', a.ponto_liberado,
        'remarcacao_solicitada', a.remarcacao_solicitada,
        'motivo_remarcacao', a.motivo_remarcacao,
        'tipo_agendamento', a.tipo_agendamento,
        'criado_por', a.criado_por,
        'servico', CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object('nome', s.nome) END,
        'barbeiros', CASE WHEN b.id IS NULL THEN NULL ELSE jsonb_build_object('apelido', b.apelido) END,
        'pagamentos', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('metodo', pg.metodo, 'status', pg.status))
          FROM public.pagamentos pg
          WHERE pg.agendamento_id = a.id
        ), '[]'::jsonb)
      ) AS row_json
    FROM public.agendamentos a
    LEFT JOIN public.servicos s ON s.id = a.servico_id
    LEFT JOIN public.barbeiros b ON b.id = a.barbeiro_id
    WHERE a.user_id = p_user_id
      AND a.visivel_para_usuario = true
      AND COALESCE(a.tipo_agendamento, '') <> 'encaixe_manual'
      AND a.status <> 'excluido'
    ORDER BY a.data DESC, a.hora DESC
    LIMIT 5
  ) x;

  SELECT COALESCE(jsonb_agg(row_json ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_pending_bookings
  FROM (
    SELECT
      pb.created_at,
      jsonb_build_object(
        'id', pb.id,
        'data', pb.data,
        'hora', to_char(pb.hora, 'HH24:MI'),
        'servico_id', pb.servico_id,
        'preco', pb.preco,
        'payment_method', pb.payment_method,
        'created_at', pb.created_at,
        'servico', CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object('nome', s.nome) END
      ) AS row_json
    FROM public.pending_bookings pb
    LEFT JOIN public.servicos s ON s.id = pb.servico_id
    WHERE pb.user_id = p_user_id
    ORDER BY pb.created_at DESC
    LIMIT 10
  ) x;

  SELECT COUNT(*)::int
  INTO v_paid_completed
  FROM public.agendamentos a
  WHERE a.user_id = p_user_id
    AND a.status = 'completed'
    AND COALESCE(a.is_free, false) = false;

  SELECT COUNT(*)::int
  INTO v_total_completed
  FROM public.agendamentos a
  WHERE a.user_id = p_user_id
    AND a.status = 'completed';

  SELECT COUNT(*)::int,
         COUNT(*) FILTER (WHERE r.status = 'available')::int
  INTO v_redemptions_total, v_redemptions_available
  FROM public.resgates r
  WHERE r.user_id = p_user_id;

  BEGIN
    SELECT COALESCE(public.get_client_loyalty_required_points(p_user_id), 8)::int
    INTO v_required_points;
  EXCEPTION WHEN OTHERS THEN
    v_required_points := 8;
  END;

  IF v_required_points IS NULL OR v_required_points < 2 THEN
    v_required_points := 8;
  END IF;

  v_points := GREATEST(0, v_paid_completed - (v_redemptions_total * v_required_points));

  SELECT EXISTS (
    SELECT 1
    FROM public.promocoes pr
    WHERE pr.ativo = true
      AND (
        (v_tenant_id IS NOT NULL AND pr.tenant_id = v_tenant_id)
        OR (v_tenant_id IS NULL AND pr.tenant_id IS NULL)
      )
    LIMIT 1
  ) INTO v_loyalty_active;

  INSERT INTO public.client_home_snapshot (
    user_id,
    profile,
    appointments,
    pending_bookings,
    has_active_plan,
    available_credits,
    paid_completed_count,
    total_completed_count,
    redemptions_total,
    redemptions_available,
    required_points,
    points,
    loyalty_active,
    is_stale,
    updated_at
  ) VALUES (
    p_user_id,
    v_profile,
    COALESCE(v_appointments, '[]'::jsonb),
    COALESCE(v_pending_bookings, '[]'::jsonb),
    v_has_active_plan,
    COALESCE(v_available_credits, 0),
    COALESCE(v_paid_completed, 0),
    COALESCE(v_total_completed, 0),
    COALESCE(v_redemptions_total, 0),
    COALESCE(v_redemptions_available, 0),
    COALESCE(v_required_points, 8),
    COALESCE(v_points, 0),
    COALESCE(v_loyalty_active, false),
    false,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    profile = EXCLUDED.profile,
    appointments = EXCLUDED.appointments,
    pending_bookings = EXCLUDED.pending_bookings,
    has_active_plan = EXCLUDED.has_active_plan,
    available_credits = EXCLUDED.available_credits,
    paid_completed_count = EXCLUDED.paid_completed_count,
    total_completed_count = EXCLUDED.total_completed_count,
    redemptions_total = EXCLUDED.redemptions_total,
    redemptions_available = EXCLUDED.redemptions_available,
    required_points = EXCLUDED.required_points,
    points = EXCLUDED.points,
    loyalty_active = EXCLUDED.loyalty_active,
    is_stale = false,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_client_home_snapshot(uuid) TO authenticated, service_role;

-- 4) Client-facing bundle: one RPC, refreshes only when there is no snapshot yet
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

  IF NOT FOUND THEN
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

-- 5) Mark affected client snapshot stale; the app can still read the last snapshot instantly
CREATE OR REPLACE FUNCTION public.mark_client_home_snapshot_stale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := NULL;
BEGIN
  IF TG_TABLE_NAME = 'agendamentos' THEN
    v_user_id := COALESCE(NEW.user_id, OLD.user_id);
  ELSIF TG_TABLE_NAME = 'pagamentos' THEN
    v_user_id := COALESCE(NEW.user_id, OLD.user_id);
    IF v_user_id IS NULL THEN
      SELECT a.user_id INTO v_user_id
      FROM public.agendamentos a
      WHERE a.id = COALESCE(NEW.agendamento_id, OLD.agendamento_id)
      LIMIT 1;
    END IF;
  ELSIF TG_TABLE_NAME = 'pending_bookings' THEN
    v_user_id := COALESCE(NEW.user_id, OLD.user_id);
  ELSIF TG_TABLE_NAME = 'assinaturas' THEN
    v_user_id := COALESCE(NEW.user_id, OLD.user_id);
  ELSIF TG_TABLE_NAME = 'resgates' THEN
    v_user_id := COALESCE(NEW.user_id, OLD.user_id);
  ELSIF TG_TABLE_NAME = 'pontos' THEN
    v_user_id := COALESCE(NEW.user_id, OLD.user_id);
  ELSIF TG_TABLE_NAME = 'profiles' THEN
    v_user_id := COALESCE(NEW.id, OLD.id);
  END IF;

  IF v_user_id IS NOT NULL THEN
    UPDATE public.client_home_snapshot
    SET is_stale = true
    WHERE user_id = v_user_id;
  ELSIF TG_TABLE_NAME = 'promocoes' THEN
    UPDATE public.client_home_snapshot
    SET is_stale = true;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_client_snapshot_stale_agendamentos ON public.agendamentos;
CREATE TRIGGER trg_client_snapshot_stale_agendamentos
AFTER INSERT OR UPDATE OR DELETE ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.mark_client_home_snapshot_stale();

DROP TRIGGER IF EXISTS trg_client_snapshot_stale_pagamentos ON public.pagamentos;
CREATE TRIGGER trg_client_snapshot_stale_pagamentos
AFTER INSERT OR UPDATE OR DELETE ON public.pagamentos
FOR EACH ROW EXECUTE FUNCTION public.mark_client_home_snapshot_stale();

DROP TRIGGER IF EXISTS trg_client_snapshot_stale_pending_bookings ON public.pending_bookings;
CREATE TRIGGER trg_client_snapshot_stale_pending_bookings
AFTER INSERT OR UPDATE OR DELETE ON public.pending_bookings
FOR EACH ROW EXECUTE FUNCTION public.mark_client_home_snapshot_stale();

DROP TRIGGER IF EXISTS trg_client_snapshot_stale_assinaturas ON public.assinaturas;
CREATE TRIGGER trg_client_snapshot_stale_assinaturas
AFTER INSERT OR UPDATE OR DELETE ON public.assinaturas
FOR EACH ROW EXECUTE FUNCTION public.mark_client_home_snapshot_stale();

DROP TRIGGER IF EXISTS trg_client_snapshot_stale_resgates ON public.resgates;
CREATE TRIGGER trg_client_snapshot_stale_resgates
AFTER INSERT OR UPDATE OR DELETE ON public.resgates
FOR EACH ROW EXECUTE FUNCTION public.mark_client_home_snapshot_stale();

DROP TRIGGER IF EXISTS trg_client_snapshot_stale_pontos ON public.pontos;
CREATE TRIGGER trg_client_snapshot_stale_pontos
AFTER INSERT OR UPDATE OR DELETE ON public.pontos
FOR EACH ROW EXECUTE FUNCTION public.mark_client_home_snapshot_stale();

DROP TRIGGER IF EXISTS trg_client_snapshot_stale_profiles ON public.profiles;
CREATE TRIGGER trg_client_snapshot_stale_profiles
AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.mark_client_home_snapshot_stale();

DROP TRIGGER IF EXISTS trg_client_snapshot_stale_promocoes ON public.promocoes;
CREATE TRIGGER trg_client_snapshot_stale_promocoes
AFTER INSERT OR UPDATE OR DELETE ON public.promocoes
FOR EACH ROW EXECUTE FUNCTION public.mark_client_home_snapshot_stale();

-- 6) Barber dashboard: do not recalculate during app boot when a snapshot already exists.
-- Triggers/cron keep it warm; boot must return immediately.
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

  SELECT * INTO v_snap
  FROM public.barber_home_snapshot
  WHERE barbeiro_id = p_barbeiro_id;

  -- Only the first ever access or day rollover computes synchronously.
  -- A stale same-day snapshot is still returned instantly and refreshed by triggers/cron.
  IF NOT FOUND OR v_snap.computed_for_date <> CURRENT_DATE THEN
    PERFORM public.refresh_barber_home_snapshot(p_barbeiro_id);
    SELECT * INTO v_snap
    FROM public.barber_home_snapshot
    WHERE barbeiro_id = p_barbeiro_id;
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
$$;

GRANT EXECUTE ON FUNCTION public.get_barber_dashboard_fast(uuid) TO authenticated, service_role;

-- 7) Background refresh for stale client snapshots (safe if pg_cron is unavailable)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    BEGIN
      PERFORM cron.unschedule('refresh-client-home-snapshots');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    PERFORM cron.schedule(
      'refresh-client-home-snapshots',
      '* * * * *',
      $CRON$
        SELECT public.refresh_client_home_snapshot(s.user_id)
        FROM public.client_home_snapshot s
        WHERE s.is_stale = true
        ORDER BY s.updated_at ASC
        LIMIT 200;
      $CRON$
    );
  END IF;
END $$;

-- 8) Warm existing snapshots for users who already have appointments or profiles.
INSERT INTO public.client_home_snapshot (user_id, is_stale)
SELECT DISTINCT p.id, true
FROM public.profiles p
ON CONFLICT (user_id) DO UPDATE SET is_stale = true;
