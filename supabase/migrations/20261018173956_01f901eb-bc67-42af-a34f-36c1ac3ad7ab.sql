CREATE OR REPLACE FUNCTION public.sync_woovi_charge_on_pending_booking_delete() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
UPDATE public.woovi_charges SET status='REFUNDED',refunded_at=COALESCE(refunded_at,now()),updated_at=now() WHERE released_at IS NULL AND agendamento_id IS NULL AND status IN ('PAID','paid','COMPLETED','ACTIVE_PAID') AND (correlation_id='book-'||OLD.id::text OR correlation_id=OLD.id::text); RETURN OLD; END $$;
REVOKE ALL ON FUNCTION public.sync_woovi_charge_on_pending_booking_delete() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_woovi_charge_on_pending_booking_delete() TO service_role;
DO $$ DECLARE def text; BEGIN
SELECT pg_get_functiondef('public.confirm_woovi_payment(text,integer)'::regprocedure) INTO def;
def:=replace(def,'IF pb.user_id IS DISTINCT FROM w.user_id OR pb.barbeiro_id IS DISTINCT FROM w.barbeiro_id THEN','IF round(pb.preco*100)::integer IS DISTINCT FROM w.value_centavos THEN RAISE EXCEPTION ''BOOKING_VALUE_MISMATCH''; END IF;'||chr(10)||'   IF pb.user_id IS DISTINCT FROM w.user_id OR pb.barbeiro_id IS DISTINCT FROM w.barbeiro_id THEN');
def:=replace(def,'UPDATE public.woovi_charges SET agendamento_id=ap WHERE id=w.id;','UPDATE public.woovi_charges SET agendamento_id=ap,status=''COMPLETED'',paid_at=now() WHERE id=w.id;');
def:=replace(def,'UPDATE public.assinaturas SET status=''active'',payment_method=''pix'',ciclo_inicio=today_sp,ciclo_fim=today_sp+30,next_billing_date=today_sp+30,updated_at=now() WHERE id=sub.id;','UPDATE public.assinaturas SET status=''active'',payment_method=''pix'',ciclo_inicio=today_sp,ciclo_fim=today_sp+30,next_billing_date=today_sp+30,usos_ciclo_atual=0,total_renovacoes=CASE WHEN sub.status=''pending_renewal'' THEN sub.total_renovacoes WHEN w.correlation_id LIKE ''due-%'' OR w.correlation_id LIKE ''renewal-%'' THEN COALESCE(sub.total_renovacoes,0)+1 ELSE COALESCE(sub.total_renovacoes,0) END,updated_at=now() WHERE id=sub.id;');
def:=replace(def,'AND payment_provider=''woovi'') THEN','AND payment_provider=''woovi'' AND round(COALESCE(valor_total,total)*100)::integer=w.value_centavos AND status=''pending_payment'' AND (reservation_expires_at IS NULL OR reservation_expires_at>now())) THEN');
EXECUTE def;
END $$;
REVOKE ALL ON FUNCTION public.confirm_woovi_payment(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_woovi_payment(text,integer) TO service_role;