-- Tenant-safe loyalty points resolution for client UI
CREATE OR REPLACE FUNCTION public.get_user_loyalty_required_points(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_required integer;
BEGIN
  -- Safety: only the authenticated owner can request their own value
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RETURN 8;
  END IF;

  -- Infer tenant from most recent appointment barber
  SELECT b.tenant_id
    INTO v_tenant_id
  FROM public.agendamentos a
  JOIN public.barbeiros b ON b.id = a.barbeiro_id
  WHERE a.user_id = p_user_id
    AND b.deleted_at IS NULL
  ORDER BY a.data DESC, a.hora DESC, a.created_at DESC
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RETURN 8;
  END IF;

  -- Prefer explicit fidelity promotion for the tenant
  SELECT p.pontos_necessarios
    INTO v_required
  FROM public.promocoes p
  WHERE p.tenant_id = v_tenant_id
    AND p.ativo = true
    AND lower(coalesce(p.nome, '')) LIKE '%fidelidade%'
  ORDER BY p.created_at DESC
  LIMIT 1;

  -- Fallback: any active tenant promotion
  IF v_required IS NULL THEN
    SELECT p.pontos_necessarios
      INTO v_required
    FROM public.promocoes p
    WHERE p.tenant_id = v_tenant_id
      AND p.ativo = true
    ORDER BY p.created_at DESC
    LIMIT 1;
  END IF;

  IF v_required IS NULL OR v_required < 2 THEN
    RETURN 8;
  END IF;

  RETURN v_required;
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_loyalty_required_points(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_loyalty_required_points(uuid) TO authenticated;

-- Tenant-safe loyalty awarding logic (prevents cross-tenant mix and hardcoded 5 fallback)
CREATE OR REPLACE FUNCTION public.award_loyalty_point()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_points integer;
  promo_id uuid;
  promo_pontos integer;
  has_available_redemption boolean;
  v_tenant_id uuid;
BEGIN
  -- Libera ponto SOMENTE quando o status muda para 'completed'
  IF (OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed')
     AND COALESCE(NEW.ponto_liberado, false) = false
     AND COALESCE(NEW.is_free, false) = false
  THEN
    -- Resolve tenant do barbeiro do agendamento
    SELECT b.tenant_id
      INTO v_tenant_id
    FROM public.barbeiros b
    WHERE b.id = NEW.barbeiro_id
      AND b.deleted_at IS NULL
    LIMIT 1;

    -- Buscar promoção ativa de fidelidade do tenant
    SELECT p.id, p.pontos_necessarios
      INTO promo_id, promo_pontos
    FROM public.promocoes p
    WHERE p.ativo = true
      AND p.tenant_id = v_tenant_id
      AND lower(coalesce(p.nome, '')) LIKE '%fidelidade%'
    ORDER BY p.created_at DESC
    LIMIT 1;

    -- Fallback: qualquer promoção ativa do tenant
    IF promo_id IS NULL THEN
      SELECT p.id, p.pontos_necessarios
        INTO promo_id, promo_pontos
      FROM public.promocoes p
      WHERE p.ativo = true
        AND p.tenant_id = v_tenant_id
      ORDER BY p.created_at DESC
      LIMIT 1;
    END IF;

    IF promo_id IS NULL THEN
      RETURN NEW;
    END IF;

    IF promo_pontos IS NULL OR promo_pontos < 2 THEN
      promo_pontos := 8;
    END IF;

    -- Verificar se já tem resgate disponível - se sim, NÃO acumula ponto
    SELECT EXISTS(
      SELECT 1 FROM public.resgates
      WHERE user_id = NEW.user_id AND status = 'available'
    ) INTO has_available_redemption;

    IF has_available_redemption THEN
      NEW.ponto_liberado = true;
      RETURN NEW;
    END IF;

    INSERT INTO public.pontos (user_id, pontos, promocao_id, last_awarded_at, updated_at)
    VALUES (NEW.user_id, 1, promo_id, NOW(), NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET
      pontos = pontos.pontos + 1,
      last_awarded_at = NOW(),
      updated_at = NOW();

    SELECT pontos INTO current_points
    FROM public.pontos
    WHERE user_id = NEW.user_id;

    IF current_points >= promo_pontos THEN
      UPDATE public.pontos
      SET pontos = 0, updated_at = NOW()
      WHERE user_id = NEW.user_id;

      INSERT INTO public.resgates (user_id, promocao_id, status, created_at, expired_at)
      VALUES (NEW.user_id, promo_id, 'available', NOW(), NOW() + INTERVAL '90 days');
    END IF;

    NEW.ponto_liberado = true;
  END IF;

  RETURN NEW;
END;
$$;