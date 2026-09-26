
-- Function to create a default loyalty promotion for a new tenant
CREATE OR REPLACE FUNCTION public.create_default_loyalty_promotion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Insert default "Plano Fidelidade" promotion (disabled by default)
  INSERT INTO public.promocoes (nome, descricao, pontos_necessarios, ativo, weekly_required, tenant_id)
  VALUES (
    'Plano Fidelidade',
    'A cada 8 cortes realizados, o cliente ganha 1 corte grátis como recompensa pela fidelidade.',
    8,
    false,
    false,
    NEW.id
  );
  
  RETURN NEW;
END;
$$;

-- Trigger: auto-create promotion when a new tenant is inserted
DROP TRIGGER IF EXISTS trg_create_default_loyalty_promotion ON public.tenants;
CREATE TRIGGER trg_create_default_loyalty_promotion
  AFTER INSERT ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_loyalty_promotion();

-- Backfill: create default promotion for existing tenants that don't have one yet
INSERT INTO public.promocoes (nome, descricao, pontos_necessarios, ativo, weekly_required, tenant_id)
SELECT
  'Plano Fidelidade',
  'A cada 8 cortes realizados, o cliente ganha 1 corte grátis como recompensa pela fidelidade.',
  8,
  false,
  false,
  t.id
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.promocoes p WHERE p.tenant_id = t.id
);
