
-- Atualizar trigger consume_plan_use para também aceitar assinaturas pending_cash
CREATE OR REPLACE FUNCTION public.consume_plan_use_on_appointment_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_assinatura_id uuid;
  v_limite integer;
  v_usados integer;
  v_competencia date;
  v_sub_status text;
BEGIN
  -- Apenas para agendamentos via plano
  IF COALESCE(NEW.payment_method, '') <> 'plano' AND COALESCE(NEW.tipo_agendamento, '') <> 'plano' THEN
    RETURN NEW;
  END IF;

  v_competencia := date_trunc('month', NEW.data)::date;

  -- Assinatura ativa OU pending_cash do usuário
  SELECT a.id, COALESCE(p.limite_agendamentos_mes, 4), a.status::text
    INTO v_assinatura_id, v_limite, v_sub_status
  FROM public.assinaturas a
  JOIN public.planos p ON p.id = a.plano_id
  WHERE a.user_id = NEW.user_id
    AND a.status IN ('active', 'pending_cash')
  ORDER BY a.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_assinatura_id IS NULL THEN
    RAISE EXCEPTION 'NO_ACTIVE_SUBSCRIPTION';
  END IF;

  -- Para pending_cash, limite é 1 (apenas o primeiro corte)
  IF v_sub_status = 'pending_cash' THEN
    v_limite := 1;
  END IF;

  -- Regra do produto: limite GLOBAL (não por competência)
  SELECT COUNT(*)
    INTO v_usados
  FROM public.plano_agendamentos_usos u
  WHERE u.user_id = NEW.user_id
    AND u.released_at IS NULL;

  IF v_usados >= v_limite THEN
    RAISE EXCEPTION 'PLAN_LIMIT_REACHED';
  END IF;

  -- Registra o consumo
  INSERT INTO public.plano_agendamentos_usos (user_id, assinatura_id, agendamento_id, competencia)
  VALUES (NEW.user_id, v_assinatura_id, NEW.id, v_competencia)
  ON CONFLICT (agendamento_id) DO NOTHING;

  -- Consistência do agendamento
  UPDATE public.agendamentos
  SET payment_method = 'plano',
      tipo_agendamento = 'plano',
      is_free = CASE WHEN v_sub_status = 'pending_cash' THEN false ELSE true END,
      preco = CASE WHEN v_sub_status = 'pending_cash' THEN NEW.preco ELSE 0 END,
      updated_at = now()
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

-- Atualizar enforce_plan_booking_within_period para aceitar pending_cash (sem next_billing_date)
CREATE OR REPLACE FUNCTION public.enforce_plan_booking_within_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_period_end date;
  v_period_start date;
  v_booking_date date;
  v_sub_status text;
BEGIN
  -- Only applies to bookings made via plan
  IF COALESCE(NEW.payment_method, '') <> 'plano' AND COALESCE(NEW.tipo_agendamento, '') <> 'plano' THEN
    RETURN NEW;
  END IF;

  v_booking_date := NEW.data::date;

  -- Active or pending_cash subscription
  SELECT a.next_billing_date, a.status::text
    INTO v_period_end, v_sub_status
  FROM public.assinaturas a
  WHERE a.user_id = NEW.user_id
    AND a.status IN ('active', 'pending_cash')
  ORDER BY a.created_at DESC NULLS LAST
  LIMIT 1;

  -- Para pending_cash sem next_billing_date, permitir sem restrição de período
  IF v_sub_status = 'pending_cash' THEN
    RETURN NEW;
  END IF;

  IF v_period_end IS NULL THEN
    RAISE EXCEPTION 'NO_ACTIVE_SUBSCRIPTION_PERIOD';
  END IF;

  -- Monthly cycle inferred from next_billing_date
  v_period_start := (v_period_end - INTERVAL '1 month')::date;

  -- Enforce inclusive window: [start, end]
  IF v_booking_date < v_period_start OR v_booking_date > v_period_end THEN
    RAISE EXCEPTION 'PLAN_BOOKING_OUT_OF_PERIOD';
  END IF;

  RETURN NEW;
END;
$$;
