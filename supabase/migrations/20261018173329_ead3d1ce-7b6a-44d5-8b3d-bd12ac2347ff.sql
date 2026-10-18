ALTER TABLE public.woovi_charges ADD COLUMN IF NOT EXISTS assinatura_id uuid REFERENCES public.assinaturas(id), ADD COLUMN IF NOT EXISTS pending_booking_id uuid REFERENCES public.pending_bookings(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS pedido_id uuid REFERENCES public.pedidos(id), ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS pagamentos_woovi_gateway_unique ON public.pagamentos(gateway_payment_id) WHERE gateway_payment_id LIKE 'woovi:%';
ALTER TABLE public.pedidos ALTER COLUMN payment_provider SET DEFAULT 'woovi';
ALTER TABLE public.wallet_deposits ALTER COLUMN provider SET DEFAULT 'woovi';
CREATE OR REPLACE FUNCTION public.confirm_woovi_payment(p_correlation_id text, p_value_centavos integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w public.woovi_charges%ROWTYPE; pb public.pending_bookings%ROWTYPE; sub public.assinaturas%ROWTYPE; ap uuid; release_at timestamptz; today_sp date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
 SELECT * INTO w FROM public.woovi_charges WHERE correlation_id=p_correlation_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'UNKNOWN_CHARGE'; END IF;
 IF w.value_centavos IS DISTINCT FROM p_value_centavos OR p_value_centavos<=0 THEN RAISE EXCEPTION 'VALUE_MISMATCH'; END IF;
 IF w.status IN ('REFUNDED','refunded') THEN RAISE EXCEPTION 'CHARGE_REFUNDED'; END IF;
 IF w.status='COMPLETED' AND w.paid_at IS NOT NULL THEN RETURN jsonb_build_object('success',true,'duplicate',true); END IF;
 ap:=w.agendamento_id;
 IF w.pending_booking_id IS NOT NULL THEN
   SELECT * INTO pb FROM public.pending_bookings WHERE id=w.pending_booking_id FOR UPDATE;
   IF NOT FOUND OR pb.expires_at<now() THEN RAISE EXCEPTION 'BOOKING_EXPIRED_RECONCILIATION_REQUIRED'; END IF;
   IF pb.user_id IS DISTINCT FROM w.user_id OR pb.barbeiro_id IS DISTINCT FROM w.barbeiro_id THEN RAISE EXCEPTION 'BOOKING_OWNER_MISMATCH'; END IF;
   IF nullif(w.metadata->>'reschedule_from_id','') IS NOT NULL THEN
     UPDATE public.agendamentos SET status='cancelled_by_user',visivel_para_usuario=false WHERE id=(w.metadata->>'reschedule_from_id')::uuid AND user_id=w.user_id;
     IF NOT FOUND THEN RAISE EXCEPTION 'RESCHEDULE_NOT_OWNED'; END IF;
   END IF;
   INSERT INTO public.agendamentos(user_id,servico_id,barbeiro_id,data,hora,duracao,preco,observacoes,status,payment_method,barbeiro_confirmou,cliente_confirmou,remarcado_de)
   VALUES(pb.user_id,pb.servico_id,pb.barbeiro_id,pb.data,pb.hora,pb.duracao,pb.preco,pb.observacoes,'confirmed','pix',true,true,nullif(w.metadata->>'reschedule_from_id','')::uuid) RETURNING id INTO ap;
   UPDATE public.woovi_charges SET agendamento_id=ap WHERE id=w.id;
   DELETE FROM public.pending_bookings WHERE id=pb.id;
 ELSIF ap IS NOT NULL THEN
   UPDATE public.agendamentos SET status='confirmed',cliente_confirmou=true,barbeiro_confirmou=true WHERE id=ap AND user_id=w.user_id AND status='pending';
 ELSIF w.assinatura_id IS NOT NULL THEN
   SELECT * INTO sub FROM public.assinaturas WHERE id=w.assinatura_id FOR UPDATE;
   IF NOT FOUND OR sub.user_id IS DISTINCT FROM w.user_id OR sub.barbeiro_id IS DISTINCT FROM w.barbeiro_id THEN RAISE EXCEPTION 'SUBSCRIPTION_OWNER_MISMATCH'; END IF;
   IF sub.status='cancelled' THEN RAISE EXCEPTION 'SUBSCRIPTION_CANCELLED_RECONCILIATION_REQUIRED'; END IF;
   IF EXISTS(SELECT 1 FROM public.agendamentos WHERE user_id=w.user_id AND barbeiro_id=w.barbeiro_id AND status='completed') THEN release_at:=now(); END IF;
   UPDATE public.assinaturas SET status='active',payment_method='pix',ciclo_inicio=today_sp,ciclo_fim=today_sp+30,next_billing_date=today_sp+30,updated_at=now() WHERE id=sub.id;
 ELSIF w.pedido_id IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public.pedidos WHERE id=w.pedido_id AND user_id=w.user_id AND payment_provider='woovi') THEN RAISE EXCEPTION 'ORDER_OWNER_MISMATCH'; END IF;
   PERFORM public.store_finalize_paid_order(w.pedido_id);
   release_at:=now();
 ELSE RAISE EXCEPTION 'CHARGE_TARGET_MISSING'; END IF;
 IF ap IS NOT NULL OR w.assinatura_id IS NOT NULL THEN
   INSERT INTO public.pagamentos(user_id,agendamento_id,assinatura_id,metodo,valor,status,gateway_payment_id,data_pagamento) VALUES(w.user_id,ap,w.assinatura_id,'pix',w.value_centavos/100.0,'paid','woovi:'||w.correlation_id,now());
 END IF;
 UPDATE public.woovi_charges SET status='COMPLETED',paid_at=COALESCE(paid_at,now()),released_at=COALESCE(released_at,release_at),updated_at=now() WHERE id=w.id;
 RETURN jsonb_build_object('success',true,'agendamento_id',ap,'assinatura_id',w.assinatura_id,'pedido_id',w.pedido_id);
END $$;
REVOKE ALL ON FUNCTION public.confirm_woovi_payment(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_woovi_payment(text,integer) TO service_role;
CREATE OR REPLACE FUNCTION public.release_woovi_plan_after_first_cut() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.status='completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
   UPDATE public.woovi_charges SET released_at=now(),updated_at=now() WHERE assinatura_id IS NOT NULL AND user_id=NEW.user_id AND barbeiro_id=NEW.barbeiro_id AND status IN ('PAID','paid','COMPLETED','ACTIVE_PAID') AND released_at IS NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER release_woovi_plan_after_first_cut AFTER UPDATE OF status ON public.agendamentos FOR EACH ROW EXECUTE FUNCTION public.release_woovi_plan_after_first_cut();
DO $cleanup$
DECLARE def text;
BEGIN
 SELECT pg_get_functiondef('public.get_barber_boot_bundle()'::regprocedure) INTO def;
 def:=replace(def,'    b.asaas_account_id,'||chr(10),'');
 def:=replace(def,'    endereco_estado,'||chr(10)||'    asaas_api_key','    endereco_estado');
 def:=replace(def,'    v_priv_estado,'||chr(10)||'    v_priv_asaas','    v_priv_estado');
 def:=replace(def,'    OR v_barber.asaas_account_id IS NOT NULL'||chr(10),'');
 def:=replace(def,'    OR v_priv_asaas IS NOT NULL'||chr(10),'');
 def:=replace(def,'  v_priv_asaas text := NULL;'||chr(10),'');
 EXECUTE def;
 SELECT pg_get_functiondef('public.store_create_order_with_reservations(uuid,jsonb,integer,text)'::regprocedure) INTO def;
 EXECUTE replace(def,'''asaas''','''woovi''');
 SELECT pg_get_functiondef('public.get_tenant_pedidos_admin(uuid)'::regprocedure) INTO def;
 EXECUTE replace(def,'''asaas_payment_id'', p.asaas_payment_id','''payment_id'', p.payment_id');
END $cleanup$;