-- Migration: consume_plan_on_manual_encaixe
-- Garante que encaixes manuais para clientes com plano ativo contabilizem cortes no plano

-- 1. Melhorar função auto_convert_encaixe_to_plano para identificar planos ativos de clientes em encaixes manuais
CREATE OR REPLACE FUNCTION public.auto_convert_encaixe_to_plano()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_assinatura RECORD;
  v_effective_limit integer;
  v_servico_in_plan boolean := false;
BEGIN
  -- Não processa se não tiver user_id
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;

  -- Ignora se for walk-in sem cadastro (onde user_id é o próprio barbeiro ou nota de walk-in)
  IF EXISTS (SELECT 1 FROM public.barbeiros WHERE user_id = NEW.user_id) THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.observacoes, '') LIKE '%Cliente walk-in%' THEN
    RETURN NEW;
  END IF;

  -- Se já for plano com preco zero e is_free, deixa seguir para o consume_plan_use_on_appointment_insert
  IF NEW.payment_method = 'plano' THEN
    NEW.is_free := true;
    NEW.preco := 0;
    RETURN NEW;
  END IF;

  -- Processa encaixes manuais ou agendamentos criados pelo barbeiro
  IF NEW.tipo_agendamento NOT IN ('encaixe_manual', 'normal') AND NEW.criado_por <> 'barbeiro' THEN
    RETURN NEW;
  END IF;

  -- Busca assinatura ativa ou pending_cash mais recente do cliente
  SELECT a.id, a.plano_id, a.ciclo_inicio, a.ciclo_fim, a.next_billing_date,
         a.usos_ciclo_atual, a.status,
         COALESCE(p.limite_agendamentos_mes, 4) AS limite_agendamentos_mes,
         p.servico_id
  INTO v_assinatura
  FROM public.assinaturas a
  JOIN public.planos p ON p.id = a.plano_id
  WHERE a.user_id = NEW.user_id
    AND a.status IN ('active', 'pending_cash')
  ORDER BY a.created_at DESC
  LIMIT 1;

  IF v_assinatura.id IS NULL THEN RETURN NEW; END IF;

  -- Calcula limite efetivo do ciclo (pending_cash permite 1 corte até confirmação de pagamento)
  v_effective_limit := CASE
    WHEN v_assinatura.status = 'pending_cash' THEN 1
    ELSE v_assinatura.limite_agendamentos_mes
  END;

  -- Verifica se ainda restam cortes no ciclo
  IF COALESCE(v_assinatura.usos_ciclo_atual, 0) >= v_effective_limit THEN
    RETURN NEW;
  END IF;

  -- Converte o encaixe para utilizar o plano
  NEW.payment_method := 'plano';
  NEW.is_free := true;
  NEW.preco := 0;

  RETURN NEW;
END;
$function$;

-- 2. Atualizar consume_plan_use_on_appointment_insert para suportar encaixes manuais
CREATE OR REPLACE FUNCTION public.consume_plan_use_on_appointment_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  v_cash_pending boolean;
  v_privileged boolean;
