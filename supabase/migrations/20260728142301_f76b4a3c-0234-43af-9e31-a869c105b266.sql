CREATE OR REPLACE FUNCTION public.create_barber_home_snapshot_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  BEGIN
    PERFORM public.refresh_barber_home_snapshot(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bhs_create_on_barbeiro_insert ON public.barbeiros;
CREATE TRIGGER trg_bhs_create_on_barbeiro_insert
AFTER INSERT ON public.barbeiros
FOR EACH ROW EXECUTE FUNCTION public.create_barber_home_snapshot_on_insert();

-- Rede de segurança: cron marca como stale qualquer barbeiro sem snapshot e cria o registro
SELECT cron.schedule(
  'ensure-barber-home-snapshots',
  '*/15 * * * *',
  $cron$
    DO $inner$
    DECLARE r record;
    BEGIN
      FOR r IN
        SELECT b.id FROM public.barbeiros b
        WHERE NOT EXISTS (SELECT 1 FROM public.barber_home_snapshot s WHERE s.barbeiro_id = b.id)
        LIMIT 200
      LOOP
        BEGIN
          PERFORM public.refresh_barber_home_snapshot(r.id);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END LOOP;
    END $inner$;
  $cron$
);