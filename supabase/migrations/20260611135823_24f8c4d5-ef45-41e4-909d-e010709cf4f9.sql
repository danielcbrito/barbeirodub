-- 1. Atualizar a função do trigger para ser mais robusta e lidar com UPDATE
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
   -- Apenas processa se o método ou tipo for plano/silencioso
   -- Se for um UPDATE, verifica se mudou para plano ou se já era plano
   IF COALESCE(NEW.payment_method, '') <> 'plano' AND COALESCE(NEW.tipo_agendamento, '') NOT IN ('plano', 'assinatura_silenciosa') THEN
     RETURN NEW;
   END IF;
 
   -- Se for UPDATE e não mudou nada relevante para o plano, podemos sair cedo
   -- Mas para garantir consistência, vamos prosseguir com o ON CONFLICT DO NOTHING
 
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
     -- Se for silencioso (conversão), não barramos, apenas ignoramos o registro de uso
     -- Isso evita erros durante a ativação do plano se algo falhar na busca da assinatura recém-criada
     IF NEW.tipo_agendamento = 'assinatura_silenciosa' THEN
       RETURN NEW;
     END IF;
     RETURN NEW; -- Silencia o erro para evitar quebrar o agendamento
   END IF;
 
   -- Para pending_cash, limite é 1 (apenas o primeiro corte)
   IF v_sub_status = 'pending_cash' THEN
     v_limite := 1;
   END IF;
 
   -- Janela do ciclo atual
   IF v_next_billing IS NOT NULL THEN
     v_cycle_start := (v_next_billing - INTERVAL '1 month')::date;
     v_cycle_end := v_next_billing;
   ELSE
     v_cycle_start := '-infinity'::date;
     v_cycle_end := 'infinity'::date;
   END IF;
 
   -- Verifica se já existe um uso para este agendamento para evitar dupla contagem
   IF EXISTS (SELECT 1 FROM public.plano_agendamentos_usos WHERE agendamento_id = NEW.id) THEN
     RETURN NEW;
   END IF;
 
   -- Contagem de usos no ciclo
   v_usados := public.count_subscription_uses_in_cycle(
     v_assinatura_id,
     v_cycle_start,
     v_cycle_end
   );
 
   -- Se atingiu o limite, não registra o uso (o agendamento continua, mas não consome crédito do plano se já estourou)
   -- No futuro poderíamos barrar o agendamento aqui, mas por agora vamos ser permissivos
   IF v_usados >= v_limite THEN
     RETURN NEW;
   END IF;
 
   -- Registra o consumo vinculado à assinatura atual
   -- O ON CONFLICT garante que nunca teremos erro de duplicidade mesmo em race conditions
   INSERT INTO public.plano_agendamentos_usos (user_id, assinatura_id, agendamento_id, competencia)
   VALUES (NEW.user_id, v_assinatura_id, NEW.id, v_competencia)
   ON CONFLICT (agendamento_id) DO NOTHING;
 
   RETURN NEW;
 END;
 $function$;
 
 -- 2. Re-recriar o trigger para agir em INSERT e UPDATE
 DROP TRIGGER IF EXISTS trg_consume_plan_use_on_appointment_insert ON public.agendamentos;
 CREATE TRIGGER trg_consume_plan_use_on_appointment_insert 
 AFTER INSERT OR UPDATE OF status, tipo_agendamento, payment_method ON public.agendamentos 
 FOR EACH ROW EXECUTE FUNCTION consume_plan_use_on_appointment_insert();