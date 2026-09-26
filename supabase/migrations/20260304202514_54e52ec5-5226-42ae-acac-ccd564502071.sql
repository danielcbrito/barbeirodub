CREATE OR REPLACE FUNCTION public.trg_send_confirm_message_on_barber_confirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  cfg record;
  cli record;
  srv record;
  barb record;
  whatsapp_inst record;

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

  template_conteudo text;
  template_ativo boolean;
  com_barbeiro text;
BEGIN
  -- Handle both INSERT and UPDATE
  IF TG_OP = 'UPDATE' THEN
    -- Original logic: only fire when barbeiro_confirmou changes from false to true
    IF COALESCE(OLD.barbeiro_confirmou, false) = true OR COALESCE(NEW.barbeiro_confirmou, false) <> true THEN
      RETURN NEW;
    END IF;
    IF NEW.status IS DISTINCT FROM 'confirmed'::appointment_status THEN RETURN NEW; END IF;
  ELSIF TG_OP = 'INSERT' THEN
    -- New logic: fire on insert when already confirmed
    IF COALESCE(NEW.barbeiro_confirmou, false) <> true THEN RETURN NEW; END IF;
    IF NEW.status IS DISTINCT FROM 'confirmed'::appointment_status THEN RETURN NEW; END IF;
  ELSE
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.agendamento_lembretes_log
    WHERE agendamento_id = NEW.id AND kind = 'agendamento_confirmado' AND channel = 'webhook'
  ) INTO already_sent;
  IF already_sent THEN RETURN NEW; END IF;

  SELECT id, apelido, tenant_id INTO barb FROM public.barbeiros WHERE id = NEW.barbeiro_id;

  -- SEMPRE usar a instância oficial da Barbearia DUB (prioridade)
  SELECT wi.instance_name, wi.api_key, wi.status
  INTO whatsapp_inst
  FROM public.whatsapp_instances wi
  JOIN public.barbeiros b ON b.id = wi.barbeiro_id
  LEFT JOIN public.tenants t ON t.id = b.tenant_id
  WHERE wi.status = 'connected'
    AND (
      t.nome ILIKE 'Barbearia DUB'
      OR b.apelido ILIKE 'Tulio'
    )
  ORDER BY
    CASE WHEN t.nome ILIKE 'Barbearia DUB' THEN 0 ELSE 1 END,
    wi.updated_at DESC
  LIMIT 1;

  -- Fallback defensivo: qualquer instância conectada
  IF whatsapp_inst IS NULL OR whatsapp_inst.instance_name IS NULL THEN
    SELECT wi.instance_name, wi.api_key, wi.status
    INTO whatsapp_inst
    FROM public.whatsapp_instances wi
    WHERE wi.status = 'connected'
    ORDER BY wi.updated_at DESC
    LIMIT 1;
  END IF;

  SELECT webhook_url, ativo INTO cfg
  FROM public.webhook_config
  ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
  LIMIT 1;

  IF cfg.webhook_url IS NULL OR cfg.ativo <> true THEN
    INSERT INTO public.agendamento_lembretes_log (agendamento_id, user_id, kind, channel, scheduled_for, status, details)
    VALUES (NEW.id, NEW.user_id, 'agendamento_confirmado', 'webhook', now(), 'skipped',
            jsonb_build_object('reason', 'webhook_inativo'));
    RETURN NEW;
  END IF;

  -- Template global (sem tenant_id)
  SELECT conteudo, ativo INTO template_conteudo, template_ativo
  FROM public.mensagem_templates
  WHERE slug = 'confirmacao_agendamento'
  LIMIT 1;

  SELECT id, nome, telefone INTO cli FROM public.profiles WHERE id = NEW.user_id;
  SELECT id, nome INTO srv FROM public.servicos WHERE id = NEW.servico_id;
  first_name := split_part(COALESCE(cli.nome, 'Cliente'), ' ', 1);

  v_dow := EXTRACT(DOW FROM NEW.data)::int;
  v_day := EXTRACT(DAY FROM NEW.data)::int;
  v_month := EXTRACT(MONTH FROM NEW.data)::int;

  date_pretty := CASE v_dow
    WHEN 0 THEN 'domingo' WHEN 1 THEN 'segunda-feira' WHEN 2 THEN 'terça-feira'
    WHEN 3 THEN 'quarta-feira' WHEN 4 THEN 'quinta-feira'
    WHEN 5 THEN 'sexta-feira' WHEN 6 THEN 'sábado' ELSE 'dia'
  END || ', ' || lpad(v_day::text, 2, '0') || ' de ' || CASE v_month
    WHEN 1 THEN 'janeiro' WHEN 2 THEN 'fevereiro' WHEN 3 THEN 'março'
    WHEN 4 THEN 'abril' WHEN 5 THEN 'maio' WHEN 6 THEN 'junho'
    WHEN 7 THEN 'julho' WHEN 8 THEN 'agosto' WHEN 9 THEN 'setembro'
    WHEN 10 THEN 'outubro' WHEN 11 THEN 'novembro' WHEN 12 THEN 'dezembro' ELSE 'mês'
  END;

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
  FOR s IN SELECT unnest(services_arr) LOOP
    IF s IS NULL OR btrim(s) = '' THEN CONTINUE; END IF;
    service_lines := service_lines || E'\n✂️ ' || btrim(s);
  END LOOP;

  has_free_token := (NEW.observacoes ILIKE '%corte grátis%');
  IF NEW.tipo_agendamento = 'plano' THEN price_line := 'Plano';
  ELSIF COALESCE(NEW.is_free, false) = true AND (COALESCE(NEW.preco, 0) <= 0) THEN price_line := 'Corte grátis';
  ELSIF COALESCE(NEW.is_free, false) = true AND (COALESCE(NEW.preco, 0) > 0) THEN price_line := 'Corte grátis + R$ ' || to_char(NEW.preco, 'FM999999990.00');
  ELSIF has_free_token AND (COALESCE(NEW.preco, 0) > 0) THEN price_line := 'Corte grátis + R$ ' || to_char(NEW.preco, 'FM999999990.00');
  ELSE price_line := 'R$ ' || to_char(NEW.preco, 'FM999999990.00');
  END IF;

  com_barbeiro := CASE WHEN barb.apelido IS NOT NULL THEN ' com ' || barb.apelido ELSE '' END;

  IF template_conteudo IS NOT NULL AND COALESCE(template_ativo, true) = true THEN
    msg := template_conteudo;
    msg := replace(msg, '{nome}', first_name);
    msg := replace(msg, '{hora}', to_char(NEW.hora, 'HH24:MI'));
    msg := replace(msg, '{data}', date_pretty);
    msg := replace(msg, '{servico}', ltrim(service_lines, E'\n'));
    msg := replace(msg, '{barbeiro}', com_barbeiro);
    msg := replace(msg, '{preco}', price_line);
  ELSE
    msg := 'Olá ' || first_name || '! 🎉'
      || E'\n\nSeu agendamento foi confirmado!\n'
      || E'\n📅 ' || date_pretty
      || E'\n⏰ ' || to_char(NEW.hora, 'HH24:MI')
      || CASE WHEN barb.apelido IS NOT NULL THEN E'\n💈 ' || barb.apelido ELSE '' END
      || service_lines
      || E'\n💰 ' || price_line
      || E'\n\nAguardamos você! Qualquer dúvida, estamos à disposição.';
  END IF;

  SELECT net.http_post(
    url := cfg.webhook_url,
    body := jsonb_build_object(
      'evento', 'agendamento_confirmado',
      'programado', false,
      'timestamp', now(),
      'agendamento_id', NEW.id,
      'total_contatos', 1,
      'whatsapp_instance', CASE
        WHEN whatsapp_inst.instance_name IS NOT NULL THEN
          jsonb_build_object(
            'instance_name', whatsapp_inst.instance_name,
            'api_key', whatsapp_inst.api_key,
            'status', whatsapp_inst.status
          )
        ELSE NULL
      END,
      'barbeiro_id', NEW.barbeiro_id,
      'tenant_id', barb.tenant_id,
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
      'tenant_id', barb.tenant_id,
      'servico_id', NEW.servico_id,
      'tipo_agendamento', NEW.tipo_agendamento,
      'is_free', NEW.is_free,
      'preco', NEW.preco,
      'observacoes', NEW.observacoes,
      'usou_template', template_conteudo IS NOT NULL,
      'whatsapp_instance_name', whatsapp_inst.instance_name,
      'whatsapp_via_barbeiro', false
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.agendamento_lembretes_log (agendamento_id, user_id, kind, channel, scheduled_for, status, details)
  VALUES (NEW.id, NEW.user_id, 'agendamento_confirmado', 'webhook', now(), 'error',
    jsonb_build_object('error', SQLERRM));
  RETURN NEW;
END;
$function$;