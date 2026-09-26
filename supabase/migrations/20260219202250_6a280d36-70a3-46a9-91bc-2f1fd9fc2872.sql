
-- Fix ensure_tenant_barber to scope by tenant_id
CREATE OR REPLACE FUNCTION public.ensure_tenant_barber(p_user_id uuid, p_apelido text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_barber_id uuid;
  v_tenant_id uuid;
BEGIN
  -- Get tenant_id for this user FIRST
  SELECT id INTO v_tenant_id FROM tenants WHERE owner_user_id = p_user_id LIMIT 1;
  
  IF v_tenant_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Check if barber already exists for this user IN THIS TENANT
  SELECT id INTO v_barber_id 
  FROM barbeiros 
  WHERE user_id = p_user_id 
    AND tenant_id = v_tenant_id;
  
  IF v_barber_id IS NOT NULL THEN
    RETURN v_barber_id;
  END IF;
  
  -- Create new barber record linked to tenant
  INSERT INTO barbeiros (user_id, apelido, ativo, setup_completed, tenant_id)
  VALUES (p_user_id, p_apelido, true, true, v_tenant_id)
  RETURNING id INTO v_barber_id;
  
  RETURN v_barber_id;
END;
$$;
