DROP FUNCTION IF EXISTS public.check_email_exists(text);

CREATE OR REPLACE FUNCTION public.check_email_exists(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id
  FROM auth.users
  WHERE lower(email) = lower(trim(p_email))
  LIMIT 1
$$;

DROP FUNCTION IF EXISTS public.check_barbeiro_email_exists(text);

CREATE OR REPLACE FUNCTION public.check_barbeiro_email_exists(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.barbeiros_private bp
    JOIN public.barbeiros b ON b.id = bp.barbeiro_id
    WHERE bp.email IS NOT NULL
      AND lower(bp.email) = lower(trim(p_email))
      AND b.deleted_at IS NULL
  )
$$;