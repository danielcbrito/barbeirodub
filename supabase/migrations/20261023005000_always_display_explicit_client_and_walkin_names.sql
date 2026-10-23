-- Migration: Always display explicit client_nome and walk-in names
-- Problem: Earlier attempts to prevent the logged-in barber's profile name from appearing as client
-- accidentally blacklisted the barber's nickname (e.g. 'Tulio') even when it was stored directly in
-- agendamentos.cliente_nome or in observacoes ('Cliente walk-in: ...').
-- This caused encaixes on certain days to display 'Cliente (Não veio)' instead of the stored name.
-- Solution:
-- 1. Always prioritize and display agendamentos.cliente_nome and walk-in notes as entered.
-- 2. Only suppress the barber's name when reading from profiles.nome (when user_id = barber.user_id).

CREATE OR REPLACE FUNCTION public.get_barber_agenda_bundle(
  p_barbeiro_id uuid,
  p_data date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_allowed boolean := false;
  v_appointments jsonb := '[]'::jsonb;
  v_upcoming jsonb := '{}'::jsonb;
  v_horario jsonb := NULL;
  v_excepcionais jsonb := '[]'::jsonb;
  v_barber_apelido text := '';
  v_barber_user_id uuid := NULL;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='28000'; END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.barbeiros b
    LEFT JOIN public.tenants t ON t.id = b.tenant_id
    WHERE b.id = p_barbeiro_id
      AND (b.user_id = v_uid OR t.owner_user_id = v_uid OR public.has_role(v_uid,'admin'))
  ) INTO v_allowed;
  IF NOT v_allowed THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501'; END IF;

  SELECT COALESCE(b.apelido, ''), b.user_id INTO v_barber_apelido, v_barber_user_id
  FROM public.barbeiros b WHERE b.id = p_barbeiro_id;

  SELECT COALESCE(jsonb_agg(row_json ORDER BY hora), '[]'::jsonb) INTO v_appointments
  FROM (
    SELECT jsonb_build_object(
      'id', a.id, 'data', a.data, 'hora', to_char(a.hora,'HH24:MI'),
      'duracao', a.duracao, 'status', a.status::text, 'preco', a.preco,
      'observacoes', a.observacoes, 'barbeiro_confirmou', a.barbeiro_confirmou,
      'cliente_confirmou', a.cliente_confirmou, 'ponto_liberado', a.ponto_liberado,
      'user_id', a.user_id, 'servico_id', a.servico_id, 'barbeiro_id', a.barbeiro_id,
      'barbeiro_apelido', v_barber_apelido,
      'is_free', a.is_free, 'payment_method', a.payment_method,
      'tipo_agendamento', a.tipo_agendamento,
      'remarcacao_solicitada', a.remarcacao_solicitada, 'motivo_remarcacao', a.motivo_remarcacao,
      'cliente_nome', a.cliente_nome,
      'profile', CASE 
        -- 1. Nome direto salvo na coluna cliente_nome (sempre respeitado!)
        WHEN a.cliente_nome IS NOT NULL AND TRIM(a.cliente_nome) <> '' AND LOWER(TRIM(a.cliente_nome)) NOT IN ('barbearia dub', 'barbearia')
        THEN jsonb_build_object(
          'nome', TRIM(a.cliente_nome),
          'cpf', pr.cpf
        )
        -- 2. Nome extraído do WhatsApp
        WHEN a.observacoes ILIKE '%WhatsApp | Cliente:%'
        THEN jsonb_build_object(
          'nome', TRIM(SUBSTRING(a.observacoes FROM 'WhatsApp[[:space:]]*\|[[:space:]]*Cliente:[[:space:]]*([^\n\r]+)')),
          'cpf', pr.cpf
        )
        -- 3. Nome extraído de walk-in
        WHEN a.observacoes ILIKE '%Cliente walk-in:%'
        THEN jsonb_build_object(
          'nome', TRIM(SUBSTRING(a.observacoes FROM '🚶[[:space:]]*Cliente walk-in:[[:space:]]*([^\n\r]+)')),
          'cpf', pr.cpf
        )
        -- 4. Perfil cadastrado de cliente (apenas quando o user_id NÃO é a conta do próprio barbeiro)
        WHEN pr.id IS NOT NULL 
          AND pr.id <> COALESCE(v_barber_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
          AND LOWER(TRIM(pr.nome)) NOT IN ('barbearia dub', 'barbearia', LOWER(TRIM(v_barber_apelido)))
        THEN jsonb_build_object('nome', pr.nome, 'cpf', pr.cpf) 
        
        -- 5. Fallback padrão
        ELSE jsonb_build_object('nome', 'Cliente', 'cpf', pr.cpf)
      END,
      'servico', CASE WHEN s.id IS NOT NULL
        THEN jsonb_build_object('nome', s.nome, 'duracao_minutos', s.duracao_minutos) ELSE NULL END,
      'pagamentos', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('metodo', pg.metodo, 'status', pg.status, 'valor', pg.valor))
        FROM public.pagamentos pg WHERE pg.agendamento_id = a.id
      ), '[]'::jsonb)
    ) AS row_json, a.hora
    FROM public.agendamentos a
    LEFT JOIN public.profiles pr ON pr.id = a.user_id
    LEFT JOIN public.servicos s ON s.id = a.servico_id
    WHERE a.barbeiro_id = p_barbeiro_id AND a.data = p_data
      AND a.status::text <> 'excluido'
  ) x;

  SELECT COALESCE(jsonb_object_agg(dia, cnt), '{}'::jsonb) INTO v_upcoming
  FROM (
    SELECT data::text AS dia, COUNT(*) AS cnt
    FROM public.agendamentos
    WHERE barbeiro_id = p_barbeiro_id
      AND data BETWEEN p_data AND p_data + 7
      AND status IN ('pending','confirmed','completed')
    GROUP BY data
  ) y;

  SELECT to_jsonb(ch) INTO v_horario
  FROM public.configuracoes_horario_barbeiro ch
  WHERE ch.barbeiro_id = p_barbeiro_id LIMIT 1;

  SELECT COALESCE(jsonb_agg(to_jsonb(he)), '[]'::jsonb) INTO v_excepcionais
  FROM public.horarios_excepcionais_barbeiro he
  WHERE he.barbeiro_id = p_barbeiro_id
    AND he.data BETWEEN p_data - 1 AND p_data + 30;

  RETURN jsonb_build_object(
    'appointments', v_appointments,
    'upcomingCounts', v_upcoming,
    'horario', v_horario,
    'excepcionais', v_excepcionais,
    'fetchedAt', extract(epoch from now())
  );
