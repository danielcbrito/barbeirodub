
-- Fix: handle_new_user should NOT auto-match barbers when user is signing up as tenant
-- Also should not match barbers across different tenants blindly
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_barbeiro RECORD;
  v_has_role boolean;
  v_is_tenant_signup boolean;
BEGIN
  -- 1) Create/Upsert profile
  INSERT INTO public.profiles (id, nome, cpf, telefone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email),
    NEW.raw_user_meta_data->>'cpf',
    NEW.raw_user_meta_data->>'telefone'
  )
  ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    cpf = EXCLUDED.cpf,
    telefone = EXCLUDED.telefone,
    updated_at = NOW();

  -- 2) If role already exists, do not override
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = NEW.id
  ) INTO v_has_role;

  IF v_has_role THEN
    RETURN NEW;
  END IF;

  -- 3) Check if this is a tenant signup (new barbershop owner)
  v_is_tenant_signup := COALESCE((NEW.raw_user_meta_data->>'is_tenant_signup')::boolean, false);

  IF v_is_tenant_signup THEN
    -- Tenant signups should NEVER be auto-matched to existing barbers
    -- They will get tenant_admin role during onboarding
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'cliente')
    ON CONFLICT DO NOTHING;
    RETURN NEW;
  END IF;

  -- 4) For non-tenant signups: try to match barber by email (only for DUB global barbers, tenant_id IS NULL)
  SELECT b.* INTO v_barbeiro
  FROM public.barbeiros b
  JOIN public.barbeiros_private bp ON bp.barbeiro_id = b.id
  WHERE bp.email = NEW.email
    AND b.user_id IS NULL
    AND b.tenant_id IS NULL  -- CRITICAL: only match global (DUB) barbers, not tenant barbers
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.barbeiros
    SET user_id = NEW.id, updated_at = NOW()
    WHERE id = v_barbeiro.id;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'barber')
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'cliente')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
