-- Corrige e fortalece a função que prepara o barbeiro/dono do tenant.
-- Motivo: alguns tenants estavam concluídos sem profile/user_role/barbeiro do owner,
-- o que prendia o app no loop /tenant/admin -> /onboarding.

CREATE OR REPLACE FUNCTION public.ensure_tenant_barber(p_user_id uuid, p_apelido text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_barber_id uuid;
  v_tenant_id uuid;
  v_tenant_name text;
  v_auth_uid uuid;
  v_owner_exists boolean;
  v_display_name text;
BEGIN
  v_auth_uid := auth.uid();

  -- Quando chamada pela aplicação, só o próprio usuário pode preparar o próprio perfil,
  -- exceto admin global. Chamadas internas/trigger sem auth.uid() continuam permitidas.
  IF v_auth_uid IS NOT NULL
     AND v_auth_uid <> p_user_id
     AND NOT public.has_role(v_auth_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not allowed to prepare barber for another user';
  END IF;

  -- Garante que o usuário realmente existe no Auth antes de criar dependências.
  SELECT EXISTS (
    SELECT 1 FROM auth.users au WHERE au.id = p_user_id
  ) INTO v_owner_exists;

  IF NOT v_owner_exists THEN
    RETURN NULL;
  END IF;

  -- Sempre usa o tenant mais antigo como fonte de verdade, igual ao frontend.
  SELECT id, nome
    INTO v_tenant_id, v_tenant_name
  FROM public.tenants
  WHERE owner_user_id = p_user_id
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_display_name := COALESCE(NULLIF(BTRIM(p_apelido), ''), NULLIF(BTRIM(v_tenant_name), ''), 'Proprietário');

  -- Garante profile, porque barbeiros.user_id também referencia public.profiles(id).
  INSERT INTO public.profiles (id, nome)
  VALUES (p_user_id, v_display_name)
  ON CONFLICT (id) DO UPDATE
    SET nome = COALESCE(NULLIF(BTRIM(public.profiles.nome), ''), EXCLUDED.nome),
        updated_at = now();

  -- Dono de tenant nunca deve ficar apenas como cliente.
  DELETE FROM public.user_roles
  WHERE user_id = p_user_id
    AND role = 'cliente'::public.app_role;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'tenant_admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Reativa barbeiro existente do owner no tenant histórico.
  SELECT id INTO v_barber_id
  FROM public.barbeiros
  WHERE user_id = p_user_id
    AND tenant_id = v_tenant_id
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_barber_id IS NOT NULL THEN
    UPDATE public.barbeiros
    SET ativo = true,
        deleted_at = NULL,
        setup_completed = true,
        apelido = COALESCE(NULLIF(BTRIM(apelido), ''), v_display_name),
        updated_at = now()
    WHERE id = v_barber_id;

    RETURN v_barber_id;
  END IF;

  -- Cria o barbeiro do dono.
  INSERT INTO public.barbeiros (user_id, apelido, ativo, setup_completed, tenant_id)
  VALUES (p_user_id, v_display_name, true, true, v_tenant_id)
  RETURNING id INTO v_barber_id;

  RETURN v_barber_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_tenant_barber(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_tenant_barber(uuid, text) TO service_role;

-- Repara barbearias existentes que ficaram com onboarding concluído mas sem dependências do dono.
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT t.owner_user_id, COALESCE(NULLIF(BTRIM(t.nome), ''), 'Proprietário') AS nome
    FROM public.tenants t
    WHERE t.owner_user_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM auth.users au WHERE au.id = t.owner_user_id)
      AND (
        NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = t.owner_user_id)
        OR NOT EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = t.owner_user_id
            AND ur.role = 'tenant_admin'::public.app_role
        )
        OR NOT EXISTS (
          SELECT 1 FROM public.barbeiros b
          WHERE b.user_id = t.owner_user_id
            AND b.tenant_id = t.id
            AND b.deleted_at IS NULL
        )
      )
    ORDER BY t.created_at ASC
  LOOP
    PERFORM public.ensure_tenant_barber(rec.owner_user_id, rec.nome);
  END LOOP;
END;
$$;