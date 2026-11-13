-- ═══════════════════════════════════════════════════════════════
-- RENOVAÇÃO DO PLANO: Barbearia VIP Exclusive (+1 mês)
-- ═══════════════════════════════════════════════════════════════
-- Esta migração renova a assinatura da barbearia "Barbearia VIP Exclusive"
-- por mais um mês, garantindo status 'active' e estendendo a data de cobrança
-- e término de vigência por 30 dias adicionais.

DO $$
DECLARE
  v_tenant_id uuid;
  v_plano_id uuid;
  v_current_sub public.tenant_assinaturas%ROWTYPE;
  v_new_billing timestamptz;
BEGIN
  -- 1. Localizar o tenant específico "Barbearia VIP Exclusive"
  SELECT id INTO v_tenant_id
  FROM public.tenants
  WHERE lower(trim(nome)) ILIKE '%barbearia vip exclusive%'
     OR lower(trim(nome)) ILIKE '%vip exclusive%'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE NOTICE 'Tenant "Barbearia VIP Exclusive" não encontrado na base de dados no momento da migração.';
    RETURN;
  END IF;

  -- 2. Localizar um plano ativo para vincular caso a barbearia não possua plano_id
  SELECT id INTO v_plano_id
  FROM public.tenant_planos
  WHERE ativo = true
  ORDER BY destaque DESC, created_at ASC
  LIMIT 1;

  -- 3. Calcular nova data de vigência: +1 mês a partir de hoje (ou somar 1 mês se a data for futura)
  SELECT * INTO v_current_sub
  FROM public.tenant_assinaturas
  WHERE tenant_id = v_tenant_id;

  IF v_current_sub.next_billing_date IS NOT NULL AND v_current_sub.next_billing_date > now() THEN
    v_new_billing := v_current_sub.next_billing_date + interval '1 month';
  ELSE
    v_new_billing := now() + interval '1 month';
  END IF;

  -- 4. Atualizar ou inserir a assinatura como 'active' por mais um mês para a Barbearia VIP Exclusive
  INSERT INTO public.tenant_assinaturas (
    tenant_id,
    plano_id,
    status,
    trial_start,
    trial_end,
    subscription_start,
    next_billing_date,
    paid_at,
    cancelled_at,
    updated_at
  ) VALUES (
    v_tenant_id,
    v_plano_id,
    'active'::public.tenant_subscription_status,
    now(),
    v_new_billing,
    COALESCE(v_current_sub.subscription_start, now()),
    v_new_billing,
    now(),
    NULL,
    now()
  )
  ON CONFLICT (tenant_id) DO UPDATE SET
    status = 'active'::public.tenant_subscription_status,
    plano_id = COALESCE(public.tenant_assinaturas.plano_id, EXCLUDED.plano_id),
    next_billing_date = v_new_billing,
    trial_end = v_new_billing,
    paid_at = now(),
    cancelled_at = NULL,
    updated_at = now();

  -- 5. Atualizar trial_ends_at e status ativo na tabela tenants
  UPDATE public.tenants
  SET trial_ends_at = v_new_billing,
      ativo = true,
      updated_at = now()
  WHERE id = v_tenant_id;

  RAISE NOTICE 'Plano da Barbearia VIP Exclusive (ID: %) renovado com sucesso por mais 1 mês até %.', v_tenant_id, v_new_billing;
END $$;
