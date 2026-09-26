CREATE OR REPLACE FUNCTION public.get_client_campaigns(p_tenant_id uuid DEFAULT NULL::uuid)
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
    WHERE user_id = v_uid ORDER BY created_at DESC NULLS LAST LIMIT 1;
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

  v_needed := GREATEST(COALESCE(v_convide.indicacoes_necessarias, 2), 1);

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
      'faltam', GREATEST(v_needed - (COALESCE(v_validados,0) % v_needed), 0),
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