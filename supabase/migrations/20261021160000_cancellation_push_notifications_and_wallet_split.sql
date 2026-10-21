-- ============================================================================
-- Migration: Sistema de Cancelamento com Notificações Push, Carteira e Extrato
-- ============================================================================

-- 1. TABELA DE PUSH SUBSCRIPTIONS (Suporte a múltiplos dispositivos por usuário/barbeiro)
-- Suporta Web Push API (iOS 16.4+ PWA Safari, Android PWA Chrome, Safari Desktop, Chrome Desktop)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  barbeiro_id uuid REFERENCES public.barbeiros(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text,
  auth text,
  subscription_json jsonb,
  device_type text DEFAULT 'web',
  user_agent text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_barbeiro_id ON public.push_subscriptions(barbeiro_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subscriptions_manage_policy" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_manage_policy" ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id OR barbeiro_id IN (SELECT id FROM public.barbeiros WHERE user_id = auth.uid()))
  WITH CHECK (auth.uid() = user_id OR barbeiro_id IN (SELECT id FROM public.barbeiros WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "push_subscriptions_service_policy" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_service_policy" ON public.push_subscriptions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. ATUALIZAÇÃO DO TRIGGER NOTIFY_BARBER_APPOINTMENT COM FORMATO LIMPO E DIRETO
CREATE OR REPLACE FUNCTION public.notify_barber_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event text;
  v_title text;
  v_body text;
  v_servico_nome text := 'Corte';
  v_cliente_nome text := 'Cliente';
  v_hora_str text;
  v_url text := 'https://djtpzvujzmrrslirzwun.supabase.co/functions/v1/send-push-notification';
  v_secret text;
  v_target_barber uuid;
  v_taxa_valor numeric := 0;
  v_debito_json jsonb;
  v_regra_json jsonb;
  v_appointment_ts timestamp;
BEGIN
  -- Detecta o evento
  IF TG_OP = 'INSERT' THEN
    -- Apenas notifica se foi criado por cliente/usuário
    IF COALESCE(NEW.criado_por, 'cliente') NOT IN ('cliente', 'usuario', 'user') THEN
      RETURN NEW;
    END IF;
    v_event := 'novo_agendamento';
    v_target_barber := NEW.barbeiro_id;

  ELSIF TG_OP = 'UPDATE' THEN
    v_target_barber := NEW.barbeiro_id;

    -- Cancelamento pelo cliente
    IF NEW.status = 'cancelled_by_user' AND COALESCE(OLD.status::text, '') <> 'cancelled_by_user' THEN
      v_event := 'cancelado';

    -- No-show
    ELSIF NEW.status = 'no_show' AND COALESCE(OLD.status::text, '') <> 'no_show' THEN
      v_event := 'no_show';

    -- Confirmação pelo cliente
    ELSIF COALESCE(NEW.cliente_confirmou, false) = true AND COALESCE(OLD.cliente_confirmou, false) = false THEN
      v_event := 'confirmado';

    -- Remarcação (mudou data ou hora e não é cancelamento)
    ELSIF (NEW.data <> OLD.data OR NEW.hora <> OLD.hora)
          AND NEW.status::text NOT IN ('cancelled_by_user', 'cancelled_by_admin', 'excluido') THEN
      v_event := 'remarcado';
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  IF v_target_barber IS NULL THEN
    RETURN NEW;
  END IF;

  -- Nome do cliente
  SELECT COALESCE(p.nome, 'Cliente')
    INTO v_cliente_nome
    FROM public.profiles p
   WHERE p.id = NEW.user_id;

  -- Nome do serviço
  SELECT COALESCE(s.nome, 'Corte')
    INTO v_servico_nome
    FROM public.servicos s
   WHERE s.id = NEW.servico_id;

  v_hora_str := trim(to_char(NEW.hora, 'HH24:MI'));

  -- Formatação das Notificações Push
  IF v_event = 'novo_agendamento' THEN
    -- Novo agendamento:
    -- Título: “Novo cliente agendou”
    -- Corpo: “[Serviço] • [hora]”
    v_title := 'Novo cliente agendou';
    v_body  := v_servico_nome || ' • ' || v_hora_str;

  ELSIF v_event = 'cancelado' THEN
    -- Verifica se o cancelamento tem taxa associada
    v_taxa_valor := 0;

    -- 1) Consulta registro de débito em informacoes_empresa
    SELECT valor::jsonb INTO v_debito_json
      FROM public.informacoes_empresa
     WHERE categoria = 'debitos_cliente'
       AND chave = 'debito_cancelamento_' || NEW.user_id::text
     LIMIT 1;

    IF v_debito_json IS NOT NULL THEN
      IF v_debito_json ? 'itens' AND jsonb_typeof(v_debito_json->'itens') = 'array' THEN
        SELECT COALESCE((item->>'valor_taxa')::numeric, 0) INTO v_taxa_valor
          FROM jsonb_array_elements(v_debito_json->'itens') item
         WHERE (item->>'agendamento_id')::text = NEW.id::text
           AND item->>'status' = 'pendente'
         LIMIT 1;
      END IF;

      IF v_taxa_valor <= 0 AND (v_debito_json->>'agendamento_id')::text = NEW.id::text AND v_debito_json->>'status' = 'pendente' THEN
        v_taxa_valor := COALESCE((v_debito_json->>'valor_taxa')::numeric, 0);
      END IF;
    END IF;

    -- 2) Fallback: se cancelou com menos de 2h de antecedência e a taxa do barbeiro está habilitada
    IF v_taxa_valor <= 0 THEN
      SELECT valor::jsonb INTO v_regra_json
        FROM public.informacoes_empresa
       WHERE categoria = 'configuracoes_gerais'
         AND chave = 'taxa_cancelamento_' || NEW.barbeiro_id::text
       LIMIT 1;

      IF v_regra_json IS NOT NULL AND (v_regra_json->>'habilitado')::boolean = true THEN
        v_appointment_ts := (NEW.data::text || ' ' || NEW.hora::text)::timestamp;
        -- Menos de 2 horas de antecedência ou após o horário
        IF v_appointment_ts <= now() + interval '2 hours' THEN
          IF v_regra_json->>'tipo' = 'fixo' THEN
            v_taxa_valor := COALESCE((v_regra_json->>'valor')::numeric, 15);
          ELSE
            v_taxa_valor := round(COALESCE(NEW.preco, 0) * (COALESCE((v_regra_json->>'valor')::numeric, 20) / 100.0), 2);
          END IF;
        END IF;
      END IF;
    END IF;

    IF v_taxa_valor > 0 THEN
      -- Cliente cancelou — com taxa:
      -- Título: “Cancelamento com taxa”
      -- Corpo: “[Nome do cliente] • Taxa de R$X,XX pendente”
      v_title := 'Cancelamento com taxa';
      v_body  := v_cliente_nome || ' • Taxa de R$ ' || replace(to_char(v_taxa_valor, 'FM999G990D00'), '.', ',') || ' pendente';
    ELSE
      -- Cliente cancelou — sem taxa (cancelou com mais de 2h):
      -- Título: “Agendamento cancelado”
      -- Corpo: “[Nome do cliente] • [serviço] • [hora]”
      v_title := 'Agendamento cancelado';
      v_body  := v_cliente_nome || ' • ' || v_servico_nome || ' • ' || v_hora_str;
    END IF;

  ELSIF v_event = 'remarcado' THEN
    v_title := 'Agendamento remarcado';
    v_body  := v_cliente_nome || ' • ' || v_servico_nome || ' • ' || v_hora_str;

  ELSIF v_event = 'no_show' THEN
    v_title := 'Cliente não compareceu';
    v_body  := v_cliente_nome || ' • ' || v_servico_nome || ' • ' || v_hora_str;

  ELSIF v_event = 'confirmado' THEN
    v_title := 'Agendamento confirmado';
    v_body  := v_cliente_nome || ' • ' || v_servico_nome || ' • ' || v_hora_str;

  ELSE
    RETURN NEW;
  END IF;

  -- Busca o segredo de disparo do Vault
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'push_trigger_secret' LIMIT 1;

  -- Dispara requisição HTTP assíncrona para a Edge Function send-push-notification
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-trigger-secret', COALESCE(v_secret, '')
    ),
    body := jsonb_build_object(
      'barber_id', v_target_barber,
      'title', v_title,
      'body',  v_body,
      'data', jsonb_build_object(
        'event', v_event,
        'appointment_id', NEW.id::text,
        'url', '/barbeiro'
      )
    ),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_barber_appointment falhou: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- 3. ATUALIZAÇÃO DA FUNÇÃO CONFIRM_WOOVI_PAYMENT COM CRÉDITO DE 50% DA TAXA NA CARTEIRA DO BARBEIRO
