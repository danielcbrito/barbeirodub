-- Índices focados no caminho crítico de abertura do app do barbeiro
CREATE INDEX IF NOT EXISTS idx_barbeiros_user_active_boot
  ON public.barbeiros (user_id, ativo, deleted_at, created_at)
  INCLUDE (id, apelido, setup_completed, tenant_id, foto_url, woovi_pix_key, conta_configurada, conta_financeira_id);

CREATE INDEX IF NOT EXISTS idx_tenants_owner_created_boot
  ON public.tenants (owner_user_id, created_at)
  INCLUDE (id, nome, slug, logo_url);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_role_boot
  ON public.user_roles (user_id, role);

CREATE INDEX IF NOT EXISTS idx_webhook_config_latest_boot
  ON public.webhook_config (updated_at DESC, created_at DESC)
  INCLUDE (
    manutencao_ativa,
    manutencao_mensagem,
    manutencao_inicio_programada,
    manutencao_fim_programada,
    manutencao_aviso_ativo,
    manutencao_aviso_mensagem,
    manutencao_aviso_publico,
    refresh_barber_required_at
  );

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_barber_connected_boot
  ON public.whatsapp_instances (barbeiro_id, status, connected_at DESC, updated_at DESC)
  INCLUDE (instance_name)
  WHERE status = 'connected';

CREATE INDEX IF NOT EXISTS idx_config_horario_barbeiro_open_boot
  ON public.configuracoes_horario_barbeiro (barbeiro_id)
  WHERE aberto = true;

CREATE INDEX IF NOT EXISTS idx_barbeiros_tenant_active_boot
  ON public.barbeiros (tenant_id, ativo, deleted_at)
  INCLUDE (id)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_servicos_tenant_boot
  ON public.servicos (tenant_id)
  INCLUDE (id);

CREATE INDEX IF NOT EXISTS idx_info_empresa_tenant_localizacao_boot
  ON public.informacoes_empresa (tenant_id, categoria)
  INCLUDE (chave, valor)
  WHERE categoria = 'localizacao';

CREATE INDEX IF NOT EXISTS idx_chaves_pix_user_barber_boot
  ON public.chaves_pix (user_id, barbeiro_id)
  INCLUDE (id);

CREATE INDEX IF NOT EXISTS idx_contas_bancarias_user_barber_boot
  ON public.contas_bancarias (user_id, barbeiro_id)
  INCLUDE (id);

CREATE INDEX IF NOT EXISTS idx_depositos_user_barber_status_boot
  ON public.depositos (user_id, barbeiro_id, status)
  INCLUDE (id)
  WHERE status IN ('confirmado', 'paid', 'completed');

