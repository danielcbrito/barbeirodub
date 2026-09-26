
-- =====================================================
-- 1. Atualizar templates para refletir as mensagens reais
-- =====================================================

-- Template: Confirmação de Agendamento (mensagem que JÁ é enviada pelo trigger)
UPDATE public.mensagem_templates
SET conteudo = 'Olá {nome}! 🎉

Seu agendamento foi confirmado!

📅 {data}
⏰ {hora}
💈 {barbeiro}
✂️ {servico}
💰 {preco}

Aguardamos você! Qualquer dúvida, estamos à disposição.',
    updated_at = now()
WHERE slug = 'confirmacao_agendamento';

-- Template: Novo Agendamento Criado (mensagem enviada quando cliente agenda)
UPDATE public.mensagem_templates
SET conteudo = '📋 *Novo agendamento!*

Olá {nome}!

📅 {data}
⏰ {hora}
✂️ {servico}{barbeiro}
💰 {preco}

Aguarde a confirmação do barbeiro. 🔔',
    updated_at = now()
WHERE slug = 'novo_agendamento';

-- Template: Cancelamento (mensagem enviada quando agendamento é cancelado)
UPDATE public.mensagem_templates
SET conteudo = '❌ *Agendamento cancelado*

Olá {nome}, seu agendamento foi cancelado:

📅 {data} às {hora}
✂️ {servico}{barbeiro}

Deseja reagendar? Abra o app e escolha um novo horário! 📱',
    updated_at = now()
WHERE slug = 'cancelamento_agendamento';

-- =====================================================
-- 2. Atualizar trigger de confirmação para usar template
-- =====================================================

