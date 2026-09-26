-- 1. Atualizar a função que cria agendamento a partir de um uso manual
CREATE OR REPLACE FUNCTION public.auto_create_agendamento_from_plano_uso()
 RETURNS trigger
 LANGUAGE plpgsql
 AS $function$
 DECLARE
   v_servico_id UUID;
   v_barbeiro_id UUID;
   v_new_agendamento_id UUID;
   v_data DATE;
   v_hora TIME;
 BEGIN
   -- Se já tem um agendamento_id, não faz nada
   IF NEW.agendamento_id IS NOT NULL THEN
     RETURN NEW;
   END IF;
 
   -- Busca o servico_id vinculado ao plano da assinatura
   SELECT p.servico_id INTO v_servico_id
   FROM public.assinaturas a
   JOIN public.planos p ON a.plano_id = p.id
   WHERE a.id = NEW.assinatura_id;
 
   -- Busca a barbearia preferida do usuário para definir o barbeiro fallback
   SELECT b.id INTO v_barbeiro_id
   FROM public.barbeiros b
   JOIN public.profiles pr ON pr.barbearia_preferida_id = b.tenant_id
   WHERE pr.id = NEW.user_id
   LIMIT 1;
 
   v_data := NEW.created_at::DATE;
   v_hora := NEW.created_at::TIME;
 
   -- Cria o agendamento com um tipo especial para evitar circularidade nos triggers
   INSERT INTO public.agendamentos (
     user_id,
     barbeiro_id,
     servico_id,
     data,
     hora,
     status,
     payment_method,
     tipo_agendamento,
     visivel_para_usuario,
     preco,
     duracao,
     cliente_confirmou,
     barbeiro_confirmou,
     ponto_liberado
   ) VALUES (
     NEW.user_id,
     v_barbeiro_id,
     v_servico_id,
     v_data,
     v_hora,
     'completed',
     'plano',
     'plano_registro_interno', -- Tipo especial para evitar circularidade
     true,
     0,
     30,
     true,
     true,
     true
   ) RETURNING id INTO v_new_agendamento_id;
 
   -- Vincula o novo agendamento ao registro de uso
   NEW.agendamento_id := v_new_agendamento_id;
 
   RETURN NEW;
 END;
 $function$;
 
 -- 2. Atualizar a função que consome o plano para ignorar o tipo interno
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
    -- Ignora se for o tipo interno (pois ele já vem de um registro de uso)
    -- Ignora se não for plano ou silencioso
    IF NEW.tipo_agendamento = 'plano_registro_interno' THEN
      RETURN NEW;
    END IF;
 
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
      IF NEW.tipo_agendamento = 'assinatura_silenciosa' THEN
        RETURN NEW;
      END IF;
      RETURN NEW;
    END IF;
  
    IF v_sub_status = 'pending_cash' THEN
      v_limite := 1;
    END IF;
  
    IF v_next_billing IS NOT NULL THEN
      v_cycle_start := (v_next_billing - INTERVAL '1 month')::date;
      v_cycle_end := v_next_billing;
    ELSE
      v_cycle_start := '-infinity'::date;
      v_cycle_end := 'infinity'::date;
    END IF;
  
    -- Verifica se já existe um uso para este agendamento
    IF EXISTS (SELECT 1 FROM public.plano_agendamentos_usos WHERE agendamento_id = NEW.id) THEN
      RETURN NEW;
    END IF;
  
    v_usados := public.count_subscription_uses_in_cycle(
      v_assinatura_id,
      v_cycle_start,
      v_cycle_end
    );
  
    IF v_usados >= v_limite THEN
      RETURN NEW;
    END IF;
  
    -- Registra o consumo vinculado à assinatura atual
    INSERT INTO public.plano_agendamentos_usos (user_id, assinatura_id, agendamento_id, competencia)
    VALUES (NEW.user_id, v_assinatura_id, NEW.id, v_competencia)
    ON CONFLICT (agendamento_id) DO NOTHING;
  
    RETURN NEW;
  END;
  $function$;
 
 -- 3. Atualizar as notificações do WhatsApp para incluir o novo tipo no silenciamento
 CREATE OR REPLACE FUNCTION public.trg_notify_new_appointment_whatsapp()
  RETURNS trigger
  LANGUAGE plpgsql
 AS $function$
 DECLARE
   v_msg text;
   v_nome_cli text;
 BEGIN
   BEGIN
     -- Silencia para tipos de conversão ou registros internos
     IF TG_OP = 'INSERT' 
        AND COALESCE(NEW.barbeiro_confirmou, false) = false 
        AND COALESCE(NEW.tipo_agendamento, '') NOT IN ('assinatura_silenciosa', 'plano_registro_interno') 
     THEN
       SELECT split_part(COALESCE(nome, 'Cliente'), ' ', 1) INTO v_nome_cli FROM public.profiles WHERE id = NEW.user_id;
       
       v_msg := '📋 *Novo agendamento recebido!*' || E'\n' ||
                'Olá ' || v_nome_cli || '! Recebemos seu pedido para o dia ' || to_char(NEW.data, 'DD/MM') || 
                ' às ' || to_char(NEW.hora, 'HH24:MI') || '.' || E'\n' ||
                'Aguarde a confirmação do barbeiro. 🔔';
                
       PERFORM public.send_agendamento_whatsapp_webhook(NEW.id, 'novo_agendamento', v_msg);
     END IF;
   EXCEPTION WHEN OTHERS THEN
     RAISE WARNING 'trg_notify_new_appointment_whatsapp falhou: %', SQLERRM;
   END;
   RETURN NEW;
 END;
 $function$;