-- Função única para abertura do app: contexto + início + perfil + configuração em um round-trip
CREATE OR REPLACE FUNCTION public.get_barber_boot_bundle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_roles text[] := ARRAY[]::text[];
  v_owner_tenant record;
  v_barber record;
  v_resolved_tenant_id uuid;
  v_is_admin boolean := false;
  v_is_tenant_admin boolean := false;
  v_is_barber boolean := false;
  v_can_manage_tenant_block boolean := false;
  v_dashboard jsonb := '{}'::jsonb;
  v_profile jsonb := '{}'::jsonb;
  v_setup jsonb := '{}'::jsonb;
  v_wallet jsonb := '{}'::jsonb;
  v_whatsapp jsonb := '{}'::jsonb;
  v_maintenance jsonb := '{}'::jsonb;
  v_banner text := NULL;
  v_has_photo boolean := false;
  v_has_personal boolean := false;
  v_has_address boolean := false;
  v_has_services boolean := false;
  v_has_hours boolean := false;
  v_has_whatsapp boolean := false;
  v_has_wallet boolean := false;
  v_setup_visible_total integer := 3;
  v_setup_done_total integer := 0;
  v_private record;
  v_company_rows jsonb := '[]'::jsonb;
  v_company_global_rows jsonb := '[]'::jsonb;
  v_wallet_owner_shared boolean := false;
  v_pending_count integer := 0;
  v_app_context jsonb := '{}'::jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT COALESCE(array_agg(role::text), ARRAY[]::text[])
  INTO v_roles
  FROM public.user_roles
  WHERE user_id = v_user_id;

  v_is_admin := 'admin' = ANY(v_roles);
  v_is_tenant_admin := 'tenant_admin' = ANY(v_roles);
  v_is_barber := ('barber' = ANY(v_roles) OR 'barbeiro' = ANY(v_roles));

  SELECT t.id, COALESCE(t.nome, '') AS nome, t.slug, t.logo_url, t.owner_user_id
  INTO v_owner_tenant
  FROM public.tenants t
  WHERE t.owner_user_id = v_user_id
  ORDER BY t.created_at ASC
  LIMIT 1;

  SELECT
    b.id,
    b.apelido,
    b.user_id,
    b.deleted_at,
    b.setup_completed,
    b.tenant_id,
    b.created_at,
    b.foto_url,
    b.woovi_pix_key,
    b.asaas_account_id,
    b.conta_configurada,
    b.conta_financeira_id,
    t.nome AS tenant_nome,
    t.slug AS tenant_slug,
    t.logo_url AS tenant_logo,
    t.owner_user_id AS tenant_owner_user_id,
    pr.avatar_url AS profile_avatar
  INTO v_barber
  FROM public.barbeiros b
  LEFT JOIN public.tenants t ON t.id = b.tenant_id
  LEFT JOIN public.profiles pr ON pr.id = v_user_id
  WHERE b.user_id = v_user_id
    AND b.ativo = true
    AND b.deleted_at IS NULL
  ORDER BY (
    CASE
      WHEN v_owner_tenant.id IS NOT NULL AND b.tenant_id = v_owner_tenant.id THEN 0
      ELSE 1
    END
  ), b.created_at ASC
  LIMIT 1;

  IF v_barber.id IS NULL THEN
    v_app_context := jsonb_build_object(
      'barbeiro', NULL,
      'roles', COALESCE(to_jsonb(v_roles), '[]'::jsonb),
      'ownerTenantId', v_owner_tenant.id,
      'tenantNome', COALESCE(v_owner_tenant.nome, ''),
      'canManageTenantWideClientBlock', v_owner_tenant.id IS NOT NULL
    );

    RETURN jsonb_build_object(
      'appContext', v_app_context,
      'dashboard', NULL,
      'profile', NULL,
      'setup', NULL,
      'wallet', NULL,
      'whatsapp', NULL,
      'maintenance', NULL
    );
  END IF;

  v_resolved_tenant_id := COALESCE(v_barber.tenant_id, v_owner_tenant.id);
  v_can_manage_tenant_block := v_owner_tenant.id IS NOT NULL;

  v_app_context := jsonb_build_object(
    'barbeiro', jsonb_build_object(
      'id', v_barber.id,
      'apelido', v_barber.apelido,
      'user_id', v_barber.user_id,
      'deleted_at', v_barber.deleted_at,
      'setup_completed', v_barber.setup_completed,
      'tenant_id', v_resolved_tenant_id,
      'created_at', v_barber.created_at
    ),
    'roles', COALESCE(to_jsonb(v_roles), '[]'::jsonb),
    'ownerTenantId', v_owner_tenant.id,
    'tenantNome', COALESCE(v_barber.tenant_nome, v_owner_tenant.nome, ''),
    'canManageTenantWideClientBlock', v_can_manage_tenant_block
  );

  -- Dashboard já otimizado, reaproveitado no pacote de abertura.
  v_dashboard := public.get_barber_dashboard_fast(v_barber.id);

  BEGIN
    v_banner := public.get_admin_banner_for_barber(v_barber.id);
  EXCEPTION WHEN OTHERS THEN
    v_banner := NULL;
  END;

  v_profile := jsonb_build_object(
    'email', '',
    'avatarUrl', COALESCE(v_barber.profile_avatar, v_barber.foto_url),
    'bannerUrl', v_banner,
    'tenantLogo', COALESCE(v_barber.tenant_logo, v_owner_tenant.logo_url),
    'tenantName', COALESCE(v_barber.tenant_nome, v_owner_tenant.nome, ''),
    'tenantSlug', COALESCE(v_barber.tenant_slug, v_owner_tenant.slug)
  );

  SELECT * INTO v_private
  FROM public.barbeiros_private bp
  WHERE bp.barbeiro_id = v_barber.id
  LIMIT 1;

  v_has_photo := COALESCE(v_barber.foto_url, v_barber.profile_avatar) IS NOT NULL;
  v_has_personal := (
    v_private.nome_completo IS NOT NULL
    AND v_private.telefone IS NOT NULL
    AND v_private.email IS NOT NULL
  );

  v_has_address := (
    v_private.endereco_cep IS NOT NULL
    AND v_private.endereco_rua IS NOT NULL
    AND v_private.endereco_cidade IS NOT NULL
    AND v_private.endereco_estado IS NOT NULL
  );

  IF NOT v_has_address AND v_resolved_tenant_id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('chave', chave, 'valor', valor)), '[]'::jsonb)
    INTO v_company_rows
    FROM public.informacoes_empresa
    WHERE tenant_id = v_resolved_tenant_id
      AND categoria = 'localizacao';

    v_has_address := EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(v_company_rows) AS x(chave text, valor text)
      GROUP BY true
      HAVING
        (
          COALESCE(max(valor) FILTER (WHERE chave = 'rua'), '') <> ''
          AND COALESCE(max(valor) FILTER (WHERE chave = 'cidade'), '') <> ''
          AND COALESCE(max(valor) FILTER (WHERE chave = 'estado'), '') <> ''
        )
        OR (
          COALESCE(max(valor) FILTER (WHERE chave = 'endereco_completo'), '') <> ''
          AND COALESCE(max(valor) FILTER (WHERE chave = 'cidade'), '') <> ''
        )
    );
  END IF;

  IF NOT v_has_address THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('chave', chave, 'valor', valor)), '[]'::jsonb)
    INTO v_company_global_rows
    FROM public.informacoes_empresa
    WHERE tenant_id IS NULL
      AND categoria = 'localizacao';

    v_has_address := EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(v_company_global_rows) AS x(chave text, valor text)
      GROUP BY true
      HAVING
        (
          COALESCE(max(valor) FILTER (WHERE chave = 'rua'), '') <> ''
          AND COALESCE(max(valor) FILTER (WHERE chave = 'cidade'), '') <> ''
          AND COALESCE(max(valor) FILTER (WHERE chave = 'estado'), '') <> ''
        )
        OR (
          COALESCE(max(valor) FILTER (WHERE chave = 'endereco_completo'), '') <> ''
          AND COALESCE(max(valor) FILTER (WHERE chave = 'cidade'), '') <> ''
        )
    );
  END IF;

  IF v_resolved_tenant_id IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.servicos WHERE tenant_id = v_resolved_tenant_id LIMIT 1)
    INTO v_has_services;
  ELSE
    v_has_services := EXISTS (SELECT 1 FROM public.servicos LIMIT 1);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.configuracoes_horario_barbeiro
    WHERE barbeiro_id = v_barber.id
      AND aberto = true
    LIMIT 1
  ) INTO v_has_hours;

  SELECT jsonb_build_object(
    'isConnected', wi.id IS NOT NULL,
    'instanceName', wi.instance_name,
    'resolvedBarbeiroId', v_barber.id
  )
  INTO v_whatsapp
  FROM (
    SELECT w.id, w.instance_name, w.connected_at, w.updated_at
    FROM public.whatsapp_instances w
    WHERE w.barbeiro_id = v_barber.id
      AND w.status = 'connected'
    UNION ALL
    SELECT w2.id, w2.instance_name, w2.connected_at, w2.updated_at
    FROM public.whatsapp_instances w2
    JOIN public.barbeiros bx ON bx.id = w2.barbeiro_id
    WHERE v_resolved_tenant_id IS NOT NULL
      AND bx.tenant_id = v_resolved_tenant_id
      AND bx.ativo = true
      AND bx.deleted_at IS NULL
      AND w2.status = 'connected'
    ORDER BY connected_at DESC NULLS LAST, updated_at DESC NULLS LAST
    LIMIT 1
  ) wi;

  v_has_whatsapp := COALESCE((v_whatsapp->>'isConnected')::boolean, false);
  v_whatsapp := COALESCE(v_whatsapp, jsonb_build_object(
    'isConnected', false,
    'instanceName', NULL,
    'resolvedBarbeiroId', v_barber.id
  ));

  v_wallet_owner_shared := (
    v_barber.tenant_owner_user_id IS NOT NULL
    AND v_barber.tenant_owner_user_id <> v_barber.user_id
  );

  v_has_wallet :=
    v_wallet_owner_shared
    OR v_is_admin
    OR (v_is_barber AND NOT v_is_admin AND NOT v_is_tenant_admin)
    OR v_barber.woovi_pix_key IS NOT NULL
    OR v_barber.asaas_account_id IS NOT NULL
    OR (COALESCE(v_barber.conta_configurada, false) AND v_barber.conta_financeira_id IS NOT NULL)
    OR v_private.asaas_api_key IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.chaves_pix WHERE user_id = v_user_id OR barbeiro_id = v_barber.id LIMIT 1)
    OR EXISTS (SELECT 1 FROM public.contas_bancarias WHERE user_id = v_user_id OR barbeiro_id = v_barber.id LIMIT 1)
    OR EXISTS (
      SELECT 1
      FROM public.depositos
      WHERE (user_id = v_user_id OR barbeiro_id = v_barber.id)
        AND status IN ('confirmado', 'paid', 'completed')
      LIMIT 1
    );

  v_wallet := jsonb_build_object(
    'walletActive', v_has_wallet,
    'barberName', COALESCE(v_barber.apelido, 'Profissional'),
    'resolvedBarbeiroId', v_barber.id
  );

  v_setup_done_total :=
    (CASE WHEN (v_has_photo AND v_has_personal AND v_has_address) THEN 1 ELSE 0 END)
    + (CASE WHEN v_has_services THEN 1 ELSE 0 END)
    + (CASE WHEN v_has_hours THEN 1 ELSE 0 END);

  v_setup := jsonb_build_object(
    'percentage', CASE WHEN v_setup_visible_total = 0 THEN 100 ELSE round((v_setup_done_total::numeric / v_setup_visible_total::numeric) * 100)::int END,
    'steps', jsonb_build_array(
      jsonb_build_object('id', 'dados_gerais', 'label', 'Dados gerais', 'completed', (v_has_photo AND v_has_personal AND v_has_address), 'route', '/barbeiro/meus-dados'),
      jsonb_build_object('id', 'servicos', 'label', 'Serviços', 'completed', v_has_services, 'route', '/barbeiro/servicos'),
      jsonb_build_object('id', 'horarios', 'label', 'Horários', 'completed', v_has_hours, 'route', '/barbeiro/horarios')
    )
  );

  SELECT jsonb_build_object(
    'manutencao_ativa', COALESCE(wc.manutencao_ativa, false),
    'manutencao_mensagem', wc.manutencao_mensagem,
    'manutencao_inicio_programada', wc.manutencao_inicio_programada,
    'manutencao_fim_programada', wc.manutencao_fim_programada,
    'manutencao_aviso_ativo', COALESCE(wc.manutencao_aviso_ativo, false),
    'manutencao_aviso_mensagem', wc.manutencao_aviso_mensagem,
    'manutencao_aviso_publico', wc.manutencao_aviso_publico,
    'refresh_barber_required_at', wc.refresh_barber_required_at
  )
  INTO v_maintenance
  FROM public.webhook_config wc
  ORDER BY wc.updated_at DESC, wc.created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'appContext', v_app_context,
    'dashboard', v_dashboard,
    'profile', v_profile,
    'setup', v_setup,
    'wallet', v_wallet,
    'whatsapp', v_whatsapp,
    'maintenance', COALESCE(v_maintenance, jsonb_build_object(
      'manutencao_ativa', false,
      'manutencao_mensagem', NULL,
      'manutencao_inicio_programada', NULL,
      'manutencao_fim_programada', NULL,
      'manutencao_aviso_ativo', false,
      'manutencao_aviso_mensagem', NULL,
      'manutencao_aviso_publico', 'ambos',
      'refresh_barber_required_at', NULL
    ))
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_barber_boot_bundle() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_barber_boot_bundle() TO authenticated, service_role;