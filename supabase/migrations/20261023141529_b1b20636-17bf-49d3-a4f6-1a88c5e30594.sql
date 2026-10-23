CREATE OR REPLACE FUNCTION public.notify_barber_appointment()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_event text; v_title text; v_body text; v_servico text; v_when text;
  v_url text := 'https://djtpzvujzmrrslirzwun.supabase.co/functions/v1/send-push-notification';
  v_secret text;
BEGIN
  IF NEW.barbeiro_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.criado_por, 'cliente') NOT IN ('cliente','usuario','user') THEN RETURN NEW; END IF;
    v_event := 'novo_agendamento'; v_title := 'Novo cliente agendou';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'cancelled_by_user' AND COALESCE(OLD.status::text,'') <> 'cancelled_by_user' THEN
      v_event := 'cancelado'; v_title := 'Cliente cancelou';
    ELSIF NEW.status = 'no_show' AND COALESCE(OLD.status::text,'') <> 'no_show' THEN
      v_event := 'no_show'; v_title := 'Cliente não compareceu';
    ELSIF COALESCE(NEW.cliente_confirmou,false) AND NOT COALESCE(OLD.cliente_confirmou,false) THEN
      v_event := 'confirmado'; v_title := 'Cliente confirmou presença';
    ELSIF (NEW.data <> OLD.data OR NEW.hora <> OLD.hora)
          AND NEW.status::text NOT IN ('cancelled_by_user','cancelled_by_admin','excluido') THEN
      v_event := 'remarcado'; v_title := 'Cliente remarcou';
    ELSE RETURN NEW; END IF;
  ELSE RETURN NEW; END IF;

  SELECT s.nome INTO v_servico FROM public.servicos s WHERE s.id = NEW.servico_id;
  v_when := CASE WHEN NEW.data = (now() AT TIME ZONE 'America/Sao_Paulo')::date
                 THEN trim(to_char(NEW.hora,'HH24:MI'))
                 ELSE to_char(NEW.data,'DD/MM') || ' ' || trim(to_char(NEW.hora,'HH24:MI')) END;
  v_body := COALESCE(v_servico, 'Atendimento') || ' • ' || v_when;

  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='push_trigger_secret' LIMIT 1;
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-trigger-secret',COALESCE(v_secret,'')),
    body := jsonb_build_object('barber_id',NEW.barbeiro_id,'title',v_title,'body',v_body,
      'data',jsonb_build_object('event',v_event,'appointment_id',NEW.id::text,'url','/barbeiro')),
    timeout_milliseconds := 5000);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_barber_appointment falhou: %', SQLERRM;
  RETURN NEW;
END;
$function$;