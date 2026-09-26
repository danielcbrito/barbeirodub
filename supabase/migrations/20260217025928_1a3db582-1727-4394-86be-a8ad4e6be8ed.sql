
-- ============================================
-- SISTEMA ANTI-FRAUDE: Proteger saldo contra conclusões fraudulentas
-- ============================================

-- 1. Trigger: impedir que barbeiro marque agendamento como "completed" 
--    ANTES do horário agendado (margem de 15 min de antecedência)
CREATE OR REPLACE FUNCTION public.enforce_completion_time_validation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scheduled_at timestamptz;
  v_now timestamptz := now();
  v_caller_role text;
BEGIN
  -- Só valida transição para 'completed'
  IF NEW.status IS DISTINCT FROM 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  -- Montar timestamp do agendamento
  v_scheduled_at := (NEW.data || ' ' || NEW.hora)::timestamptz;

  -- Bloquear se o horário agendado ainda não chegou (com 15 min de tolerância)
  IF v_now < (v_scheduled_at - INTERVAL '15 minutes') THEN
    RAISE EXCEPTION 'COMPLETION_TOO_EARLY: Não é possível finalizar um atendimento antes do horário agendado. Horário: % | Agora: %', 
      v_scheduled_at, v_now;
  END IF;

  RETURN NEW;
END;
$$;

-- Aplicar trigger
DROP TRIGGER IF EXISTS trg_enforce_completion_time ON public.agendamentos;
CREATE TRIGGER trg_enforce_completion_time
BEFORE UPDATE ON public.agendamentos
FOR EACH ROW
EXECUTE FUNCTION public.enforce_completion_time_validation();

-- 2. Atualizar calcular_saldo_barbeiro para SOMENTE contar pagamentos 
--    verificados pelo gateway (com gateway_payment_id preenchido)
--    Pagamentos manuais/cash NÃO entram no saldo digital.
CREATE OR REPLACE FUNCTION public.calcular_saldo_barbeiro(
  p_user_id uuid,
  p_barbeiro_id uuid DEFAULT NULL
)
RETURNS TABLE(
  saldo_disponivel numeric,
  saldo_processando numeric,
  total_entradas numeric,
  total_saques numeric,
  total_depositos numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entradas numeric := 0;
  v_depositos_confirmados numeric := 0;
  v_saques_concluidos numeric := 0;
  v_saques_pendentes numeric := 0;
  v_data_corte timestamptz;
BEGIN
  -- Marco zero
  SELECT mz.data_corte INTO v_data_corte
  FROM financeiro_marco_zero mz
  ORDER BY mz.created_at DESC
  LIMIT 1;

  IF v_data_corte IS NULL THEN
    v_data_corte := '1970-01-01'::timestamptz;
  END IF;

  -- ENTRADAS: SOMENTE agendamentos com pagamento VERIFICADO pelo gateway
  -- Proteção anti-fraude: sem gateway_payment_id = não conta para saldo digital
  IF p_barbeiro_id IS NOT NULL THEN
    SELECT COALESCE(SUM(
      a.preco - (
        COALESCE(t.taxa_fixa, 0) + 
        ROUND(a.preco * COALESCE(t.taxa_percentual, 0) / 100, 2)
      )
    ), 0) INTO v_entradas
    FROM agendamentos a
    INNER JOIN pagamentos p ON p.agendamento_id = a.id 
      AND p.status = 'paid'
      AND p.gateway_payment_id IS NOT NULL
    LEFT JOIN taxas_gateway t ON t.metodo_pagamento = a.payment_method AND t.ativo = true
    WHERE a.barbeiro_id = p_barbeiro_id
      AND a.status = 'completed'
      AND a.payment_method IN ('pix', 'credit_card', 'debit_card')
      AND a.created_at >= v_data_corte;
  ELSE
    SELECT COALESCE(SUM(
      a.preco - (
        COALESCE(t.taxa_fixa, 0) + 
        ROUND(a.preco * COALESCE(t.taxa_percentual, 0) / 100, 2)
      )
    ), 0) INTO v_entradas
    FROM agendamentos a
    INNER JOIN pagamentos p ON p.agendamento_id = a.id 
      AND p.status = 'paid'
      AND p.gateway_payment_id IS NOT NULL
    LEFT JOIN taxas_gateway t ON t.metodo_pagamento = a.payment_method AND t.ativo = true
    WHERE a.status = 'completed'
      AND a.payment_method IN ('pix', 'credit_card', 'debit_card')
      AND a.created_at >= v_data_corte;
  END IF;

  -- Depósitos confirmados após marco zero
  SELECT COALESCE(SUM(valor), 0) INTO v_depositos_confirmados
  FROM depositos
  WHERE user_id = p_user_id
    AND status = 'confirmado'
    AND created_at >= v_data_corte;

  -- Saques concluídos após marco zero
  SELECT COALESCE(SUM(valor), 0) INTO v_saques_concluidos
  FROM saques
  WHERE user_id = p_user_id
    AND status = 'concluido'
    AND created_at >= v_data_corte;

  -- Saques pendentes/processando após marco zero
  SELECT COALESCE(SUM(valor), 0) INTO v_saques_pendentes
  FROM saques
  WHERE user_id = p_user_id
    AND status IN ('pendente', 'processando')
    AND created_at >= v_data_corte;

  saldo_disponivel := (v_entradas + v_depositos_confirmados) - v_saques_concluidos - v_saques_pendentes;
  saldo_processando := v_saques_pendentes;
  total_entradas := v_entradas;
  total_saques := v_saques_concluidos;
  total_depositos := v_depositos_confirmados;

  IF saldo_disponivel < 0 THEN
    saldo_disponivel := 0;
  END IF;

  RETURN NEXT;
END;
$$;

-- 3. Trigger de auditoria: logar TODA conclusão de atendimento 
--    para rastreabilidade e detecção de padrões suspeitos
CREATE OR REPLACE FUNCTION public.audit_completion_antifraud()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    INSERT INTO public.audit_logs (
      user_id,
      action,
      entity_type,
      entity_id,
      new_values
    ) VALUES (
      COALESCE(auth.uid(), NEW.user_id),
      'appointment_completed_antifraud',
      'agendamentos',
      NEW.id,
      jsonb_build_object(
        'barbeiro_id', NEW.barbeiro_id,
        'preco', NEW.preco,
        'payment_method', NEW.payment_method,
        'data', NEW.data,
        'hora', NEW.hora,
        'completed_by', COALESCE(auth.uid()::text, 'system'),
        'completed_at', now()
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_completion_antifraud ON public.agendamentos;
CREATE TRIGGER trg_audit_completion_antifraud
AFTER UPDATE ON public.agendamentos
FOR EACH ROW
EXECUTE FUNCTION public.audit_completion_antifraud();