CREATE OR REPLACE FUNCTION public.trg_send_confirm_message_on_barber_confirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg record;
  cli record;
  srv record;
  barb record;

  services_raw text;
  services_arr text[];
  s text;
  service_lines text := '';

  first_name text;
  msg text;
  request_id bigint;
  already_sent boolean;

  date_pretty text;
  price_line text;
  has_free_token boolean := false;

  v_dow int;
  v_day int;
  v_month int;

  -- Template do banco
  template_conteudo text;
  template_ativo boolean;
  com_barbeiro text;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- Só dispara na transição: false/null -> true
  IF COALESCE(OLD.barbeiro_confirmou, false) = true OR COALESCE(NEW.barbeiro_confirmou, false) <> true THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM 'confirmed'::appointment_status THEN
    RETURN NEW;
  END IF;

  -- Evita duplicidade
  SELECT EXISTS (
    SELECT 1
    FROM public.agendamento_lembretes_log
    WHERE agendamento_id = NEW.id
      AND kind = 'agendamento_confirmado'
      AND channel = 'webhook'
  ) INTO already_sent;

  IF already_sent THEN
    RETURN NEW;
  END IF;

  -- Config do webhook
  SELECT webhook_url, ativo
  INTO cfg
  FROM public.webhook_config
  ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
  LIMIT 1;

  IF cfg.webhook_url IS NULL OR cfg.ativo IS DISTINCT FROM true THEN
    INSERT INTO public.agendamento_lembretes_log (agendamento_id, user_id, kind, channel, scheduled_for, status, details)
    VALUES (NEW.id, NEW.user_id, 'agendamento_confirmado', 'webhook', now(), 'skipped', 
            jsonb_build_object('reason', 'webhook_principal_inativo_ou_nao_configurado'));
    RETURN NEW;
  END IF;

  -- Buscar template do banco
  SELECT conteudo, ativo INTO template_conteudo, template_ativo
  FROM public.mensagem_templates
  WHERE slug = 'confirmacao_agendamento'
  LIMIT 1;

  -- Cliente / serviço / barbeiro
  SELECT id, nome, telefone INTO cli FROM public.profiles WHERE id = NEW.user_id;
  SELECT id, nome INTO srv FROM public.servicos WHERE id = NEW.servico_id;
  SELECT id, apelido INTO barb FROM public.barbeiros WHERE id = NEW.barbeiro_id;

  first_name := split_part(COALESCE(cli.nome, 'Cliente'), ' ', 1);

  -- Data por extenso pt-BR
  v_dow := EXTRACT(DOW FROM NEW.data)::int;
  v_day := EXTRACT(DAY FROM NEW.data)::int;
  v_month := EXTRACT(MONTH FROM NEW.data)::int;

  date_pretty := CASE v_dow
    WHEN 0 THEN 'domingo' WHEN 1 THEN 'segunda-feira' WHEN 2 THEN 'terça-feira'
    WHEN 3 THEN 'quarta-feira' WHEN 4 THEN 'quinta-feira'
    WHEN 5 THEN 'sexta-feira' WHEN 6 THEN 'sábado' ELSE 'dia'
  END;

  date_pretty := date_pretty || ', ' || lpad(v_day::text, 2, '0') || ' de ' || CASE v_month
    WHEN 1 THEN 'janeiro' WHEN 2 THEN 'fevereiro' WHEN 3 THEN 'março'
    WHEN 4 THEN 'abril' WHEN 5 THEN 'maio' WHEN 6 THEN 'junho'
    WHEN 7 THEN 'julho' WHEN 8 THEN 'agosto' WHEN 9 THEN 'setembro'
    WHEN 10 THEN 'outubro' WHEN 11 THEN 'novembro' WHEN 12 THEN 'dezembro' ELSE 'mês'
  END;

  -- Serviços (suporta múltiplos via observações)
  services_raw := NULL;
  IF NEW.observacoes IS NOT NULL AND NEW.observacoes ILIKE '%Serviços:%' THEN
    services_raw := NULLIF(btrim(split_part(NEW.observacoes, 'Serviços:', 2)), '');
    IF services_raw IS NOT NULL THEN
      services_raw := split_part(services_raw, E'\n', 1);
      services_raw := split_part(services_raw, E'\r', 1);
      services_raw := NULLIF(btrim(services_raw), '');
    END IF;
  END IF;

  IF services_raw IS NOT NULL THEN
    services_arr := regexp_split_to_array(services_raw, '\s*,\s*');
  ELSE
    services_arr := ARRAY[COALESCE(srv.nome, 'Serviço')];
  END IF;

  service_lines := '';
  FOR s IN SELECT unnest(services_arr)
  LOOP
    IF s IS NULL OR btrim(s) = '' THEN CONTINUE; END IF;
    service_lines := service_lines || E'\n✂️ ' || btrim(s);
  END LOOP;

  -- Preço
  has_free_token := (NEW.observacoes ILIKE '%corte grátis%');

  IF NEW.tipo_agendamento = 'plano' THEN
    price_line := 'Plano';
  ELSIF COALESCE(NEW.is_free, false) = true AND (COALESCE(NEW.preco, 0) <= 0) THEN
    price_line := 'Corte grátis';
  ELSIF COALESCE(NEW.is_free, false) = true AND (COALESCE(NEW.preco, 0) > 0) THEN
    price_line := 'Corte grátis + R$ ' || to_char(NEW.preco, 'FM999999990.00');
  ELSIF has_free_token AND (COALESCE(NEW.preco, 0) > 0) THEN
    price_line := 'Corte grátis + R$ ' || to_char(NEW.preco, 'FM999999990.00');
  ELSE
    price_line := 'R$ ' || to_char(NEW.preco, 'FM999999990.00');
  END IF;

  com_barbeiro := CASE WHEN barb.apelido IS NOT NULL THEN ' com ' || barb.apelido ELSE '' END;

  -- Montar mensagem: usa template do banco se disponível, senão usa fallback
  IF template_conteudo IS NOT NULL AND COALESCE(template_ativo, true) = true THEN
    msg := template_conteudo;
    msg := replace(msg, '{nome}', first_name);
    msg := replace(msg, '{hora}', to_char(NEW.hora, 'HH24:MI'));
    msg := replace(msg, '{data}', date_pretty);
    msg := replace(msg, '{servico}', ltrim(service_lines, E'\n'));
    msg := replace(msg, '{barbeiro}', com_barbeiro);
    msg := replace(msg, '{preco}', price_line);
  ELSE
    -- Fallback: mensagem original hardcoded
    msg := 'Olá ' || first_name || '! 🎉'
      || E'\n\nSeu agendamento foi confirmado!\n'
      || E'\n📅 ' || date_pretty
      || E'\n⏰ ' || to_char(NEW.hora, 'HH24:MI')
      || CASE WHEN barb.apelido IS NOT NULL THEN E'\n💈 ' || barb.apelido ELSE '' END
      || service_lines
      || E'\n💰 ' || price_line
      || E'\n\nAguardamos você! Qualquer dúvida, estamos à disposição.';
  END IF;

  -- Enviar para o webhook principal
  SELECT net.http_post(
    url := cfg.webhook_url,
    body := jsonb_build_object(
      'evento', 'agendamento_confirmado',
      'programado', false,
      'timestamp', now(),
      'agendamento_id', NEW.id,
      'total_contatos', 1,
      'contatos', jsonb_build_array(
        jsonb_build_object(
          'cliente_id', cli.id,
          'cliente_nome', cli.nome,
          'cliente_telefone', cli.telefone,
          'cliente_telefone_whatsapp', public.format_phone_for_whatsapp(cli.telefone),
          'mensagem', msg
        )
      )
    ),
    params := '{}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 12000
  ) INTO request_id;

  INSERT INTO public.agendamento_lembretes_log (agendamento_id, user_id, kind, channel, scheduled_for, status, details)
  VALUES (
    NEW.id, NEW.user_id, 'agendamento_confirmado', 'webhook', now(), 'sent',
    jsonb_build_object(
      'net_request_id', request_id,
      'barbeiro_id', NEW.barbeiro_id,
      'servico_id', NEW.servico_id,
      'tipo_agendamento', NEW.tipo_agendamento,
      'is_free', NEW.is_free,
      'preco', NEW.preco,
      'observacoes', NEW.observacoes,
      'usou_template', template_conteudo IS NOT NULL
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.agendamento_lembretes_log (agendamento_id, user_id, kind, channel, scheduled_for, status, details)
  VALUES (
    NEW.id, NEW.user_id, 'agendamento_confirmado', 'webhook', now(), 'error',
    jsonb_build_object('error', SQLERRM)
  );
  RETURN NEW;
END;
$$;

-- Recriar o trigger apontando para a nova função
DROP TRIGGER IF EXISTS send_confirm_message_on_barber_confirm ON public.agendamentos;
CREATE TRIGGER send_confirm_message_on_barber_confirm
  AFTER UPDATE ON public.agendamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_send_confirm_message_on_barber_confirm();
