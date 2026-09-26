
-- 1) Expandir CHECK constraint para incluir novos tipos de notificação
ALTER TABLE public.notificacoes DROP CONSTRAINT notificacoes_tipo_check;

ALTER TABLE public.notificacoes ADD CONSTRAINT notificacoes_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'cancelamento'::text,
    'remarcacao'::text,
    'cancelamento_massa'::text,
    'geral'::text,
    'plano_pendente'::text,
    'agendamento_confirmado'::text,
    'atendimento_concluido'::text,
    'lembrete'::text
  ]));

-- 2) Atualizar a trigger function para ter EXCEPTION handler
-- (evita que falha na notificação bloqueie a criação da assinatura)
CREATE OR REPLACE FUNCTION public.notify_barber_on_cash_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_barber_user_id uuid;
  v_barber_apelido text;
  v_client_nome text;
  v_client_telefone text;
  v_plano_nome text;
  v_plano_preco numeric;
  v_whatsapp_inst record;
  v_tenant_id uuid;
  v_owner_user_id uuid;
  v_cfg record;
  v_msg text;
  v_request_id bigint;
  v_barber_telefone text;
BEGIN
  -- Só para inserções com payment_method = 'cash' e status = 'pending_cash'
  IF NEW.payment_method IS DISTINCT FROM 'cash' THEN RETURN NEW; END IF;
  IF NEW.status IS DISTINCT FROM 'pending_cash' THEN RETURN NEW; END IF;
  IF NEW.barbeiro_id IS NULL THEN RETURN NEW; END IF;

  -- Buscar dados do barbeiro
  SELECT b.user_id, b.apelido, b.tenant_id
  INTO v_barber_user_id, v_barber_apelido, v_tenant_id
  FROM public.barbeiros b WHERE b.id = NEW.barbeiro_id;

  IF v_barber_user_id IS NULL THEN RETURN NEW; END IF;

  -- Buscar dados do cliente
  SELECT p.nome, p.telefone INTO v_client_nome, v_client_telefone
  FROM public.profiles p WHERE p.id = NEW.user_id;

  -- Buscar dados do plano
  SELECT pl.nome, pl.preco_mensal INTO v_plano_nome, v_plano_preco
  FROM public.planos pl WHERE pl.id = NEW.plano_id;

  -- 1) Criar notificação in-app para o barbeiro
  INSERT INTO public.notificacoes (user_id, tipo, titulo, mensagem, lida)
  VALUES (
    v_barber_user_id,
    'plano_pendente',
    '💰 Novo Plano Pendente!',
    COALESCE(split_part(v_client_nome, ' ', 1), 'Cliente') 
      || ' assinou o plano ' || COALESCE(v_plano_nome, 'assinatura') 
      || ' (R$ ' || to_char(COALESCE(v_plano_preco, 0), 'FM999999990.00') 
      || ') e escolheu pagar na barbearia. Confirme o recebimento.',
    false
  );

  -- 2) Também notificar o owner do tenant (se diferente do barbeiro)
  IF v_tenant_id IS NOT NULL THEN
    SELECT t.owner_user_id INTO v_owner_user_id FROM public.tenants t WHERE t.id = v_tenant_id;
    IF v_owner_user_id IS NOT NULL AND v_owner_user_id IS DISTINCT FROM v_barber_user_id THEN
      INSERT INTO public.notificacoes (user_id, tipo, titulo, mensagem, lida)
      VALUES (
        v_owner_user_id,
        'plano_pendente',
        '💰 Novo Plano Pendente!',
        COALESCE(split_part(v_client_nome, ' ', 1), 'Cliente') 
          || ' assinou o plano ' || COALESCE(v_plano_nome, 'assinatura') 
          || ' (R$ ' || to_char(COALESCE(v_plano_preco, 0), 'FM999999990.00') 
          || ') com ' || COALESCE(v_barber_apelido, 'barbeiro') 
          || ' e escolheu pagar na barbearia.',
        false
      );
    END IF;
  ELSE
    v_owner_user_id := NULL;
  END IF;

  -- 3) Enviar notificação WhatsApp ao barbeiro/owner
  v_whatsapp_inst := NULL;

  IF v_tenant_id IS NOT NULL THEN
    IF v_owner_user_id IS NOT NULL THEN
      SELECT wi.instance_name, wi.api_key, wi.status
      INTO v_whatsapp_inst
      FROM public.whatsapp_instances wi
      JOIN public.barbeiros b ON b.id = wi.barbeiro_id
      WHERE b.tenant_id = v_tenant_id AND b.user_id = v_owner_user_id AND wi.status = 'connected'
      ORDER BY wi.updated_at DESC LIMIT 1;
    END IF;
    IF v_whatsapp_inst IS NULL OR v_whatsapp_inst.instance_name IS NULL THEN
      SELECT wi.instance_name, wi.api_key, wi.status
      INTO v_whatsapp_inst
      FROM public.whatsapp_instances wi
      JOIN public.barbeiros b ON b.id = wi.barbeiro_id
      WHERE b.tenant_id = v_tenant_id AND wi.status = 'connected'
      ORDER BY wi.updated_at DESC LIMIT 1;
    END IF;
  ELSE
    SELECT wi.instance_name, wi.api_key, wi.status
    INTO v_whatsapp_inst
    FROM public.whatsapp_instances wi
    WHERE wi.barbeiro_id = NEW.barbeiro_id AND wi.status = 'connected'
    ORDER BY wi.updated_at DESC LIMIT 1;
  END IF;

  IF v_whatsapp_inst IS NULL OR v_whatsapp_inst.instance_name IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT webhook_url, ativo INTO v_cfg
  FROM public.webhook_config
  ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST LIMIT 1;

  IF v_cfg.webhook_url IS NULL OR v_cfg.ativo <> true THEN RETURN NEW; END IF;

  -- Buscar telefone do barbeiro
  SELECT bp.telefone INTO v_barber_telefone
  FROM public.barbeiros_private bp WHERE bp.barbeiro_id = NEW.barbeiro_id;

  IF v_barber_telefone IS NULL OR btrim(v_barber_telefone) = '' THEN
    SELECT p.telefone INTO v_barber_telefone
    FROM public.profiles p WHERE p.id = v_barber_user_id;
  END IF;

  IF v_barber_telefone IS NULL OR btrim(v_barber_telefone) = '' THEN RETURN NEW; END IF;

  v_msg := '🔔 *Novo Plano Pendente!*' || E'\n\n'
    || '👤 Cliente: ' || COALESCE(v_client_nome, 'Cliente') || E'\n'
    || '📋 Plano: ' || COALESCE(v_plano_nome, 'Assinatura') || E'\n'
    || '💰 Valor: R$ ' || to_char(COALESCE(v_plano_preco, 0), 'FM999999990.00') || E'\n'
    || '💵 Pagamento: Na barbearia' || E'\n\n'
    || 'Acesse o app para confirmar o recebimento do pagamento.';

  SELECT net.http_post(
    url := v_cfg.webhook_url,
    body := jsonb_build_object(
      'evento', 'plano_cash_pendente',
      'programado', false,
      'timestamp', now(),
      'assinatura_id', NEW.id,
      'total_contatos', 1,
      'whatsapp_instance', jsonb_build_object(
        'instance_name', v_whatsapp_inst.instance_name,
        'api_key', v_whatsapp_inst.api_key,
        'status', v_whatsapp_inst.status
      ),
      'barbeiro_id', NEW.barbeiro_id,
      'tenant_id', v_tenant_id,
      'contatos', jsonb_build_array(
        jsonb_build_object(
          'cliente_id', v_barber_user_id,
          'cliente_nome', v_barber_apelido,
          'cliente_telefone', v_barber_telefone,
          'cliente_telefone_whatsapp', public.format_phone_for_whatsapp(v_barber_telefone),
          'mensagem', v_msg
        )
      )
    ),
    params := '{}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 12000
  ) INTO v_request_id;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Nunca bloqueia a criação da assinatura
  RAISE WARNING 'notify_barber_on_cash_subscription failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;
