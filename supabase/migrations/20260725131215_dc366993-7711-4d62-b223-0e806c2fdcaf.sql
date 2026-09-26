-- Performance indexes for high-frequency app reads
CREATE INDEX IF NOT EXISTS idx_webhook_config_latest_fast
ON public.webhook_config (updated_at DESC NULLS LAST, created_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_agendamentos_barbeiro_data_status_hora_fast
ON public.agendamentos (barbeiro_id, data, status, hora)
INCLUDE (user_id, servico_id, preco, duracao, observacoes, barbeiro_confirmou, cliente_confirmou, ponto_liberado, is_free, payment_method, tipo_agendamento, remarcacao_solicitada, motivo_remarcacao, created_at);

CREATE INDEX IF NOT EXISTS idx_agendamentos_user_status_data_fast
ON public.agendamentos (user_id, status, data DESC)
INCLUDE (id, hora, preco, servico_id, barbeiro_id, visivel_para_usuario, payment_method, cancelado_em);

CREATE INDEX IF NOT EXISTS idx_agendamentos_barbeiro_completed_data_fast
ON public.agendamentos (barbeiro_id, data)
INCLUDE (preco)
WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS idx_pagamentos_user_created_fast
ON public.pagamentos (user_id, created_at DESC)
INCLUDE (id, metodo, status, agendamento_id);

CREATE INDEX IF NOT EXISTS idx_pagamentos_assinatura_paid_created_fast
ON public.pagamentos (created_at DESC, assinatura_id)
INCLUDE (valor)
WHERE status = 'paid' AND assinatura_id IS NOT NULL AND agendamento_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_assinaturas_user_status_created_fast
ON public.assinaturas (user_id, status, created_at DESC)
INCLUDE (id, plano_id, barbeiro_id, payment_method, cash_payment_confirmed, ciclo_inicio, ciclo_fim, usos_ciclo_atual, next_billing_date);

CREATE INDEX IF NOT EXISTS idx_assinaturas_barbeiro_cash_pending_fast
ON public.assinaturas (barbeiro_id, payment_method, status)
INCLUDE (cash_payment_confirmed)
WHERE payment_method = 'cash';

CREATE INDEX IF NOT EXISTS idx_system_logs_level_created_fast
ON public.system_logs (level, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_resgates_created_fast
ON public.resgates (created_at DESC)
INCLUDE (id, user_id, status, appointment_id);

CREATE INDEX IF NOT EXISTS idx_pontos_user_fast
ON public.pontos (user_id)
INCLUDE (pontos);

CREATE INDEX IF NOT EXISTS idx_plano_usos_assinatura_active_fast
ON public.plano_agendamentos_usos (assinatura_id)
WHERE released_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pagamentos_plano_barbearia_barbeiro_created_fast
ON public.pagamentos_plano_barbearia (barbeiro_id, created_at DESC)
INCLUDE (valor);

-- Single-call dashboard loader for the barber home screen
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
  v_today date := CURRENT_DATE;
  v_yesterday date := CURRENT_DATE - 1;
  v_month_start date := date_trunc('month', CURRENT_DATE)::date;
  v_last_month_start date := (date_trunc('month', CURRENT_DATE) - interval '1 month')::date;
  v_last_month_end date := (date_trunc('month', CURRENT_DATE) - interval '1 day')::date;
  v_now_time time := LOCALTIME;
  v_today_count integer := 0;
  v_yesterday_count integer := 0;
  v_pending_count integer := 0;
  v_month_cuts integer := 0;
  v_last_month_cuts integer := 0;
  v_apt_month_revenue numeric := 0;
  v_apt_last_month_revenue numeric := 0;
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
      AND (
        b.user_id = v_user_id
        OR t.owner_user_id = v_user_id
        OR v_is_admin
      )
  ) INTO v_can_access;

  IF NOT v_can_access THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) INTO v_today_count
  FROM public.agendamentos
  WHERE barbeiro_id = p_barbeiro_id
    AND data = v_today
    AND status = ANY (ARRAY['pending'::appointment_status, 'confirmed'::appointment_status, 'completed'::appointment_status]);

  SELECT COUNT(*) INTO v_yesterday_count
  FROM public.agendamentos
  WHERE barbeiro_id = p_barbeiro_id
    AND data = v_yesterday
    AND status = ANY (ARRAY['pending'::appointment_status, 'confirmed'::appointment_status, 'completed'::appointment_status]);

  SELECT COUNT(*) INTO v_pending_count
  FROM public.assinaturas
  WHERE barbeiro_id = p_barbeiro_id
    AND payment_method = 'cash'
    AND (
      status = ANY (ARRAY['suspended'::subscription_status, 'pending_cash'::subscription_status])
      OR (status = 'active'::subscription_status AND COALESCE(cash_payment_confirmed, false) = false)
    );

  SELECT COUNT(*), COALESCE(SUM(preco), 0) INTO v_month_cuts, v_apt_month_revenue
  FROM public.agendamentos
  WHERE barbeiro_id = p_barbeiro_id
    AND data >= v_month_start
    AND status = 'completed'::appointment_status;

  SELECT COUNT(*), COALESCE(SUM(preco), 0) INTO v_last_month_cuts, v_apt_last_month_revenue
  FROM public.agendamentos
  WHERE barbeiro_id = p_barbeiro_id
    AND data >= v_last_month_start
    AND data <= v_last_month_end
    AND status = 'completed'::appointment_status;

  SELECT COALESCE(SUM(valor), 0) INTO v_plan_cash_month
  FROM public.pagamentos_plano_barbearia
  WHERE barbeiro_id = p_barbeiro_id
    AND created_at >= v_month_start::timestamptz;

  SELECT COALESCE(SUM(valor), 0) INTO v_plan_cash_last_month
  FROM public.pagamentos_plano_barbearia
  WHERE barbeiro_id = p_barbeiro_id
    AND created_at >= v_last_month_start::timestamptz
    AND created_at < (v_month_start::timestamptz);

  SELECT COALESCE(SUM(p.valor), 0) INTO v_plan_pix_month
  FROM public.pagamentos p
  JOIN public.assinaturas a ON a.id = p.assinatura_id
  WHERE a.barbeiro_id = p_barbeiro_id
    AND p.status = 'paid'
    AND p.assinatura_id IS NOT NULL
    AND p.agendamento_id IS NULL
    AND p.created_at >= v_month_start::timestamptz;

  SELECT COALESCE(SUM(p.valor), 0) INTO v_plan_pix_last_month
  FROM public.pagamentos p
  JOIN public.assinaturas a ON a.id = p.assinatura_id
  WHERE a.barbeiro_id = p_barbeiro_id
    AND p.status = 'paid'
    AND p.assinatura_id IS NOT NULL
    AND p.agendamento_id IS NULL
    AND p.created_at >= v_last_month_start::timestamptz
    AND p.created_at < (v_month_start::timestamptz);

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
    'todayCount', v_today_count,
    'yesterdayCount', v_yesterday_count,
    'pendingCount', v_pending_count,
    'nextAppointment', v_next,
    'monthRevenue', v_apt_month_revenue + v_plan_cash_month + v_plan_pix_month,
    'lastMonthRevenue', v_apt_last_month_revenue + v_plan_cash_last_month + v_plan_pix_last_month,
    'monthCuts', v_month_cuts,
    'lastMonthCuts', v_last_month_cuts,
    'recentAppointments', v_recent
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_barber_dashboard_fast(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_barber_dashboard_fast(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_barber_dashboard_fast(uuid) TO service_role;

-- Single-call initial context resolver for the barber app shell
CREATE OR REPLACE FUNCTION public.get_barber_app_context_fast()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_roles text[] := ARRAY[]::text[];
  v_owner_tenant_id uuid := NULL;
  v_tenant_name text := '';
  v_barber record;
  v_can_manage_tenant_block boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT COALESCE(array_agg(role::text), ARRAY[]::text[])
  INTO v_roles
  FROM public.user_roles
  WHERE user_id = v_user_id;

  SELECT t.id, COALESCE(t.nome, '')
  INTO v_owner_tenant_id, v_tenant_name
  FROM public.tenants t
  WHERE t.owner_user_id = v_user_id
  ORDER BY t.created_at ASC
  LIMIT 1;

  SELECT b.id, b.apelido, b.user_id, b.deleted_at, b.setup_completed, b.tenant_id, b.created_at
  INTO v_barber
  FROM public.barbeiros b
  WHERE b.user_id = v_user_id
    AND b.ativo = true
    AND b.deleted_at IS NULL
  ORDER BY (CASE WHEN v_owner_tenant_id IS NOT NULL AND b.tenant_id = v_owner_tenant_id THEN 0 ELSE 1 END), b.created_at ASC
  LIMIT 1;

  IF v_barber.id IS NULL THEN
    RETURN jsonb_build_object(
      'barbeiro', NULL,
      'roles', COALESCE(to_jsonb(v_roles), '[]'::jsonb),
      'ownerTenantId', v_owner_tenant_id,
      'tenantNome', v_tenant_name
    );
  END IF;

  v_can_manage_tenant_block := v_owner_tenant_id IS NOT NULL;

  IF COALESCE(v_barber.tenant_id, v_owner_tenant_id) IS NOT NULL AND v_tenant_name = '' THEN
    SELECT COALESCE(nome, '') INTO v_tenant_name
    FROM public.tenants
    WHERE id = COALESCE(v_barber.tenant_id, v_owner_tenant_id)
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'barbeiro', jsonb_build_object(
      'id', v_barber.id,
      'apelido', v_barber.apelido,
      'user_id', v_barber.user_id,
      'deleted_at', v_barber.deleted_at,
      'setup_completed', v_barber.setup_completed,
      'tenant_id', COALESCE(v_barber.tenant_id, v_owner_tenant_id),
      'created_at', v_barber.created_at
    ),
    'roles', COALESCE(to_jsonb(v_roles), '[]'::jsonb),
    'ownerTenantId', v_owner_tenant_id,
    'tenantNome', v_tenant_name,
    'canManageTenantWideClientBlock', v_can_manage_tenant_block
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_barber_app_context_fast() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_barber_app_context_fast() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_barber_app_context_fast() TO service_role;

ANALYZE public.webhook_config;
ANALYZE public.agendamentos;
ANALYZE public.pagamentos;
ANALYZE public.assinaturas;
ANALYZE public.profiles;
ANALYZE public.system_logs;
ANALYZE public.resgates;
ANALYZE public.pontos;
ANALYZE public.plano_agendamentos_usos;