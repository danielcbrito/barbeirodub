
-- 1) Índices adicionais para consultas quentes
CREATE INDEX IF NOT EXISTS idx_pagamentos_assinatura_paid_month
  ON public.pagamentos (assinatura_id, created_at)
  INCLUDE (valor)
  WHERE status = 'paid' AND assinatura_id IS NOT NULL AND agendamento_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_agendamentos_barbeiro_data_completed
  ON public.agendamentos (barbeiro_id, data)
  INCLUDE (preco)
  WHERE status = 'completed'::appointment_status;

-- 2) Reescreve get_barber_dashboard_fast: uma única varredura em agendamentos
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
  v_today date := CURRENT_DATE;
  v_yesterday date := CURRENT_DATE - 1;
  v_month_start date := date_trunc('month', CURRENT_DATE)::date;
  v_last_month_start date := (date_trunc('month', CURRENT_DATE) - interval '1 month')::date;
  v_last_month_end date := (date_trunc('month', CURRENT_DATE) - interval '1 day')::date;
  v_now_time time := LOCALTIME;
  v_agg record;
  v_pending_count integer := 0;
  v_plan_cash_month numeric := 0;
  v_plan_cash_last_month numeric := 0;
  v_plan_pix_month numeric := 0;
  v_plan_pix_last_month numeric := 0;
  v_next jsonb := NULL;
  v_recent jsonb := '[]'::jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_user_id AND role IN ('admin', 'tenant_admin')
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

  -- Um único scan em agendamentos calculando todas as agregações via FILTER
  SELECT
    COUNT(*) FILTER (
      WHERE data = v_today
        AND status = ANY (ARRAY['pending'::appointment_status, 'confirmed'::appointment_status, 'completed'::appointment_status])
    ) AS today_count,
    COUNT(*) FILTER (
      WHERE data = v_yesterday
        AND status = ANY (ARRAY['pending'::appointment_status, 'confirmed'::appointment_status, 'completed'::appointment_status])
    ) AS yesterday_count,
    COUNT(*) FILTER (
      WHERE data >= v_month_start AND status = 'completed'::appointment_status
    ) AS month_cuts,
    COUNT(*) FILTER (
      WHERE data >= v_last_month_start AND data <= v_last_month_end
        AND status = 'completed'::appointment_status
    ) AS last_month_cuts,
    COALESCE(SUM(preco) FILTER (
      WHERE data >= v_month_start AND status = 'completed'::appointment_status
    ), 0) AS apt_month_revenue,
    COALESCE(SUM(preco) FILTER (
      WHERE data >= v_last_month_start AND data <= v_last_month_end
        AND status = 'completed'::appointment_status
    ), 0) AS apt_last_month_revenue
  INTO v_agg
  FROM public.agendamentos
  WHERE barbeiro_id = p_barbeiro_id
    AND data >= v_last_month_start;

  SELECT COUNT(*) INTO v_pending_count
  FROM public.assinaturas
  WHERE barbeiro_id = p_barbeiro_id
    AND payment_method = 'cash'
    AND (
      status = ANY (ARRAY['suspended'::subscription_status, 'pending_cash'::subscription_status])
      OR (status = 'active'::subscription_status AND COALESCE(cash_payment_confirmed, false) = false)
    );

  SELECT
    COALESCE(SUM(valor) FILTER (WHERE created_at >= v_month_start::timestamptz), 0),
    COALESCE(SUM(valor) FILTER (
      WHERE created_at >= v_last_month_start::timestamptz
        AND created_at < v_month_start::timestamptz
    ), 0)
  INTO v_plan_cash_month, v_plan_cash_last_month
  FROM public.pagamentos_plano_barbearia
  WHERE barbeiro_id = p_barbeiro_id
    AND created_at >= v_last_month_start::timestamptz;

  SELECT
    COALESCE(SUM(p.valor) FILTER (WHERE p.created_at >= v_month_start::timestamptz), 0),
    COALESCE(SUM(p.valor) FILTER (
      WHERE p.created_at >= v_last_month_start::timestamptz
        AND p.created_at < v_month_start::timestamptz
    ), 0)
  INTO v_plan_pix_month, v_plan_pix_last_month
  FROM public.pagamentos p
  JOIN public.assinaturas a ON a.id = p.assinatura_id
  WHERE a.barbeiro_id = p_barbeiro_id
    AND p.status = 'paid'
    AND p.assinatura_id IS NOT NULL
    AND p.agendamento_id IS NULL
    AND p.created_at >= v_last_month_start::timestamptz;

  SELECT jsonb_build_object(
    'hora', x.hora,
    'clientName', COALESCE(pr.nome, 'Cliente'),
    'serviceName', COALESCE(s.nome, 'Serviço')
  ) INTO v_next
  FROM public.agendamentos x
  LEFT JOIN public.profiles pr ON pr.id = x.user_id
  LEFT JOIN public.servicos s ON s.id = x.servico_id
  WHERE x.barbeiro_id = p_barbeiro_id
    AND x.data = v_today
    AND x.status = ANY (ARRAY['pending'::appointment_status, 'confirmed'::appointment_status])
    AND x.hora >= v_now_time
  ORDER BY x.hora ASC
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'data', r.data,
    'hora', r.hora,
    'status', COALESCE(r.status::text, 'pending'),
    'clientName', COALESCE(pr.nome, 'Cliente'),
    'serviceName', COALESCE(s.nome, 'Serviço')
  ) ORDER BY r.data DESC, r.hora DESC), '[]'::jsonb)
  INTO v_recent
  FROM (
    SELECT id, data, hora, status, user_id, servico_id
    FROM public.agendamentos
    WHERE barbeiro_id = p_barbeiro_id
    ORDER BY data DESC, hora DESC
    LIMIT 5
  ) r
  LEFT JOIN public.profiles pr ON pr.id = r.user_id
  LEFT JOIN public.servicos s ON s.id = r.servico_id;

  RETURN jsonb_build_object(
    'todayCount', v_agg.today_count,
    'yesterdayCount', v_agg.yesterday_count,
    'pendingCount', v_pending_count,
    'nextAppointment', v_next,
    'monthRevenue', v_agg.apt_month_revenue + v_plan_cash_month + v_plan_pix_month,
    'lastMonthRevenue', v_agg.apt_last_month_revenue + v_plan_cash_last_month + v_plan_pix_last_month,
    'monthCuts', v_agg.month_cuts,
    'lastMonthCuts', v_agg.last_month_cuts,
    'recentAppointments', v_recent
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_barber_dashboard_fast(uuid) TO authenticated, service_role;

-- 3) Nova RPC unificada — devolve dashboard + perfil em UMA chamada
CREATE OR REPLACE FUNCTION public.get_barber_home_bundle(p_barbeiro_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_dashboard jsonb;
  v_profile jsonb;
  v_banner text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Reaproveita get_barber_dashboard_fast (já valida acesso)
  v_dashboard := public.get_barber_dashboard_fast(p_barbeiro_id);

  SELECT jsonb_build_object(
    'avatarUrl', COALESCE(pr.avatar_url, b.foto_url),
    'barbeiroFoto', b.foto_url,
    'profileAvatar', pr.avatar_url,
    'tenantId', b.tenant_id,
    'tenantSlug', t.slug,
    'tenantName', t.nome,
    'tenantLogo', t.logo_url
  )
  INTO v_profile
  FROM public.barbeiros b
  LEFT JOIN public.tenants t ON t.id = b.tenant_id
  LEFT JOIN public.profiles pr ON pr.id = v_user_id
  WHERE b.id = p_barbeiro_id;

  BEGIN
    v_banner := public.get_admin_banner_for_barber(p_barbeiro_id);
  EXCEPTION WHEN OTHERS THEN
    v_banner := NULL;
  END;

  RETURN jsonb_build_object(
    'dashboard', v_dashboard,
    'profile', COALESCE(v_profile, '{}'::jsonb) || jsonb_build_object('bannerUrl', v_banner)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_barber_home_bundle(uuid) TO authenticated, service_role;
