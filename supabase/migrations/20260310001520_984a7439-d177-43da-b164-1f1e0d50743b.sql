-- Function to check if an email exists in auth.users (for invitation flow)
-- Returns the user id if found, null otherwise
CREATE OR REPLACE FUNCTION public.check_email_exists(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT id FROM auth.users WHERE email = lower(trim(p_email)) LIMIT 1;
$$;