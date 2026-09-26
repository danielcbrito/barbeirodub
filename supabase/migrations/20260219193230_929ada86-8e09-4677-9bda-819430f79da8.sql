
-- 1. Add tenant_id to barbeiros (nullable for backward compatibility with DUB global barbers)
ALTER TABLE public.barbeiros 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;

-- 2. Create index for tenant queries
CREATE INDEX IF NOT EXISTS idx_barbeiros_tenant_id ON public.barbeiros(tenant_id);

-- 3. Update ensure_tenant_barber to set tenant_id
CREATE OR REPLACE FUNCTION public.ensure_tenant_barber(p_user_id uuid, p_apelido text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_barber_id uuid;
  v_tenant_id uuid;
BEGIN
  -- Check if barber already exists for this user
  SELECT id INTO v_barber_id FROM barbeiros WHERE user_id = p_user_id;
  
  IF v_barber_id IS NOT NULL THEN
    RETURN v_barber_id;
  END IF;
  
  -- Get tenant_id for this user
  SELECT id INTO v_tenant_id FROM tenants WHERE owner_user_id = p_user_id LIMIT 1;
  
  -- Create new barber record linked to tenant
  INSERT INTO barbeiros (user_id, apelido, ativo, setup_completed, tenant_id)
  VALUES (p_user_id, p_apelido, true, true, v_tenant_id)
  RETURNING id INTO v_barber_id;
  
  RETURN v_barber_id;
END;
$$;

-- 4. Create RPC to add a barber to a tenant (used by tenant_admin)
CREATE OR REPLACE FUNCTION public.create_tenant_barber(
  p_email text,
  p_nome text,
  p_telefone text,
  p_apelido text,
  p_comissao_pct numeric DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id uuid;
  v_caller_id uuid;
BEGIN
  v_caller_id := auth.uid();
  
  -- Verify caller is tenant_admin
  IF NOT has_role(v_caller_id, 'tenant_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas administradores de barbearia podem adicionar barbeiros');
  END IF;
  
  -- Get tenant_id
  SELECT id INTO v_tenant_id FROM tenants WHERE owner_user_id = v_caller_id;
  
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Barbearia não encontrada');
  END IF;
  
  -- Return data for edge function to process
  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_tenant_id,
    'email', p_email,
    'nome', p_nome,
    'telefone', p_telefone,
    'apelido', p_apelido,
    'comissao_pct', p_comissao_pct
  );
END;
$$;

-- 5. RLS: tenant_admin can view barbeiros of their tenant
CREATE POLICY "Tenant admin can view own tenant barbeiros"
ON public.barbeiros
FOR SELECT
USING (
  tenant_id IS NOT NULL 
  AND tenant_id = (SELECT id FROM tenants WHERE owner_user_id = auth.uid() LIMIT 1)
);

-- 6. RLS: tenant_admin can update barbeiros of their tenant
CREATE POLICY "Tenant admin can update own tenant barbeiros"
ON public.barbeiros
FOR UPDATE
USING (
  tenant_id IS NOT NULL 
  AND tenant_id = (SELECT id FROM tenants WHERE owner_user_id = auth.uid() LIMIT 1)
)
WITH CHECK (
  tenant_id IS NOT NULL 
  AND tenant_id = (SELECT id FROM tenants WHERE owner_user_id = auth.uid() LIMIT 1)
);

-- 7. RLS: tenant_admin can view private data of their barbeiros
CREATE POLICY "Tenant admin can view tenant barber private data"
ON public.barbeiros_private
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM barbeiros b
    WHERE b.id = barbeiros_private.barbeiro_id
      AND b.tenant_id IS NOT NULL
      AND b.tenant_id = (SELECT id FROM tenants WHERE owner_user_id = auth.uid() LIMIT 1)
  )
);

-- 8. RLS: tenant_admin can manage private data of their barbeiros
CREATE POLICY "Tenant admin can manage tenant barber private data"
ON public.barbeiros_private
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM barbeiros b
    WHERE b.id = barbeiros_private.barbeiro_id
      AND b.tenant_id IS NOT NULL
      AND b.tenant_id = (SELECT id FROM tenants WHERE owner_user_id = auth.uid() LIMIT 1)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM barbeiros b
    WHERE b.id = barbeiros_private.barbeiro_id
      AND b.tenant_id IS NOT NULL
      AND b.tenant_id = (SELECT id FROM tenants WHERE owner_user_id = auth.uid() LIMIT 1)
  )
);

-- 9. RLS: tenant_admin can view schedule config of their barbeiros
CREATE POLICY "Tenant admin can view tenant barber hours"
ON public.configuracoes_horario_barbeiro
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM barbeiros b
    WHERE b.id = configuracoes_horario_barbeiro.barbeiro_id
      AND b.tenant_id IS NOT NULL
      AND b.tenant_id = (SELECT id FROM tenants WHERE owner_user_id = auth.uid() LIMIT 1)
  )
);

-- 10. RLS: tenant_admin can manage schedule config of their barbeiros
CREATE POLICY "Tenant admin can manage tenant barber hours"
ON public.configuracoes_horario_barbeiro
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM barbeiros b
    WHERE b.id = configuracoes_horario_barbeiro.barbeiro_id
      AND b.tenant_id IS NOT NULL
      AND b.tenant_id = (SELECT id FROM tenants WHERE owner_user_id = auth.uid() LIMIT 1)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM barbeiros b
    WHERE b.id = configuracoes_horario_barbeiro.barbeiro_id
      AND b.tenant_id IS NOT NULL
      AND b.tenant_id = (SELECT id FROM tenants WHERE owner_user_id = auth.uid() LIMIT 1)
  )
);

-- 11. RLS: tenant_admin can view appointments of their barbeiros
CREATE POLICY "Tenant admin can view tenant appointments"
ON public.agendamentos
FOR SELECT
USING (
  barbeiro_id IN (
    SELECT b.id FROM barbeiros b
    WHERE b.tenant_id IS NOT NULL
      AND b.tenant_id = (SELECT id FROM tenants WHERE owner_user_id = auth.uid() LIMIT 1)
  )
);

-- 12. RLS: tenant_admin can update appointments of their barbeiros
CREATE POLICY "Tenant admin can update tenant appointments"
ON public.agendamentos
FOR UPDATE
USING (
  barbeiro_id IN (
    SELECT b.id FROM barbeiros b
    WHERE b.tenant_id IS NOT NULL
      AND b.tenant_id = (SELECT id FROM tenants WHERE owner_user_id = auth.uid() LIMIT 1)
  )
)
WITH CHECK (
  barbeiro_id IN (
    SELECT b.id FROM barbeiros b
    WHERE b.tenant_id IS NOT NULL
      AND b.tenant_id = (SELECT id FROM tenants WHERE owner_user_id = auth.uid() LIMIT 1)
  )
);
