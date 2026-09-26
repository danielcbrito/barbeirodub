
ALTER TABLE public.woovi_charges ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

CREATE OR REPLACE FUNCTION public.woovi_blocked_centavos(p_barbeiro uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(value_centavos), 0)::bigint
  FROM public.woovi_charges
  WHERE barbeiro_id = p_barbeiro
    AND released_at IS NULL
    AND status IN ('PAID', 'REFUNDED');
$$;

GRANT EXECUTE ON FUNCTION public.woovi_blocked_centavos(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.woovi_sync_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    UPDATE public.woovi_charges
       SET released_at = now()
     WHERE agendamento_id = NEW.id
       AND released_at IS NULL
       AND status = 'PAID';
  ELSIF NEW.status IN ('cancelled_by_user', 'cancelled', 'cancelado')
        AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE public.woovi_charges
       SET status = 'REFUNDED',
           refunded_at = now()
     WHERE agendamento_id = NEW.id
       AND released_at IS NULL
       AND status = 'PAID';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_woovi_sync_release ON public.agendamentos;
CREATE TRIGGER trg_woovi_sync_release
  AFTER UPDATE OF status ON public.agendamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.woovi_sync_release();