BEGIN
  IF NEW.tipo_agendamento = 'plano_registro_interno' THEN
    RETURN NEW;
  END IF;

  -- Ignora walk-ins de barbeiro
  IF EXISTS (SELECT 1 FROM public.barbeiros WHERE user_id = NEW.user_id) THEN
    IF COALESCE(NEW.observacoes, '') LIKE '%Cliente walk-in%' THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Processa se for método plano, ou tipos relacionados
  IF COALESCE(NEW.payment_method, '') <> 'plano' AND COALESCE(NEW.tipo_agendamento, '') NOT IN ('plano', 'assinatura_silenciosa') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF COALESCE(OLD.payment_method, '') = 'plano'
       OR COALESCE(OLD.tipo_agendamento, '') IN ('plano', 'assinatura_silenciosa', 'plano_registro_interno') THEN
      RETURN NEW;
    END IF;
    IF NEW.status::text IN ('cancelled_by_user', 'cancelled_by_admin', 'no_show', 'excluido') THEN
      RETURN NEW;
    END IF;
  END IF;

  v_competencia := date_trunc('month', NEW.data)::date;

  SELECT a.id, COALESCE(p.limite_agendamentos_mes, 4), a.status::text, a.next_billing_date,
         (a.payment_method::text = 'cash' AND COALESCE(a.cash_payment_confirmed, false) = false)
    INTO v_assinatura_id, v_limite, v_sub_status, v_next_billing, v_cash_pending
  FROM public.assinaturas a
  JOIN public.planos p ON p.id = a.plano_id
  WHERE a.user_id = NEW.user_id
    AND a.status IN ('active', 'pending_cash')
  ORDER BY a.next_billing_date DESC NULLS LAST, a.created_at DESC NULLS LAST
  LIMIT 1;

  v_privileged := (auth.role() = 'service_role')
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'ti'::app_role)
    OR EXISTS (SELECT 1 FROM public.barbeiros b WHERE b.id = NEW.barbeiro_id AND b.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.barbeiros b JOIN public.tenants t ON t.id = b.tenant_id
               WHERE b.id = NEW.barbeiro_id AND t.owner_user_id = auth.uid());

  IF v_assinatura_id IS NULL THEN
    IF v_privileged OR NEW.tipo_agendamento = 'assinatura_silenciosa' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'PLANO_INEXISTENTE'
      USING detail = 'Nenhuma assinatura ativa encontrada para este cliente.',
            hint = 'Assine um plano para agendar com plano.';
  END IF;

  IF v_sub_status = 'pending_cash' OR v_cash_pending THEN
    v_limite := 1;
  END IF;

  IF v_next_billing IS NOT NULL THEN
    v_cycle_start := (v_next_billing - INTERVAL '1 month')::date;
    v_cycle_end := v_next_billing;
  ELSE
    v_cycle_start := '-infinity'::date;
    v_cycle_end := 'infinity'::date;
  END IF;

  -- Evita contagem duplicada se já existir consumo para este agendamento
  IF EXISTS (SELECT 1 FROM public.plano_agendamentos_usos WHERE agendamento_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_usados := public.count_subscription_uses_in_cycle(v_assinatura_id, v_cycle_start, v_cycle_end);

  IF v_usados >= v_limite AND NOT v_privileged THEN
    RAISE EXCEPTION 'PLANO_SEM_CREDITOS'
      USING detail = format('Limite de %s agendamento(s) do plano já utilizado neste ciclo.', v_limite),
            hint = 'Aguarde a renovação do plano ou a confirmação do pagamento em dinheiro pelo barbeiro.';
  END IF;

  -- Insere o consumo (o trigger trg_incrementar_uso_ciclo atualizará usos_ciclo_atual automaticamente)
  INSERT INTO public.plano_agendamentos_usos (user_id, assinatura_id, agendamento_id, competencia)
  VALUES (NEW.user_id, v_assinatura_id, NEW.id, v_competencia)
  ON CONFLICT (agendamento_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- 3. Atualizar get_assinatura_status para calcular limites e cortes disponíveis corretamente
CREATE OR REPLACE FUNCTION public.get_assinatura_status(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'tem_plano', true,
    'assinatura_id', a.id,
    'status', a.status,
    'plano_nome', p.nome,
    'plano_preco', p.preco_mensal,
    'servico_id', p.servico_id,
    'servico_nome', s.nome,
    'servico_duracao', s.duracao,
    'limite_usos', CASE WHEN a.status = 'pending_cash' THEN 1 ELSE COALESCE(p.limite_agendamentos_mes, 4) END,
    'usos_realizados', COALESCE(a.usos_ciclo_atual, 0),
    'usos_restantes', GREATEST(0, (CASE WHEN a.status = 'pending_cash' THEN 1 ELSE COALESCE(p.limite_agendamentos_mes, 4) END) - COALESCE(a.usos_ciclo_atual, 0)),
    'cortes_disponiveis', GREATEST(0, (CASE WHEN a.status = 'pending_cash' THEN 1 ELSE COALESCE(p.limite_agendamentos_mes, 4) END) - COALESCE(a.usos_ciclo_atual, 0)),
    'pode_renovar', (COALESCE(p.limite_agendamentos_mes, 4) - COALESCE(a.usos_ciclo_atual, 0)) <= 0,
    'ciclo_inicio', a.ciclo_inicio,
    'ciclo_fim', a.ciclo_fim,
    'dias_restantes', GREATEST(0, (COALESCE(a.ciclo_fim, a.next_billing_date, CURRENT_DATE) - CURRENT_DATE)),
    'total_renovacoes', COALESCE(a.total_renovacoes, 0),
    'payment_method', a.payment_method,
    'barbeiro_id', a.barbeiro_id
  ) INTO v_result
  FROM assinaturas a
  JOIN planos p ON p.id = a.plano_id
  LEFT JOIN servicos s ON s.id = p.servico_id
  WHERE a.user_id = p_user_id
    AND a.status IN ('active', 'pending_renewal', 'pending_cash')
  ORDER BY a.created_at DESC
  LIMIT 1;

  RETURN COALESCE(v_result, json_build_object('tem_plano', false));
END;
$$;
