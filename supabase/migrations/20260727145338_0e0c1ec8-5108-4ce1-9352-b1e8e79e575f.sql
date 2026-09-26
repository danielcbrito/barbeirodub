
-- 1) New trigger function: eager refresh instead of mark stale
CREATE OR REPLACE FUNCTION public.refresh_barber_home_snapshot_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_barber uuid;
BEGIN
  v_barber := COALESCE(NEW.barbeiro_id, OLD.barbeiro_id);
  IF v_barber IS NOT NULL THEN
    BEGIN
      PERFORM public.refresh_barber_home_snapshot(v_barber);
    EXCEPTION WHEN OTHERS THEN
      -- Fallback: mark stale so cron reheat picks it up; never break the write
      UPDATE public.barber_home_snapshot SET is_stale = true WHERE barbeiro_id = v_barber;
    END;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 2) Swap existing triggers to use the eager function
DROP TRIGGER IF EXISTS trg_bhs_stale_agendamentos ON public.agendamentos;
DROP TRIGGER IF EXISTS trg_bhs_stale_assinaturas ON public.assinaturas;
DROP TRIGGER IF EXISTS trg_bhs_stale_pagamentos_plano ON public.pagamentos_plano_barbearia;
DROP TRIGGER IF EXISTS trg_bhs_stale_payments ON public.payments;

CREATE TRIGGER trg_bhs_refresh_agendamentos
AFTER INSERT OR UPDATE OR DELETE ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.refresh_barber_home_snapshot_trg();

CREATE TRIGGER trg_bhs_refresh_assinaturas
AFTER INSERT OR UPDATE OR DELETE ON public.assinaturas
FOR EACH ROW EXECUTE FUNCTION public.refresh_barber_home_snapshot_trg();

CREATE TRIGGER trg_bhs_refresh_pagamentos_plano
AFTER INSERT OR UPDATE OR DELETE ON public.pagamentos_plano_barbearia
FOR EACH ROW EXECUTE FUNCTION public.refresh_barber_home_snapshot_trg();

CREATE TRIGGER trg_bhs_refresh_payments
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.refresh_barber_home_snapshot_trg();

-- 3) Refresh all current snapshots so they are no longer stale right now
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.barbeiros WHERE ativo = true AND deleted_at IS NULL LOOP
    BEGIN
      PERFORM public.refresh_barber_home_snapshot(r.id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

-- 4) Safety-net cron: every minute, refresh any snapshot still marked stale
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'reheat-stale-barber-snapshots';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
  PERFORM cron.schedule(
    'reheat-stale-barber-snapshots',
    '* * * * *',
    $CRON$
    DO $inner$
    DECLARE r record;
    BEGIN
      FOR r IN SELECT barbeiro_id FROM public.barber_home_snapshot WHERE is_stale = true LIMIT 200 LOOP
        BEGIN
          PERFORM public.refresh_barber_home_snapshot(r.barbeiro_id);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END LOOP;
    END $inner$;
    $CRON$
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
