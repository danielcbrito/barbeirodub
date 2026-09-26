
-- Função que retorna o banner_url do admin responsável por um barbeiro
CREATE OR REPLACE FUNCTION public.get_admin_banner_for_barber(p_barbeiro_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_admin_user_id uuid;
  v_banner text;
BEGIN
  -- Buscar tenant_id do barbeiro
  SELECT tenant_id INTO v_tenant_id
  FROM barbeiros
  WHERE id = p_barbeiro_id;

  IF v_tenant_id IS NOT NULL THEN
    -- Tenant barbeiro → owner do tenant
    SELECT owner_user_id INTO v_admin_user_id
    FROM tenants
    WHERE id = v_tenant_id;
  ELSE
    -- DUB global → buscar usuário com role 'admin'
    SELECT user_id INTO v_admin_user_id
    FROM user_roles
    WHERE role = 'admin'
    LIMIT 1;
  END IF;

  IF v_admin_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT banner_url INTO v_banner
  FROM profiles
  WHERE id = v_admin_user_id;

  RETURN v_banner;
END;
$$;
