
-- 1) Add tenant_id column
ALTER TABLE public.horarios_excepcionais
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

-- 2) Backfill from unidade_id when present
UPDATE public.horarios_excepcionais he
SET tenant_id = tu.tenant_id
FROM public.tenant_unidades tu
WHERE he.unidade_id = tu.id
  AND he.tenant_id IS NULL;

-- 3) Delete leaky orphan rows that never belonged to any tenant.
--    These are the exceptions that were being applied system-wide.
DELETE FROM public.horarios_excepcionais WHERE tenant_id IS NULL;

-- 4) Enforce tenant scoping going forward
ALTER TABLE public.horarios_excepcionais ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_horarios_excepcionais_tenant_data
  ON public.horarios_excepcionais(tenant_id, data);

-- 5) Trigger: auto-fill tenant_id from unidade OR from the caller's tenant
CREATE OR REPLACE FUNCTION public.set_horario_excepcional_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  IF NEW.tenant_id IS NULL THEN
    IF NEW.unidade_id IS NOT NULL THEN
      SELECT tenant_id INTO v_tenant FROM public.tenant_unidades WHERE id = NEW.unidade_id;
    END IF;

    IF v_tenant IS NULL THEN
      SELECT tenant_id INTO v_tenant
      FROM public.barbeiros
      WHERE user_id = auth.uid()
      LIMIT 1;
    END IF;

    IF v_tenant IS NULL THEN
      SELECT tenant_id INTO v_tenant
      FROM public.tenant_members
      WHERE user_id = auth.uid()
      LIMIT 1;
    END IF;

    IF v_tenant IS NULL THEN
      RAISE EXCEPTION 'Não foi possível determinar a barbearia da exceção (tenant_id ausente)';
    END IF;

    NEW.tenant_id := v_tenant;
  END IF;

  -- Consistência: se veio unidade, ela precisa pertencer ao mesmo tenant
  IF NEW.unidade_id IS NOT NULL THEN
    PERFORM 1 FROM public.tenant_unidades
      WHERE id = NEW.unidade_id AND tenant_id = NEW.tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'A unidade informada não pertence à barbearia (tenant) da exceção';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_horario_excepcional_tenant ON public.horarios_excepcionais;
CREATE TRIGGER trg_set_horario_excepcional_tenant
BEFORE INSERT ON public.horarios_excepcionais
FOR EACH ROW EXECUTE FUNCTION public.set_horario_excepcional_tenant();

-- 6) Rewrite RLS policies with tenant scoping
DROP POLICY IF EXISTS "Admins podem gerenciar exceções de horário" ON public.horarios_excepcionais;
DROP POLICY IF EXISTS "Tenant admins podem gerenciar exceções de horário" ON public.horarios_excepcionais;
DROP POLICY IF EXISTS "Todos podem ver exceções de horário" ON public.horarios_excepcionais;

-- Leitura permanece pública (dados de agenda não são sensíveis; clientes precisam ver
-- quando a barbearia está fechada). O vazamento não era de leitura e sim de escopo.
CREATE POLICY "Ver exceções de horário"
ON public.horarios_excepcionais
FOR SELECT
USING (true);

-- Admin global da plataforma
CREATE POLICY "Admin plataforma gerencia exceções de horário"
ON public.horarios_excepcionais
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Tenant admin só mexe nas exceções do próprio tenant
CREATE POLICY "Tenant admin gerencia exceções do próprio tenant"
ON public.horarios_excepcionais
FOR ALL
USING (
  has_role(auth.uid(), 'tenant_admin'::app_role)
  AND tenant_id IN (
    SELECT b.tenant_id FROM public.barbeiros b WHERE b.user_id = auth.uid()
    UNION
    SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()
  )
)
WITH CHECK (
  has_role(auth.uid(), 'tenant_admin'::app_role)
  AND tenant_id IN (
    SELECT b.tenant_id FROM public.barbeiros b WHERE b.user_id = auth.uid()
    UNION
    SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()
  )
);