END;
$$;

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
  v_barber_apelido text := '';
  v_barber_user_id uuid := NULL;
BEGIN
  IF p_barbeiro_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(b.apelido, ''), b.user_id INTO v_barber_apelido, v_barber_user_id
  FROM public.barbeiros b WHERE b.id = p_barbeiro_id;

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
    COALESCE(SUM(pg.valor) FILTER (WHERE pg.created_at >= v_month_start::timestamptz), 0),
    COALESCE(SUM(pg.valor) FILTER (WHERE pg.created_at >= v_last_month_start::timestamptz AND pg.created_at < v_month_start::timestamptz), 0)
  INTO v_ppm, v_pplm
  FROM public.pagamentos pg
  JOIN public.assinaturas s2 ON s2.id = pg.assinatura_id
  WHERE s2.barbeiro_id = p_barbeiro_id
    AND pg.assinatura_id IS NOT NULL
    AND pg.agendamento_id IS NULL
    AND pg.status = 'paid'
    AND pg.created_at >= v_last_month_start::timestamptz;

  SELECT jsonb_build_object(
    'hora', to_char(a.hora, 'HH24:MI'),
    'clientName', CASE
      WHEN a.cliente_nome IS NOT NULL AND TRIM(a.cliente_nome) <> '' AND LOWER(TRIM(a.cliente_nome)) NOT IN ('barbearia dub', 'barbearia')
        THEN TRIM(a.cliente_nome)
      WHEN a.observacoes ILIKE '%WhatsApp | Cliente:%'
        THEN TRIM(SUBSTRING(a.observacoes FROM 'WhatsApp[[:space:]]*\|[[:space:]]*Cliente:[[:space:]]*([^\n\r]+)'))
      WHEN a.observacoes ILIKE '%Cliente walk-in:%'
        THEN TRIM(SUBSTRING(a.observacoes FROM '🚶[[:space:]]*Cliente walk-in:[[:space:]]*([^\n\r]+)'))
      WHEN pr.id IS NOT NULL 
        AND pr.id <> COALESCE(v_barber_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND LOWER(TRIM(pr.nome)) NOT IN ('barbearia dub', 'barbearia', LOWER(TRIM(v_barber_apelido)))
        THEN TRIM(pr.nome)
      ELSE 'Cliente'
    END,
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
      SELECT ag.id, ag.data, ag.hora, ag.status, 
        CASE
          WHEN ag.cliente_nome IS NOT NULL AND TRIM(ag.cliente_nome) <> '' AND LOWER(TRIM(ag.cliente_nome)) NOT IN ('barbearia dub', 'barbearia')
            THEN TRIM(ag.cliente_nome)
          WHEN ag.observacoes ILIKE '%WhatsApp | Cliente:%'
            THEN TRIM(SUBSTRING(ag.observacoes FROM 'WhatsApp[[:space:]]*\|[[:space:]]*Cliente:[[:space:]]*([^\n\r]+)'))
          WHEN ag.observacoes ILIKE '%Cliente walk-in:%'
            THEN TRIM(SUBSTRING(ag.observacoes FROM '🚶[[:space:]]*Cliente walk-in:[[:space:]]*([^\n\r]+)'))
          WHEN pr.id IS NOT NULL 
            AND pr.id <> COALESCE(v_barber_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
            AND LOWER(TRIM(pr.nome)) NOT IN ('barbearia dub', 'barbearia', LOWER(TRIM(v_barber_apelido)))
            THEN TRIM(pr.nome)
          ELSE 'Cliente'
        END AS nome_cliente, 
        s.nome AS nome_servico
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
$$;
