CREATE OR REPLACE FUNCTION public.sync_woovi_charge_on_agendamento_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paid_statuses text[] := ARRAY['PAID', 'paid', 'COMPLETED', 'ACTIVE_PAID'];
BEGIN
  IF NEW.status = 'completed'
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.woovi_charges
       SET released_at = COALESCE(released_at, now()),
           updated_at = now()
     WHERE released_at IS NULL
       AND status = ANY(v_paid_statuses)
       AND (
         agendamento_id = NEW.id
         OR correlation_id IN ('ag-' || NEW.id::text, 'book-' || NEW.id::text, NEW.id::text)
       );

  ELSIF NEW.status IN ('cancelled_by_user', 'cancelled_by_admin', 'excluido')
        AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.woovi_charges
       SET status = 'REFUNDED',
           refunded_at = COALESCE(refunded_at, NEW.cancelado_em, now()),
           updated_at = now()
     WHERE released_at IS NULL
       AND status = ANY(v_paid_statuses)
       AND (
         agendamento_id = NEW.id
         OR correlation_id IN ('ag-' || NEW.id::text, 'book-' || NEW.id::text, NEW.id::text)
       );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_woovi_charge_on_agendamento_status ON public.agendamentos;
CREATE TRIGGER trg_sync_woovi_charge_on_agendamento_status
  AFTER UPDATE OF status ON public.agendamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_woovi_charge_on_agendamento_status();

CREATE OR REPLACE FUNCTION public.sync_woovi_charge_on_pending_booking_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.woovi_charges
     SET status = 'REFUNDED',
         refunded_at = COALESCE(refunded_at, now()),
         updated_at = now()
   WHERE released_at IS NULL
     AND status IN ('PAID', 'paid', 'COMPLETED', 'ACTIVE_PAID')
     AND (
       correlation_id = 'book-' || OLD.id::text
       OR correlation_id = OLD.id::text
     );

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_woovi_charge_on_pending_booking_delete ON public.pending_bookings;
CREATE TRIGGER trg_sync_woovi_charge_on_pending_booking_delete
  BEFORE DELETE ON public.pending_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_woovi_charge_on_pending_booking_delete();

CREATE OR REPLACE FUNCTION public.woovi_blocked_centavos(p_barbeiro uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(wc.value_centavos), 0)::bigint
  FROM public.woovi_charges wc
  LEFT JOIN public.agendamentos a
    ON a.id = wc.agendamento_id
    OR wc.correlation_id IN ('ag-' || a.id::text, 'book-' || a.id::text, a.id::text)
  LEFT JOIN public.pending_bookings pb
    ON wc.correlation_id IN ('book-' || pb.id::text, pb.id::text)
  WHERE wc.barbeiro_id = p_barbeiro
    AND wc.status IN ('PAID', 'paid', 'COMPLETED', 'ACTIVE_PAID')
    AND wc.released_at IS NULL
    AND (a.id IS NULL OR a.status NOT IN ('cancelled_by_user', 'cancelled_by_admin', 'excluido'))
    AND (
      wc.correlation_id NOT LIKE 'book-%'
      OR pb.id IS NOT NULL
      OR a.id IS NOT NULL
    );
$$;

GRANT EXECUTE ON FUNCTION public.sync_woovi_charge_on_agendamento_status() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_woovi_charge_on_pending_booking_delete() TO service_role;
GRANT EXECUTE ON FUNCTION public.woovi_blocked_centavos(uuid) TO authenticated, service_role;