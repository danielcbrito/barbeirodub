
-- 1) Ciclo de indicação por barbearia -------------------------------------
CREATE OR REPLACE FUNCTION public.criar_ciclo_indicacao(
  p_tipo text DEFAULT 'unico'::text,
  p_data_inicio date DEFAULT NULL::date,
  p_data_fim date DEFAULT NULL::date,
  p_dia_inicio_mes integer DEFAULT NULL::integer,
  p_dia_fim_mes integer DEFAULT NULL::integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_inicio date;
  v_fim date;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_ref_month date;
  v_last_day int;
  v_dia_i int;
  v_dia_f int;
  v_tenant uuid;
BEGIN
  IF NOT (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'tenant_admin'::app_role)
    OR public.has_role(auth.uid(),'ti'::app_role)
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501';
  END IF;

  v_tenant := public.get_user_tenant_id();

  IF p_tipo NOT IN ('unico','fixo') THEN
    RAISE EXCEPTION 'tipo inválido';
  END IF;

  IF p_tipo = 'unico' THEN
    IF p_data_inicio IS NULL OR p_data_fim IS NULL THEN
      RAISE EXCEPTION 'datas obrigatórias para ciclo único';
    END IF;
    IF p_data_fim <= p_data_inicio THEN
      RAISE EXCEPTION 'data_fim deve ser posterior a data_inicio';
    END IF;
    v_inicio := p_data_inicio;
    v_fim := p_data_fim;
  ELSE
    IF p_dia_inicio_mes IS NULL OR p_dia_fim_mes IS NULL THEN
      RAISE EXCEPTION 'dias do mês obrigatórios para ciclo fixo';
    END IF;
    IF p_dia_inicio_mes < 1 OR p_dia_inicio_mes > 31
       OR p_dia_fim_mes < 1 OR p_dia_fim_mes > 31 THEN
      RAISE EXCEPTION 'dias do mês devem estar entre 1 e 31';
    END IF;

    v_ref_month := date_trunc('month', v_hoje)::date;
    v_last_day := EXTRACT(day FROM (v_ref_month + INTERVAL '1 month - 1 day'))::int;
    v_dia_i := LEAST(p_dia_inicio_mes, v_last_day);
    v_dia_f := LEAST(p_dia_fim_mes, v_last_day);
    v_inicio := v_ref_month + (v_dia_i - 1);
    v_fim := v_ref_month + (v_dia_f - 1);

    IF v_fim < v_hoje THEN
      v_ref_month := (v_ref_month + INTERVAL '1 month')::date;
      v_last_day := EXTRACT(day FROM (v_ref_month + INTERVAL '1 month - 1 day'))::int;
      v_dia_i := LEAST(p_dia_inicio_mes, v_last_day);
      v_dia_f := LEAST(p_dia_fim_mes, v_last_day);
      v_inicio := v_ref_month + (v_dia_i - 1);
      v_fim := v_ref_month + (v_dia_f - 1);
    END IF;

    IF v_fim <= v_inicio THEN
      RAISE EXCEPTION 'dia_fim_mes deve ser posterior a dia_inicio_mes';
    END IF;
  END IF;

  SELECT id INTO v_id
  FROM public.ciclos_indicacao
  WHERE status = 'ativo'
    AND tenant_id IS NOT DISTINCT FROM v_tenant
    AND daterange(data_inicio, data_fim, '[]') && daterange(v_inicio, v_fim, '[]')
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.ciclos_indicacao (
    tenant_id, data_inicio, data_fim, status, criado_por,
    tipo, dia_inicio_mes, dia_fim_mes
  )
  VALUES (
    v_tenant, v_inicio, v_fim, 'ativo', auth.uid(),
    p_tipo,
    CASE WHEN p_tipo='fixo' THEN p_dia_inicio_mes END,
    CASE WHEN p_tipo='fixo' THEN p_dia_fim_mes END
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- 2) Apuração escopada por barbearia --------------------------------------
CREATE OR REPLACE FUNCTION public.apurar_ciclo_indicacao(p_ciclo_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ciclo record;
  v_max int;
  v_vencedor_id uuid;
  v_indicacao_vencedora uuid;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_ref date;
  v_last int;
  v_di int;
  v_df int;
  v_novo_inicio date;
  v_novo_fim date;
BEGIN
  SELECT * INTO v_ciclo FROM public.ciclos_indicacao WHERE id = p_ciclo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ciclo nao encontrado'; END IF;
  IF v_ciclo.status <> 'ativo' THEN RAISE EXCEPTION 'Ciclo nao esta ativo (status=%)', v_ciclo.status; END IF;

  CREATE TEMP TABLE IF NOT EXISTS _tmp_rank_ciclo (
    indicador_id uuid, indicacao_id uuid, liberado_em timestamptz, rn bigint, total bigint
  ) ON COMMIT DROP;
  DELETE FROM _tmp_rank_ciclo;

  INSERT INTO _tmp_rank_ciclo
  SELECT
    i.indicador_id,
    i.id,
    i.liberado_em,
    row_number() OVER (PARTITION BY i.indicador_id ORDER BY i.liberado_em ASC),
    count(*) OVER (PARTITION BY i.indicador_id)
  FROM public.indicacoes i
  LEFT JOIN public.agendamentos a ON a.id = i.agendamento_qualificador_id
  WHERE i.status = 'liberado'
    AND i.liberado_em IS NOT NULL
    AND i.liberado_em::date >= v_ciclo.data_inicio
    AND i.liberado_em::date <= v_ciclo.data_fim
    AND (v_ciclo.tenant_id IS NULL OR a.tenant_id = v_ciclo.tenant_id);

  SELECT max(total) INTO v_max FROM _tmp_rank_ciclo;

  IF v_max IS NULL OR v_max = 0 THEN
    UPDATE public.ciclos_indicacao
       SET status='apurado', vencedor_id=NULL, quantidade_indicacoes_vencedor=0, apurado_em=now()
     WHERE id = p_ciclo_id;
  ELSE
    SELECT indicador_id, indicacao_id
      INTO v_vencedor_id, v_indicacao_vencedora
      FROM _tmp_rank_ciclo
     WHERE total = v_max AND rn = v_max
     ORDER BY liberado_em ASC
     LIMIT 1;

    INSERT INTO public.creditos_indicacao (user_id, indicacao_id, status)
    VALUES (v_vencedor_id, v_indicacao_vencedora, 'disponivel');

    UPDATE public.ciclos_indicacao
       SET status='apurado',
           vencedor_id=v_vencedor_id,
           quantidade_indicacoes_vencedor=v_max,
           apurado_em=now()
     WHERE id = p_ciclo_id;
  END IF;

  IF v_ciclo.tipo = 'fixo' AND v_ciclo.dia_inicio_mes IS NOT NULL AND v_ciclo.dia_fim_mes IS NOT NULL THEN
    v_ref := date_trunc('month', v_hoje)::date;
    v_last := EXTRACT(day FROM (v_ref + INTERVAL '1 month - 1 day'))::int;
    v_di := LEAST(v_ciclo.dia_inicio_mes, v_last);
    v_df := LEAST(v_ciclo.dia_fim_mes, v_last);
    v_novo_inicio := v_ref + (v_di - 1);
    v_novo_fim := v_ref + (v_df - 1);

    IF v_novo_fim < v_hoje THEN
      v_ref := (v_ref + INTERVAL '1 month')::date;
      v_last := EXTRACT(day FROM (v_ref + INTERVAL '1 month - 1 day'))::int;
      v_di := LEAST(v_ciclo.dia_inicio_mes, v_last);
      v_df := LEAST(v_ciclo.dia_fim_mes, v_last);
      v_novo_inicio := v_ref + (v_di - 1);
      v_novo_fim := v_ref + (v_df - 1);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.ciclos_indicacao
      WHERE status='ativo'
        AND tenant_id IS NOT DISTINCT FROM v_ciclo.tenant_id
        AND daterange(data_inicio, data_fim, '[]') && daterange(v_novo_inicio, v_novo_fim, '[]')
    ) THEN
      INSERT INTO public.ciclos_indicacao (
        tenant_id, data_inicio, data_fim, status, criado_por,
        tipo, dia_inicio_mes, dia_fim_mes, ciclo_pai_id
      ) VALUES (
        v_ciclo.tenant_id, v_novo_inicio, v_novo_fim, 'ativo', v_ciclo.criado_por,
        'fixo', v_ciclo.dia_inicio_mes, v_ciclo.dia_fim_mes, v_ciclo.id
      );
    END IF;
  END IF;

  RETURN v_vencedor_id;
END;
$function$;

-- 3) Estado das campanhas para o app do cliente ---------------------------
CREATE OR REPLACE FUNCTION public.get_client_campaigns(p_tenant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_code text;
  v_slug text;
  v_convide record;
  v_mes record;
  v_ciclo record;
  v_validados int := 0;
  v_pendentes int := 0;
  v_creditos int := 0;
  v_needed int := 2;
  v_meu_total int := 0;
  v_ranking jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;

  v_tenant := p_tenant_id;
  IF v_tenant IS NULL THEN
    SELECT barbearia_preferida_id INTO v_tenant FROM public.profiles WHERE id = v_uid;
  END IF;
  IF v_tenant IS NULL THEN
    SELECT tenant_id INTO v_tenant FROM public.tenant_clientes
    WHERE user_id = v_uid ORDER BY criado_em NULLS LAST LIMIT 1;
  END IF;

  SELECT referral_code INTO v_code FROM public.profiles WHERE id = v_uid;
  IF v_code IS NULL OR length(v_code) = 0 THEN
    v_code := public.gerar_referral_code();
    UPDATE public.profiles SET referral_code = v_code WHERE id = v_uid;
  END IF;

  SELECT slug INTO v_slug FROM public.tenants WHERE id = v_tenant;

  SELECT * INTO v_convide FROM public.campanhas_config
   WHERE tenant_id = v_tenant AND tipo = 'convide_ganhe';
  SELECT * INTO v_mes FROM public.campanhas_config
   WHERE tenant_id = v_tenant AND tipo = 'cliente_do_mes';

  v_needed := COALESCE(v_convide.indicacoes_necessarias, 2);

  SELECT
    count(*) FILTER (WHERE status = 'liberado'),
    count(*) FILTER (WHERE status <> 'liberado' AND indicado_id IS NOT NULL)
  INTO v_validados, v_pendentes
  FROM public.indicacoes WHERE indicador_id = v_uid;

  SELECT count(*) INTO v_creditos
  FROM public.creditos_indicacao WHERE user_id = v_uid AND status = 'disponivel';

  SELECT * INTO v_ciclo FROM public.ciclos_indicacao
   WHERE status = 'ativo' AND tenant_id IS NOT DISTINCT FROM v_tenant
   ORDER BY criado_em DESC LIMIT 1;

  IF v_ciclo.id IS NOT NULL THEN
    WITH base AS (
      SELECT i.indicador_id, count(*)::int AS total
      FROM public.indicacoes i
      LEFT JOIN public.agendamentos a ON a.id = i.agendamento_qualificador_id
      WHERE i.status = 'liberado'
        AND i.liberado_em::date BETWEEN v_ciclo.data_inicio AND v_ciclo.data_fim
        AND (v_tenant IS NULL OR a.tenant_id = v_tenant)
      GROUP BY i.indicador_id
    )
    SELECT
      COALESCE(jsonb_agg(jsonb_build_object(
        'nome', COALESCE(p.nome, 'Cliente'),
        'total', b.total,
        'eu', b.indicador_id = v_uid
      ) ORDER BY b.total DESC), '[]'::jsonb),
      COALESCE(max(b.total) FILTER (WHERE b.indicador_id = v_uid), 0)
    INTO v_ranking, v_meu_total
    FROM base b LEFT JOIN public.profiles p ON p.id = b.indicador_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'tenantId', v_tenant,
    'tenantSlug', v_slug,
    'referralCode', v_code,
    'creditosDisponiveis', v_creditos,
    'convide', jsonb_build_object(
      'ativo', COALESCE(v_convide.ativo, false),
      'necessarias', v_needed,
      'validados', COALESCE(v_validados, 0),
      'pendentes', COALESCE(v_pendentes, 0),
      'faltam', GREATEST(v_needed - (COALESCE(v_validados,0) % NULLIF(v_needed,0)), 0),
      'premio', v_convide.premio_descricao
    ),
    'clienteMes', jsonb_build_object(
      'ativo', COALESCE(v_mes.ativo, false),
      'cicloInicio', v_ciclo.data_inicio,
      'cicloFim', v_ciclo.data_fim,
      'meuTotal', COALESCE(v_meu_total, 0),
      'ranking', COALESCE(v_ranking, '[]'::jsonb),
      'premio', v_mes.premio_descricao
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_client_campaigns(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.criar_ciclo_indicacao(text, date, date, integer, integer) TO authenticated, service_role;
