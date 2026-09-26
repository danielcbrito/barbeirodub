
CREATE INDEX IF NOT EXISTS idx_agendamentos_barb_data_hora ON public.agendamentos(barbeiro_id, data, hora) WHERE status IN ('pending','confirmed','completed');
CREATE INDEX IF NOT EXISTS idx_agendamentos_barb_userid ON public.agendamentos(barbeiro_id, user_id) WHERE status <> 'excluido';
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_barb ON public.whatsapp_instances(barbeiro_id);

CREATE OR REPLACE FUNCTION public.get_barber_agenda_bundle(p_barbeiro_id uuid, p_data date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_allowed boolean := false;
  v_appointments jsonb := '[]'::jsonb;
  v_upcoming jsonb := '{}'::jsonb;
  v_horario jsonb := NULL;
  v_excepcionais jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='28000'; END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.barbeiros b
    LEFT JOIN public.tenants t ON t.id = b.tenant_id
    WHERE b.id = p_barbeiro_id
      AND (b.user_id = v_uid OR t.owner_user_id = v_uid OR public.has_role(v_uid,'admin'))
  ) INTO v_allowed;
  IF NOT v_allowed THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501'; END IF;

  SELECT COALESCE(jsonb_agg(row_json ORDER BY hora), '[]'::jsonb) INTO v_appointments
  FROM (
    SELECT jsonb_build_object(
      'id', a.id, 'data', a.data, 'hora', to_char(a.hora,'HH24:MI'),
      'duracao', a.duracao, 'status', a.status::text, 'preco', a.preco,
      'observacoes', a.observacoes, 'barbeiro_confirmou', a.barbeiro_confirmou,
      'cliente_confirmou', a.cliente_confirmou, 'ponto_liberado', a.ponto_liberado,
      'user_id', a.user_id, 'servico_id', a.servico_id, 'barbeiro_id', a.barbeiro_id,
      'is_free', a.is_free, 'payment_method', a.payment_method,
      'tipo_agendamento', a.tipo_agendamento,
      'remarcacao_solicitada', a.remarcacao_solicitada, 'motivo_remarcacao', a.motivo_remarcacao,
      'profile', CASE WHEN pr.id IS NOT NULL
        THEN jsonb_build_object('nome', pr.nome, 'cpf', pr.cpf) ELSE NULL END,
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

GRANT EXECUTE ON FUNCTION public.get_barber_agenda_bundle(uuid, date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_barber_agenda_bundle(uuid, date) FROM anon, public;


CREATE OR REPLACE FUNCTION public.get_barber_disparo_bundle(p_barbeiro_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_allowed boolean := false;
  v_clientes jsonb := '[]'::jsonb;
  v_templates jsonb := '[]'::jsonb;
  v_whatsapp jsonb := NULL;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='28000'; END IF;

  SELECT (b.user_id = v_uid OR t.owner_user_id = v_uid OR public.has_role(v_uid,'admin'))
  INTO v_allowed
  FROM public.barbeiros b
  LEFT JOIN public.tenants t ON t.id = b.tenant_id
  WHERE b.id = p_barbeiro_id;
  IF NOT v_allowed THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id', pr.id, 'nome', pr.nome, 'telefone', pr.telefone,
    'ultimo_agendamento', pr.ultimo,
    'total_agendamentos', pr.total
  )), '[]'::jsonb) INTO v_clientes
  FROM (
    SELECT p.id, p.nome, p.telefone,
      MAX(a.data) AS ultimo, COUNT(a.id) AS total
    FROM public.agendamentos a
    JOIN public.profiles p ON p.id = a.user_id
    WHERE a.barbeiro_id = p_barbeiro_id AND a.status::text <> 'excluido'
      AND p.telefone IS NOT NULL
    GROUP BY p.id, p.nome, p.telefone
    ORDER BY MAX(a.data) DESC
    LIMIT 500
  ) pr;

  SELECT COALESCE(jsonb_agg(to_jsonb(mt) ORDER BY mt.created_at DESC), '[]'::jsonb) INTO v_templates
  FROM public.mensagem_templates mt
  WHERE mt.ativo = true;

  SELECT to_jsonb(w) INTO v_whatsapp
  FROM public.whatsapp_instances w
  WHERE w.barbeiro_id = p_barbeiro_id
  ORDER BY w.created_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'clientes', v_clientes,
    'templates', v_templates,
    'whatsapp', v_whatsapp,
    'fetchedAt', extract(epoch from now())
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_barber_disparo_bundle(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_barber_disparo_bundle(uuid) FROM anon, public;
