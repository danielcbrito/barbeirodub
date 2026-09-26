CREATE OR REPLACE FUNCTION public.refresh_client_home_snapshot(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
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

  IF v_caller IS NOT NULL
     AND v_caller <> p_user_id
     AND NOT public.has_role(v_caller, 'admin')
     AND NOT public.has_role(v_caller, 'tenant_admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
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