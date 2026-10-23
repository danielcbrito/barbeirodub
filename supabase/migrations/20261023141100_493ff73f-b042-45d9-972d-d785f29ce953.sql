DROP TRIGGER IF EXISTS trg_notify_barber_appointment ON public.agendamentos;
CREATE TRIGGER trg_notify_barber_appointment
AFTER INSERT OR UPDATE ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.notify_barber_appointment();