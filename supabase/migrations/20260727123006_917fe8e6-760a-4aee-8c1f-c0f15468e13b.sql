-- Mascarar retorno: antes devolvia uuid do usuário (leak), agora devolve boolean.
DROP FUNCTION IF EXISTS public.check_email_exists(text);

CREATE OR REPLACE FUNCTION public.check_email_exists(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE lower(email) = lower(trim(p_email))
  )
$$;

GRANT EXECUTE ON FUNCTION public.check_email_exists(text) TO anon, authenticated;