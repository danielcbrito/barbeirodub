-- Ensure each tenant always has a default loyalty promotion (8 cuts = 1 free), disabled by default
CREATE OR REPLACE FUNCTION public.ensure_default_loyalty_promotion(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.promocoes p
    WHERE p.tenant_id = p_tenant_id
      AND lower(trim(p.nome)) = 'plano fidelidade'
  ) THEN
    INSERT INTO public.promocoes (
      nome,
      descricao,
      pontos_necessarios,
      ativo,
      weekly_required,
      tenant_id
    ) VALUES (
      'Plano Fidelidade',
      'A cada 8 cortes realizados, o cliente ganha 1 corte grátis como recompensa pela fidelidade.',
      8,
      false,
      false,
      p_tenant_id
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_default_loyalty_promotion(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_default_loyalty_promotion(uuid) TO authenticated;