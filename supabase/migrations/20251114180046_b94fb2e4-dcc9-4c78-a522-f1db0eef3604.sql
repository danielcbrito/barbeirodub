-- Ensure realtime publication includes required tables
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.planos;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.agendamentos;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Keep full row data for updates
ALTER TABLE public.planos REPLICA IDENTITY FULL;
ALTER TABLE public.agendamentos REPLICA IDENTITY FULL;

-- Trigger: update updated_at on planos
DROP TRIGGER IF EXISTS trg_planos_update_updated_at ON public.planos;
CREATE TRIGGER trg_planos_update_updated_at
BEFORE UPDATE ON public.planos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
