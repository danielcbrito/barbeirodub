
-- 1) Revogar execução pública de funções administrativas
REVOKE EXECUTE ON FUNCTION public.admin_invalidar_indicacao(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_invalidar_indicacao(uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.apurar_ciclo_indicacao(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.apurar_ciclo_indicacao(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.apurar_ciclos_vencidos() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.apurar_ciclos_vencidos() TO service_role;

REVOKE EXECUTE ON FUNCTION public.criar_ciclo_indicacao(text, date, date, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.criar_ciclo_indicacao(text, date, date, integer, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_logs() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.cleanup_old_logs() TO service_role;

-- 2) PIN financeiro — validar no servidor com bcrypt (pgcrypto), sem expor o hash ao cliente
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Bloqueia leitura direta da tabela pelo cliente (mantém INSERT/UPDATE/DELETE não expõem o hash)
REVOKE SELECT ON public.pin_financeiro FROM anon, authenticated;
-- service_role mantém acesso total
GRANT ALL ON public.pin_financeiro TO service_role;

-- Função: existe PIN configurado?
CREATE OR REPLACE FUNCTION public.has_financial_pin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pin_financeiro WHERE user_id = auth.uid()
  );
$$;
REVOKE EXECUTE ON FUNCTION public.has_financial_pin() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_financial_pin() TO authenticated, service_role;

-- Função: valida PIN informado (suporta hashes legados btoa e novos bcrypt)
CREATE OR REPLACE FUNCTION public.verify_financial_pin(p_pin text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
  v_uid  uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_pin IS NULL OR length(p_pin) < 4 THEN
    RETURN false;
  END IF;

  SELECT pin_hash INTO v_hash FROM public.pin_financeiro WHERE user_id = v_uid;
  IF v_hash IS NULL THEN
    RETURN false;
  END IF;

  -- bcrypt (novo formato: começa com $2)
  IF left(v_hash, 2) = '$2' THEN
    RETURN crypt(p_pin, v_hash) = v_hash;
  END IF;

  -- Legado: btoa(pin) = base64(utf8(pin))
  RETURN v_hash = encode(convert_to(p_pin, 'UTF8'), 'base64');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.verify_financial_pin(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.verify_financial_pin(text) TO authenticated, service_role;

-- Função: define/altera PIN (grava sempre em bcrypt); exige PIN atual se existir
CREATE OR REPLACE FUNCTION public.set_financial_pin(p_new_pin text, p_current_pin text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_hash text;
  v_new_hash text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_new_pin IS NULL OR p_new_pin !~ '^\d{4}$' THEN
    RAISE EXCEPTION 'invalid_pin_format';
  END IF;

  SELECT pin_hash INTO v_hash FROM public.pin_financeiro WHERE user_id = v_uid;

  IF v_hash IS NOT NULL THEN
    IF p_current_pin IS NULL THEN
      RAISE EXCEPTION 'current_pin_required';
    END IF;

    IF left(v_hash, 2) = '$2' THEN
      IF crypt(p_current_pin, v_hash) <> v_hash THEN
        RAISE EXCEPTION 'current_pin_invalid';
      END IF;
    ELSE
      IF v_hash <> encode(convert_to(p_current_pin, 'UTF8'), 'base64') THEN
        RAISE EXCEPTION 'current_pin_invalid';
      END IF;
    END IF;
  END IF;

  v_new_hash := crypt(p_new_pin, gen_salt('bf', 10));

  INSERT INTO public.pin_financeiro (user_id, pin_hash)
  VALUES (v_uid, v_new_hash)
  ON CONFLICT (user_id) DO UPDATE
    SET pin_hash = EXCLUDED.pin_hash,
        updated_at = now();

  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_financial_pin(text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_financial_pin(text, text) TO authenticated, service_role;