CREATE OR REPLACE FUNCTION public.confirm_woovi_payment(p_correlation_id text, p_value_centavos integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w public.woovi_charges%ROWTYPE;
  pb public.pending_bookings%ROWTYPE;
  sub public.assinaturas%ROWTYPE;
  ap uuid;
  release_at timestamptz;
  today_sp date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_repasse numeric;
  v_carteira_id uuid;
  v_secret text;
BEGIN
  SELECT * INTO w FROM public.woovi_charges WHERE correlation_id = p_correlation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'UNKNOWN_CHARGE'; END IF;
  IF w.value_centavos IS DISTINCT FROM p_value_centavos OR p_value_centavos <= 0 THEN RAISE EXCEPTION 'VALUE_MISMATCH'; END IF;
  IF w.status IN ('REFUNDED', 'refunded') THEN RAISE EXCEPTION 'CHARGE_REFUNDED'; END IF;
  IF w.status = 'COMPLETED' AND w.paid_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true);
  END IF;

  ap := w.agendamento_id;

  -- TRATAMENTO DE TAXA DE CANCELAMENTO (cancellation_debt)
  IF (w.metadata->>'purpose' = 'cancellation_debt' OR w.correlation_id LIKE 'debt-%' OR w.correlation_id LIKE 'taxa-%') THEN
    -- Creditar 50% do valor da taxa ao confirmar webhook Woovi
    v_repasse := (w.value_centavos / 100.0) * 0.50;

    -- Localiza ou inicializa carteira do barbeiro
    SELECT id INTO v_carteira_id FROM public.carteiras WHERE barbeiro_id = w.barbeiro_id FOR UPDATE;
    IF v_carteira_id IS NULL THEN
      INSERT INTO public.carteiras(barbeiro_id, saldo_disponivel)
      VALUES (w.barbeiro_id, v_repasse)
      RETURNING id INTO v_carteira_id;
    ELSE
      UPDATE public.carteiras
         SET saldo_disponivel = COALESCE(saldo_disponivel, 0) + v_repasse,
             updated_at = now()
       WHERE id = v_carteira_id;
    END IF;

    -- Registra transação financeira para extrato do barbeiro (separada como taxa de cancelamento)
    INSERT INTO public.transacoes_financeiras(
      carteira_id,
      barbeiro_id,
      tipo,
      valor,
      status,
      descricao,
      metadata
    ) VALUES (
      v_carteira_id,
      w.barbeiro_id,
      'entrada',
      v_repasse,
      'completed',
      'Taxa de cancelamento',
      jsonb_build_object(
        'categoria', 'taxa_cancelamento',
        'purpose', 'cancellation_debt',
        'valor_bruto', (w.value_centavos / 100.0),
        'percentual_barbeiro', 50,
        'correlation_id', w.correlation_id,
        'agendamento_id', w.agendamento_id,
        'user_id', w.user_id
      )
    );

    -- Atualiza status do débito do cliente em informacoes_empresa para liberá-lo
    IF w.user_id IS NOT NULL THEN
      UPDATE public.informacoes_empresa
         SET valor = jsonb_set(
               jsonb_set(
                 valor::jsonb,
                 '{status}',
                 '"pago"'
               ),
               '{total_pendente}',
               '0'
             )::text,
             ativo = false,
             atualizado_em = now()
       WHERE categoria = 'debitos_cliente'
         AND chave = 'debito_cancelamento_' || w.user_id::text;
    END IF;

    -- Atualiza woovi_charges
    UPDATE public.woovi_charges
       SET status = 'COMPLETED',
           paid_at = COALESCE(paid_at, now()),
           released_at = COALESCE(released_at, now()),
           updated_at = now()
     WHERE id = w.id;

    -- Dispara notificação push para o barbeiro:
    -- Título: “Pagamento recebido”
    -- Corpo: “Taxa de cancelamento • + R$X,XX na carteira”
    BEGIN
      SELECT decrypted_secret INTO v_secret
        FROM vault.decrypted_secrets WHERE name = 'push_trigger_secret' LIMIT 1;

      PERFORM net.http_post(
        url := 'https://djtpzvujzmrrslirzwun.supabase.co/functions/v1/send-push-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-trigger-secret', COALESCE(v_secret, '')
        ),
        body := jsonb_build_object(
          'barber_id', w.barbeiro_id,
          'title', 'Pagamento recebido',
          'body', 'Taxa de cancelamento • + R$ ' || replace(to_char(v_repasse, 'FM999G990D00'), '.', ',') || ' na carteira',
          'data', jsonb_build_object(
            'event', 'taxa_recebida',
            'url', '/barbeiro/carteira',
            'valor', v_repasse
          )
        ),
        timeout_milliseconds := 5000
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Push de taxa de cancelamento recebida falhou: %', SQLERRM;
    END;

    RETURN jsonb_build_object(
      'success', true,
      'cancellation_debt', true,
      'barbeiro_id', w.barbeiro_id,
      'credited_amount', v_repasse
    );

  ELSIF w.pending_booking_id IS NOT NULL THEN
    SELECT * INTO pb FROM public.pending_bookings WHERE id = w.pending_booking_id FOR UPDATE;
    IF NOT FOUND OR pb.expires_at < now() THEN RAISE EXCEPTION 'BOOKING_EXPIRED_RECONCILIATION_REQUIRED'; END IF;
    IF pb.user_id IS DISTINCT FROM w.user_id OR pb.barbeiro_id IS DISTINCT FROM w.barbeiro_id THEN RAISE EXCEPTION 'BOOKING_OWNER_MISMATCH'; END IF;
    IF nullif(w.metadata->>'reschedule_from_id', '') IS NOT NULL THEN
      UPDATE public.agendamentos SET status = 'cancelled_by_user', visivel_para_usuario = false WHERE id = (w.metadata->>'reschedule_from_id')::uuid AND user_id = w.user_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'RESCHEDULE_NOT_OWNED'; END IF;
    END IF;
    INSERT INTO public.agendamentos(user_id, servico_id, barbeiro_id, data, hora, duracao, preco, observacoes, status, payment_method, barbeiro_confirmou, cliente_confirmou, remarcado_de)
    VALUES(pb.user_id, pb.servico_id, pb.barbeiro_id, pb.data, pb.hora, pb.duracao, pb.preco, pb.observacoes, 'confirmed', 'pix', true, true, nullif(w.metadata->>'reschedule_from_id', '')::uuid) RETURNING id INTO ap;
    UPDATE public.woovi_charges SET agendamento_id = ap WHERE id = w.id;
    DELETE FROM public.pending_bookings WHERE id = pb.id;

  ELSIF ap IS NOT NULL THEN
    UPDATE public.agendamentos SET status = 'confirmed', cliente_confirmou = true, barbeiro_confirmou = true WHERE id = ap AND user_id = w.user_id AND status = 'pending';

  ELSIF w.assinatura_id IS NOT NULL THEN
    SELECT * INTO sub FROM public.assinaturas WHERE id = w.assinatura_id FOR UPDATE;
    IF NOT FOUND OR sub.user_id IS DISTINCT FROM w.user_id OR sub.barbeiro_id IS DISTINCT FROM w.barbeiro_id THEN RAISE EXCEPTION 'SUBSCRIPTION_OWNER_MISMATCH'; END IF;
    IF sub.status = 'cancelled' THEN RAISE EXCEPTION 'SUBSCRIPTION_CANCELLED_RECONCILIATION_REQUIRED'; END IF;
    IF EXISTS(SELECT 1 FROM public.agendamentos WHERE user_id = w.user_id AND barbeiro_id = w.barbeiro_id AND status = 'completed') THEN release_at := now(); END IF;
    UPDATE public.assinaturas SET status = 'active', payment_method = 'pix', ciclo_inicio = today_sp, ciclo_fim = today_sp + 30, next_billing_date = today_sp + 30, updated_at = now() WHERE id = sub.id;

  ELSIF w.pedido_id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.pedidos WHERE id = w.pedido_id AND user_id = w.user_id AND payment_provider = 'woovi') THEN RAISE EXCEPTION 'ORDER_OWNER_MISMATCH'; END IF;
    PERFORM public.store_finalize_paid_order(w.pedido_id);
    release_at := now();

  ELSE
    RAISE EXCEPTION 'CHARGE_TARGET_MISSING';
  END IF;

  IF ap IS NOT NULL OR w.assinatura_id IS NOT NULL THEN
    INSERT INTO public.pagamentos(user_id, agendamento_id, assinatura_id, metodo, valor, status, gateway_payment_id, data_pagamento)
    VALUES(w.user_id, ap, w.assinatura_id, 'pix', w.value_centavos / 100.0, 'paid', 'woovi:' || w.correlation_id, now());
  END IF;

  UPDATE public.woovi_charges
     SET status = 'COMPLETED',
         paid_at = COALESCE(paid_at, now()),
         released_at = COALESCE(released_at, release_at),
         updated_at = now()
   WHERE id = w.id;

  RETURN jsonb_build_object('success', true, 'agendamento_id', ap, 'assinatura_id', w.assinatura_id, 'pedido_id', w.pedido_id);
END $$;

REVOKE ALL ON FUNCTION public.confirm_woovi_payment(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_woovi_payment(text, integer) TO service_role;
