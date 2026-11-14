CREATE OR REPLACE FUNCTION public.confirm_tenant_plan_payment(
  p_correlation_id text,
  p_value_centavos integer,
  p_remote_payload jsonb DEFAULT '{}'::jsonb,
  p_renewal boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w public.woovi_charges%ROWTYPE;
  p public.tenant_planos%ROWTYPE;
  current_subscription public.tenant_assinaturas%ROWTYPE;
  v_tenant_id uuid;
  v_plan_id uuid;
  v_next timestamptz;
  v_same_subscription boolean;
BEGIN
  SELECT * INTO w
  FROM public.woovi_charges
  WHERE correlation_id = p_correlation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'UNKNOWN_CHARGE';
  END IF;

  IF w.status IN ('REFUNDED', 'refunded') THEN
    RAISE EXCEPTION 'CHARGE_REFUNDED';
  END IF;

  IF w.value_centavos IS DISTINCT FROM p_value_centavos OR p_value_centavos <= 0 THEN
    RAISE EXCEPTION 'VALUE_MISMATCH';
  END IF;

  IF w.metadata->>'kind' IS DISTINCT FROM 'tenant_plan' THEN
    RAISE EXCEPTION 'CHARGE_TARGET_MISMATCH';
  END IF;

  BEGIN
    v_tenant_id := (w.metadata->>'tenantId')::uuid;
    v_plan_id := (w.metadata->>'planoId')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'INVALID_TENANT_PLAN_METADATA';
  END;

  SELECT * INTO p
  FROM public.tenant_planos
  WHERE id = v_plan_id AND ativo = true;

  IF NOT FOUND OR round(p.preco_mensal * 100)::integer IS DISTINCT FROM w.value_centavos THEN
    RAISE EXCEPTION 'PLAN_VALUE_MISMATCH';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = v_tenant_id) THEN
    RAISE EXCEPTION 'UNKNOWN_TENANT';
  END IF;

  SELECT * INTO current_subscription
  FROM public.tenant_assinaturas
  WHERE tenant_id = v_tenant_id
  FOR UPDATE;

  v_same_subscription := current_subscription.tenant_id IS NOT NULL
    AND current_subscription.payment_reference = p_correlation_id
    AND current_subscription.status = 'active';

  -- Status checks never renew. Approval plus first COBR_COMPLETED is also
  -- idempotent; only a later completed installment near the due date renews.
  IF v_same_subscription
     AND (
       NOT p_renewal
       OR (
         current_subscription.next_billing_date IS NOT NULL
         AND current_subscription.next_billing_date > now() + interval '7 days'
       )
     ) THEN
    UPDATE public.woovi_charges
    SET raw_response = COALESCE(p_remote_payload, raw_response), updated_at = now()
    WHERE id = w.id;
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'tenant_id', v_tenant_id);
  END IF;

  IF v_same_subscription AND current_subscription.next_billing_date IS NOT NULL THEN
    v_next := current_subscription.next_billing_date;
    WHILE v_next <= now() LOOP
      v_next := v_next + interval '1 month';
    END LOOP;
  ELSE
    v_next := now() + interval '1 month';
  END IF;

  INSERT INTO public.tenant_assinaturas (
    tenant_id, plano_id, status, qtd_barbeiros, payment_method,
    payment_reference, paid_at, subscription_start, next_billing_date,
    cancelled_at, updated_at
  ) VALUES (
    v_tenant_id, p.id, 'active', p.max_barbeiros, 'pix_automatico',
    p_correlation_id, now(), COALESCE(current_subscription.subscription_start, now()),
    v_next, NULL, now()
  )
  ON CONFLICT (tenant_id) DO UPDATE SET
    plano_id = EXCLUDED.plano_id,
    status = 'active',
    qtd_barbeiros = EXCLUDED.qtd_barbeiros,
    payment_method = EXCLUDED.payment_method,
    payment_reference = EXCLUDED.payment_reference,
    paid_at = EXCLUDED.paid_at,
    next_billing_date = EXCLUDED.next_billing_date,
    cancelled_at = NULL,
    updated_at = now();

  UPDATE public.woovi_charges
  SET status = 'COMPLETED',
      paid_at = COALESCE(paid_at, now()),
      raw_response = COALESCE(p_remote_payload, raw_response),
      updated_at = now()
  WHERE id = w.id;

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_tenant_id,
    'plano_id', p.id,
    'next_billing_date', v_next,
    'renewal', p_renewal
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_tenant_plan_payment(text, integer, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_tenant_plan_payment(text, integer, jsonb, boolean) TO service_role;