
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
    WHERE LOWER(email) = LOWER(p_email)
  )
$$;
