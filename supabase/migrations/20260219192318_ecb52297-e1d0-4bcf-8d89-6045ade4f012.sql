
-- Function to create a barbeiro record for tenant owners (bypasses RLS)
CREATE OR REPLACE FUNCTION public.ensure_tenant_barber(p_user_id uuid, p_apelido text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_barber_id uuid;
BEGIN
  -- Check if barber already exists for this user
  SELECT id INTO v_barber_id FROM barbeiros WHERE user_id = p_user_id;
  
  IF v_barber_id IS NOT NULL THEN
    RETURN v_barber_id;
  END IF;
  
  -- Create new barber record
  INSERT INTO barbeiros (user_id, apelido, ativo, setup_completed)
  VALUES (p_user_id, p_apelido, true, true)
  RETURNING id INTO v_barber_id;
  
  RETURN v_barber_id;
END;
$$;
