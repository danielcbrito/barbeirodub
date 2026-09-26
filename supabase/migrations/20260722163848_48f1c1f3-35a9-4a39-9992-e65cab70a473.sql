CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_tenant_signup boolean;
BEGIN
  v_is_tenant_signup := lower(COALESCE(NEW.raw_user_meta_data->>'is_tenant_signup', 'false')) = 'true';

  INSERT INTO public.profiles (id, nome, cpf, telefone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email),
    NEW.raw_user_meta_data->>'cpf',
    NEW.raw_user_meta_data->>'telefone'
  )
  ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    cpf = COALESCE(EXCLUDED.cpf, public.profiles.cpf),
    telefone = COALESCE(EXCLUDED.telefone, public.profiles.telefone),
    updated_at = now();

  IF v_is_tenant_signup THEN
    DELETE FROM public.user_roles
    WHERE user_id = NEW.id
      AND role = 'cliente'::public.app_role;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'tenant_admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'cliente'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DELETE FROM public.user_roles ur
USING auth.users au
WHERE ur.user_id = au.id
  AND ur.role = 'cliente'::public.app_role
  AND lower(COALESCE(au.raw_user_meta_data->>'is_tenant_signup', 'false')) = 'true';

INSERT INTO public.user_roles (user_id, role)
SELECT au.id, 'tenant_admin'::public.app_role
FROM auth.users au
WHERE lower(COALESCE(au.raw_user_meta_data->>'is_tenant_signup', 'false')) = 'true'
ON CONFLICT (user_id, role) DO NOTHING;