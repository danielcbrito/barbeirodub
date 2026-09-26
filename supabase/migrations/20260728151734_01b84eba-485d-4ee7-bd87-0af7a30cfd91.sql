CREATE OR REPLACE FUNCTION public.get_admin_dashboard_fast(
  p_barbeiro_id uuid DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_ids uuid[] := NULL;          -- NULL = escopo global (admin puro)
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_now_time text := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI');
  v_yesterday date := v_today - 1;
  v_month_start date := date_trunc('month', v_today)::date;
  v_last_month_start date := (date_trunc('month', v_today) - interval '1 month')::date;
  v_last_month_end date := v_month_start - 1;
  v_week_ago date := v_today - 7;
  v_today_count int := 0;
  v_yesterday_count int := 0;
  v_pending_count int := 0;
  v_month_cuts int := 0;
  v_last_month_cuts int := 0;
  v_apt_month_rev numeric := 0;
  v_apt_last_rev numeric := 0;
  v_plan_cash_month numeric := 0;
  v_plan_cash_last numeric := 0;
  v_plan_pix_month numeric := 0;
  v_plan_pix_last numeric := 0;
  v_active_clients int := 0;
  v_new_week int := 0;
  v_new_month int := 0;
  v_next jsonb := NULL;
  v_recent jsonb := '[]'::jsonb;
  v_daily jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_is_admin := public.has_role(v_uid, 'admin'::app_role);

  IF p_barbeiro_id IS NOT NULL THEN
    IF NOT (
      v_is_admin
      OR EXISTS (SELECT 1 FROM public.barbeiros b WHERE b.id = p_barbeiro_id AND b.user_id = v_uid)
      OR EXISTS (
        SELECT 1 FROM public.barbeiros b
        JOIN public.tenants t ON t.id = b.tenant_id
        WHERE b.id = p_barbeiro_id AND t.owner_user_id = v_uid
      )
    ) THEN
      RAISE EXCEPTION 'not allowed';
    END IF;
    v_ids := ARRAY[p_barbeiro_id];
  ELSIF p_tenant_id IS NOT NULL THEN
    IF NOT (
      v_is_admin
      OR EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id AND t.owner_user_id = v_uid)
    ) THEN
      RAISE EXCEPTION 'not allowed';
    END IF;
    SELECT COALESCE(array_agg(b.id), ARRAY[]::uuid[]) INTO v_ids
    FROM public.barbeiros b
    WHERE b.tenant_id = p_tenant_id AND b.ativo = true AND b.deleted_at IS NULL;
  ELSE
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'not allowed';
    END IF;
    v_ids := NULL;
  END IF;

  -- Contadores de agendamentos
  SELECT
    count(*) FILTER (WHERE a.data = v_today AND a.status IN ('pending','confirmed','completed')),
    count(*) FILTER (WHERE a.data = v_yesterday AND a.status IN ('pending','confirmed','completed')),
    count(*) FILTER (WHERE a.data >= v_month_start AND a.status = 'completed'),
    count(*) FILTER (WHERE a.data BETWEEN v_last_month_start AND v_last_month_end AND a.status = 'completed'),
    COALESCE(sum(a.preco) FILTER (WHERE a.data >= v_month_start AND a.status = 'completed'), 0),
    COALESCE(sum(a.preco) FILTER (WHERE a.data BETWEEN v_last_month_start AND v_last_month_end AND a.status = 'completed'), 0)
  INTO v_today_count, v_yesterday_count, v_month_cuts, v_last_month_cuts, v_apt_month_rev, v_apt_last_rev
  FROM public.agendamentos a
  WHERE (v_ids IS NULL OR a.barbeiro_id = ANY(v_ids))
    AND a.data >= v_last_month_start;

  -- Assinaturas pendentes (dinheiro)
  SELECT count(*) INTO v_pending_count
  FROM public.assinaturas s
  WHERE (v_ids IS NULL OR s.barbeiro_id = ANY(v_ids))
    AND s.payment_method = 'cash'
    AND (
      s.status IN ('suspended','pending_cash')
      OR (s.status = 'active' AND COALESCE(s.cash_payment_confirmed, false) = false)
    );

  -- Receita de planos (dinheiro)
  SELECT
    COALESCE(sum(pb.valor) FILTER (WHERE pb.created_at >= v_month_start), 0),
    COALESCE(sum(pb.valor) FILTER (WHERE pb.created_at >= v_last_month_start AND pb.created_at < v_month_start), 0)
  INTO v_plan_cash_month, v_plan_cash_last
  FROM public.pagamentos_plano_barbearia pb
  WHERE (v_ids IS NULL OR pb.barbeiro_id = ANY(v_ids))
    AND pb.created_at >= v_last_month_start;

  -- Receita de planos (PIX/gateway)
  SELECT
    COALESCE(sum(pg.valor) FILTER (WHERE pg.created_at >= v_month_start), 0),
    COALESCE(sum(pg.valor) FILTER (WHERE pg.created_at >= v_last_month_start AND pg.created_at < v_month_start), 0)
  INTO v_plan_pix_month, v_plan_pix_last
  FROM public.pagamentos pg
  JOIN public.assinaturas s2 ON s2.id = pg.assinatura_id
  WHERE pg.assinatura_id IS NOT NULL
    AND pg.agendamento_id IS NULL
    AND pg.status = 'paid'
    AND pg.created_at >= v_last_month_start
    AND (v_ids IS NULL OR s2.barbeiro_id = ANY(v_ids));

  -- Clientes ativos
  IF v_ids IS NULL THEN
    SELECT count(*) INTO v_active_clients FROM public.profiles p WHERE COALESCE(p.blocked, false) = false;
  ELSE
    SELECT count(DISTINCT a.user_id) INTO v_active_clients
    FROM public.agendamentos a
    WHERE a.barbeiro_id = ANY(v_ids) AND a.status IN ('confirmed','completed');
  END IF;

  -- Novos clientes (semana / mês): primeiro agendamento dentro do período
  WITH firsts AS (
    SELECT a.user_id, min(a.data) AS first_data
    FROM public.agendamentos a
    WHERE (v_ids IS NULL OR a.barbeiro_id = ANY(v_ids))
      AND a.status IN ('confirmed','completed')
    GROUP BY a.user_id
  )
  SELECT
    count(*) FILTER (WHERE first_data >= v_week_ago),
    count(*) FILTER (WHERE first_data >= v_month_start)
  INTO v_new_week, v_new_month
  FROM firsts;

  -- Próximo agendamento
  SELECT jsonb_build_object(
    'hora', substring(a.hora::text, 1, 5),
    'clientName', COALESCE(p.nome, 'Cliente'),
    'serviceName', COALESCE(sv.nome, 'Serviço')
  ) INTO v_next
  FROM public.agendamentos a
  LEFT JOIN public.profiles p ON p.id = a.user_id
  LEFT JOIN public.servicos sv ON sv.id = a.servico_id
  WHERE (v_ids IS NULL OR a.barbeiro_id = ANY(v_ids))
    AND a.data = v_today
    AND a.status IN ('pending','confirmed')
    AND substring(a.hora::text, 1, 5) >= v_now_time
  ORDER BY a.hora ASC
  LIMIT 1;

  -- Atividade recente
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'data' DESC, x->>'hora' DESC), '[]'::jsonb) INTO v_recent
  FROM (
    SELECT jsonb_build_object(
      'id', a.id,
      'data', a.data,
      'hora', substring(a.hora::text, 1, 5),
      'status', COALESCE(a.status::text, 'pending'),
      'clientName', COALESCE(p.nome, 'Cliente'),
      'serviceName', COALESCE(sv.nome, 'Serviço')
    ) AS x
    FROM public.agendamentos a
    LEFT JOIN public.profiles p ON p.id = a.user_id
    LEFT JOIN public.servicos sv ON sv.id = a.servico_id
    WHERE (v_ids IS NULL OR a.barbeiro_id = ANY(v_ids))
    ORDER BY a.data DESC, a.hora DESC
    LIMIT 5
  ) t;

  -- Receita diária (7 dias)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d.dia, 'receita', COALESCE(r.total, 0)) ORDER BY d.dia), '[]'::jsonb)
  INTO v_daily
  FROM generate_series(v_today - 6, v_today, interval '1 day') AS d(dia)
  LEFT JOIN (
    SELECT a.data, sum(a.preco) AS total
    FROM public.agendamentos a
    WHERE (v_ids IS NULL OR a.barbeiro_id = ANY(v_ids))
      AND a.status = 'completed'
      AND a.data >= v_today - 6
    GROUP BY a.data
  ) r ON r.data = d.dia::date;

  RETURN jsonb_build_object(
    'todayCount', v_today_count,
    'yesterdayCount', v_yesterday_count,
    'pendingCount', v_pending_count,
    'nextAppointment', v_next,
    'monthRevenue', v_apt_month_rev + v_plan_cash_month + v_plan_pix_month,
    'lastMonthRevenue', v_apt_last_rev + v_plan_cash_last + v_plan_pix_last,
    'monthCuts', v_month_cuts,
    'lastMonthCuts', v_last_month_cuts,
    'activeClients', v_active_clients,
    'newClientsWeek', v_new_week,
    'newClientsMonth', v_new_month,
    'recentAppointments', v_recent,
    'dailyRevenue', v_daily
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_dashboard_fast(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_fast(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_fast(uuid, uuid) TO service_role;

CREATE INDEX IF NOT EXISTS idx_agendamentos_barbeiro_data_status ON public.agendamentos (barbeiro_id, data, status);
CREATE INDEX IF NOT EXISTS idx_pagamentos_assinatura_created ON public.pagamentos (assinatura_id, created_at) WHERE assinatura_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ppb_barbeiro_created ON public.pagamentos_plano_barbearia (barbeiro_id, created_at);