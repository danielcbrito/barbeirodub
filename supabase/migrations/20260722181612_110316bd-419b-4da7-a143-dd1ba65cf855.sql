
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_tenant_signup boolean;
  v_cpf text;
  v_cpf_taken boolean;
BEGIN
  v_is_tenant_signup := lower(COALESCE(NEW.raw_user_meta_data->>'is_tenant_signup', 'false')) = 'true';
  v_cpf := NULLIF(NEW.raw_user_meta_data->>'cpf', '');

  IF v_cpf IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE cpf = v_cpf AND id <> NEW.id) INTO v_cpf_taken;
    IF v_cpf_taken THEN
      v_cpf := NULL;
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.profiles (id, nome, cpf, telefone)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email),
      v_cpf,
      NEW.raw_user_meta_data->>'telefone'
    )
    ON CONFLICT (id) DO UPDATE SET
      nome = EXCLUDED.nome,
      cpf = COALESCE(EXCLUDED.cpf, public.profiles.cpf),
      telefone = COALESCE(EXCLUDED.telefone, public.profiles.telefone),
      updated_at = now();
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO public.profiles (id, nome, telefone)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email), NEW.raw_user_meta_data->>'telefone')
    ON CONFLICT (id) DO NOTHING;
  END;

  IF v_is_tenant_signup THEN
    DELETE FROM public.user_roles WHERE user_id = NEW.id AND role = 'cliente'::public.app_role;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'tenant_admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'cliente'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;

DELETE FROM public.whatsapp_verification_codes WHERE user_email ILIKE 'danielbrito.emp@gmail.com';
UPDATE public.tenants SET email = NULL WHERE email ILIKE 'danielbrito.emp@gmail.com';
