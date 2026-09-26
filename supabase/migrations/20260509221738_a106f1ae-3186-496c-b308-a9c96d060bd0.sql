
-- ============================================================================
-- 1) TABELA DE TOKENS FCM POR BARBEIRO
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.barber_fcm_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbeiro_id uuid NOT NULL REFERENCES public.barbeiros(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'web' CHECK (platform IN ('web','android','ios')),
  user_agent text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_barber_fcm_tokens_barbeiro ON public.barber_fcm_tokens(barbeiro_id);

ALTER TABLE public.barber_fcm_tokens ENABLE ROW LEVEL SECURITY;

-- RLS: barbeiro só vê/gerencia seus próprios tokens
DROP POLICY IF EXISTS "Barber selects own tokens" ON public.barber_fcm_tokens;
CREATE POLICY "Barber selects own tokens" ON public.barber_fcm_tokens
  FOR SELECT TO authenticated
  USING (barbeiro_id IN (SELECT id FROM public.barbeiros WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Barber inserts own tokens" ON public.barber_fcm_tokens;
CREATE POLICY "Barber inserts own tokens" ON public.barber_fcm_tokens
  FOR INSERT TO authenticated
  WITH CHECK (barbeiro_id IN (SELECT id FROM public.barbeiros WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Barber updates own tokens" ON public.barber_fcm_tokens;
CREATE POLICY "Barber updates own tokens" ON public.barber_fcm_tokens
  FOR UPDATE TO authenticated
  USING (barbeiro_id IN (SELECT id FROM public.barbeiros WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Barber deletes own tokens" ON public.barber_fcm_tokens;
CREATE POLICY "Barber deletes own tokens" ON public.barber_fcm_tokens
  FOR DELETE TO authenticated
  USING (barbeiro_id IN (SELECT id FROM public.barbeiros WHERE user_id = auth.uid()));

CREATE TRIGGER trg_barber_fcm_tokens_updated_at
  BEFORE UPDATE ON public.barber_fcm_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 2) SEGREDO COMPARTILHADO NO VAULT (trigger -> edge function)
-- ============================================================================
DO $$
DECLARE v_exists boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'push_trigger_secret') INTO v_exists;
  IF NOT v_exists THEN
    PERFORM vault.create_secret(encode(gen_random_bytes(32),'hex'), 'push_trigger_secret', 'Shared secret used by push notification trigger');
  END IF;
END$$;

-- ============================================================================
-- 3) FUNÇÃO QUE NOTIFICA O BARBEIRO VIA EDGE FUNCTION (pg_net)
-- ============================================================================
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
  v_cliente_nome text;
  v_data_str text;
  v_hora_str text;
  v_old_data_str text;
  v_old_hora_str text;
  v_url text := 'https://djtpzvujzmrrslirzwun.supabase.co/functions/v1/send-push-notification';
  v_secret text;
  v_target_barber uuid;
BEGIN
  -- Detecta o evento
  IF TG_OP = 'INSERT' THEN
    -- Apenas notifica se foi o cliente que criou (não notificar quando o próprio barbeiro cria manualmente)
    IF COALESCE(NEW.criado_por, 'cliente') NOT IN ('cliente', 'usuario', 'user') THEN
      RETURN NEW;
    END IF;
    v_event := 'novo_agendamento';
    v_target_barber := NEW.barbeiro_id;

  ELSIF TG_OP = 'UPDATE' THEN
    v_target_barber := NEW.barbeiro_id;

    -- Cancelamento pelo cliente
    IF NEW.status = 'cancelled_by_user' AND COALESCE(OLD.status::text,'') <> 'cancelled_by_user' THEN
      v_event := 'cancelado';

    -- No-show
    ELSIF NEW.status = 'no_show' AND COALESCE(OLD.status::text,'') <> 'no_show' THEN
      v_event := 'no_show';

    -- Confirmação pelo cliente
    ELSIF COALESCE(NEW.cliente_confirmou,false) = true AND COALESCE(OLD.cliente_confirmou,false) = false THEN
      v_event := 'confirmado';

    -- Remarcação (mudou data ou hora e não é cancelamento)
    ELSIF (NEW.data <> OLD.data OR NEW.hora <> OLD.hora)
          AND NEW.status::text NOT IN ('cancelled_by_user','cancelled_by_admin','excluido') THEN
      v_event := 'remarcado';
      v_old_data_str := to_char(OLD.data, 'DD/MM');
      v_old_hora_str := to_char(OLD.hora, 'HH24h"h"');
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
  SELECT COALESCE(p.nome, 'Um cliente')
    INTO v_cliente_nome
    FROM public.profiles p
   WHERE p.id = NEW.user_id;

  v_data_str := to_char(NEW.data, 'DD/MM');
  v_hora_str := trim(to_char(NEW.hora, 'HH24:MI'));

  -- Monta título/corpo PT-BR
  IF v_event = 'novo_agendamento' THEN
    v_title := 'Novo agendamento';
    v_body  := v_cliente_nome || ' acabou de agendar para dia ' || v_data_str || ' às ' || v_hora_str;
  ELSIF v_event = 'cancelado' THEN
    v_title := 'Agendamento cancelado';
    v_body  := v_cliente_nome || ' cancelou o agendamento de ' || v_data_str || ' às ' || v_hora_str;
  ELSIF v_event = 'remarcado' THEN
    v_title := 'Agendamento remarcado';
    v_body  := v_cliente_nome || ' remarcou de ' || v_old_data_str || ' às ' || v_old_hora_str ||
               ' para ' || v_data_str || ' às ' || v_hora_str;
  ELSIF v_event = 'no_show' THEN
    v_title := 'Cliente não compareceu';
    v_body  := v_cliente_nome || ' não compareceu ao agendamento de ' || v_data_str || ' às ' || v_hora_str;
  ELSIF v_event = 'confirmado' THEN
    v_title := 'Agendamento confirmado';
    v_body  := v_cliente_nome || ' confirmou presença para ' || v_data_str || ' às ' || v_hora_str;
  ELSE
    RETURN NEW;
  END IF;

  -- Lê secret do vault
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'push_trigger_secret' LIMIT 1;

  -- Chama edge function de forma assíncrona
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-trigger-secret', COALESCE(v_secret,'')
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
  -- Nunca quebra a transação principal por causa de push
  RAISE WARNING 'notify_barber_appointment falhou: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_barber_appointment_ins ON public.agendamentos;
CREATE TRIGGER trg_notify_barber_appointment_ins
  AFTER INSERT ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.notify_barber_appointment();

DROP TRIGGER IF EXISTS trg_notify_barber_appointment_upd ON public.agendamentos;
CREATE TRIGGER trg_notify_barber_appointment_upd
  AFTER UPDATE ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.notify_barber_appointment();
