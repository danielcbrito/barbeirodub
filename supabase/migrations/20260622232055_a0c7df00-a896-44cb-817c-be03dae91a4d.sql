CREATE OR REPLACE FUNCTION public.sync_woovi_charge_on_agendamento_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed'
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.woovi_charges
       SET released_at = COALESCE(released_at, now()),
           updated_at = now()
     WHERE agendamento_id = NEW.id
       AND released_at IS NULL
       AND status IN ('PAID', 'paid', 'COMPLETED', 'ACTIVE_PAID');

  ELSIF NEW.status IN ('cancelled_by_user', 'cancelled_by_admin')
        AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.woovi_charges
       SET status = 'REFUNDED',
           refunded_at = COALESCE(refunded_at, NEW.cancelado_em, now()),
           updated_at = now()
     WHERE agendamento_id = NEW.id
       AND released_at IS NULL
       AND status IN ('PAID', 'paid', 'COMPLETED', 'ACTIVE_PAID');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_woovi_charge_on_agendamento_status ON public.agendamentos;
CREATE TRIGGER trg_sync_woovi_charge_on_agendamento_status
  AFTER UPDATE OF status ON public.agendamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_woovi_charge_on_agendamento_status();

CREATE OR REPLACE FUNCTION public.woovi_blocked_centavos(p_barbeiro uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(wc.value_centavos), 0)::bigint
  FROM public.woovi_charges wc
  LEFT JOIN public.agendamentos a ON a.id = wc.agendamento_id
  WHERE wc.barbeiro_id = p_barbeiro
    AND wc.status IN ('PAID', 'paid', 'COMPLETED', 'ACTIVE_PAID')
    AND wc.released_at IS NULL
    AND (
      wc.agendamento_id IS NULL
      OR a.status NOT IN ('cancelled_by_user', 'cancelled_by_admin')
    );
$$;

UPDATE public.woovi_charges wc
   SET status = 'REFUNDED',
       refunded_at = COALESCE(wc.refunded_at, a.cancelado_em, now()),
       updated_at = now()
  FROM public.agendamentos a
 WHERE a.id = wc.agendamento_id
   AND a.status IN ('cancelled_by_user', 'cancelled_by_admin')
   AND wc.released_at IS NULL
   AND wc.status IN ('PAID', 'paid', 'COMPLETED', 'ACTIVE_PAID');