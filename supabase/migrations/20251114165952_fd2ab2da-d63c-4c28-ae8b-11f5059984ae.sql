-- Drop existing policy first if needed, then recreate
DROP POLICY IF EXISTS "Users can update own appointments" ON public.agendamentos;

CREATE POLICY "Users can update own appointments"
ON public.agendamentos
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Ensure realtime sends full rows for updates
ALTER TABLE public.agendamentos REPLICA IDENTITY FULL;
ALTER TABLE public.planos REPLICA IDENTITY FULL;

-- Attach triggers for automatic fields and logging
DROP TRIGGER IF EXISTS trg_agendamentos_set_cancelado_em ON public.agendamentos;
CREATE TRIGGER trg_agendamentos_set_cancelado_em
BEFORE UPDATE ON public.agendamentos
FOR EACH ROW
EXECUTE FUNCTION public.set_cancelado_em();

DROP TRIGGER IF EXISTS trg_agendamentos_update_updated_at ON public.agendamentos;
CREATE TRIGGER trg_agendamentos_update_updated_at
BEFORE UPDATE ON public.agendamentos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_agendamentos_log_changes ON public.agendamentos;
CREATE TRIGGER trg_agendamentos_log_changes
AFTER UPDATE ON public.agendamentos
FOR EACH ROW
EXECUTE FUNCTION public.log_appointment_change();