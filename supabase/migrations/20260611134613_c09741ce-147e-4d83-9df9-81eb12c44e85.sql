CREATE OR REPLACE FUNCTION public.trg_notify_new_appointment_whatsapp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_msg text;
  v_nome_cli text;
BEGIN
  BEGIN
    -- Se for INSERT e ainda não estiver confirmado
    -- SILENCIAR se for do tipo 'assinatura_silenciosa' (usado na conversão de plano pelo barbeiro)
    IF TG_OP = 'INSERT' AND COALESCE(NEW.barbeiro_confirmou, false) = false AND COALESCE(NEW.tipo_agendamento, '') <> 'assinatura_silenciosa' THEN
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