CREATE OR REPLACE FUNCTION public.consume_plan_use_on_appointment_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_assinatura_id uuid;
  v_limite integer;
  v_usados integer;
  v_competencia date;
  v_sub_status text;
  v_next_billing date;
  v_cycle_start date;
  v_cycle_end date;
BEGIN
  -- Apenas para agendamentos via plano (incluindo o tipo silencioso usado na conversão)
  IF COALESCE(NEW.payment_method, '') <> 'plano' AND COALESCE(NEW.tipo_agendamento, '') NOT IN ('plano', 'assinatura_silenciosa') THEN
    RETURN NEW;
  END IF;

  v_competencia := date_trunc('month', NEW.data)::date;

  -- Assinatura ativa OU pending_cash do usuário (mais recente)
  SELECT a.id, COALESCE(p.limite_agendamentos_mes, 4), a.status::text, a.next_billing_date
    INTO v_assinatura_id, v_limite, v_sub_status, v_next_billing
  FROM public.assinaturas a
  JOIN public.planos p ON p.id = a.plano_id
  WHERE a.user_id = NEW.user_id
    AND a.status IN ('active', 'pending_cash')
  ORDER BY a.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_assinatura_id IS NULL THEN
    -- Se for silencioso e não achar assinatura (o que não deve ocorrer no fluxo normal), apenas ignora para não dar erro
    IF NEW.tipo_agendamento = 'assinatura_silenciosa' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'NO_ACTIVE_SUBSCRIPTION';
  END IF;

  -- Para pending_cash, limite é 1 (apenas o primeiro corte)
  IF v_sub_status = 'pending_cash' THEN
    v_limite := 1;
  END IF;

  -- Janela do ciclo atual inferida da cobrança da assinatura
  IF v_next_billing IS NOT NULL THEN
    v_cycle_start := (v_next_billing - INTERVAL '1 month')::date;
    v_cycle_end := v_next_billing;
  ELSE
    v_cycle_start := '-infinity'::date;
    v_cycle_end := 'infinity'::date;
  END IF;

  -- Contagem: considerar quando o uso foi CONSUMIDO (created_at) dentro do ciclo
  v_usados := public.count_subscription_uses_in_cycle(
    v_assinatura_id,
    v_cycle_start,
    v_cycle_end
  );

  IF v_usados >= v_limite THEN
    -- Se for silencioso, não queremos bloquear a criação da assinatura por erro de limite (segurança)
    IF NEW.tipo_agendamento = 'assinatura_silenciosa' THEN
       RETURN NEW;
    END IF;
    RAISE EXCEPTION 'PLAN_LIMIT_REACHED';
  END IF;

  -- Registra o consumo vinculado à assinatura atual
  INSERT INTO public.plano_agendamentos_usos (user_id, assinatura_id, agendamento_id, competencia)
  VALUES (NEW.user_id, v_assinatura_id, NEW.id, v_competencia)
  ON CONFLICT (agendamento_id) DO NOTHING;

  -- Consistência do agendamento
  -- Mantém o tipo_agendamento original (seja 'plano' ou 'assinatura_silenciosa')
  UPDATE public.agendamentos
  SET payment_method = 'plano',
      is_free = CASE WHEN v_sub_status = 'pending_cash' THEN false ELSE true END,
      preco = CASE WHEN v_sub_status = 'pending_cash' THEN NEW.preco ELSE 0 END,
      updated_at = now()
  WHERE id = NEW.id;

  RETURN NEW;
END;
$function$;