-- Add visivel_para_usuario field to agendamentos
ALTER TABLE public.agendamentos 
ADD COLUMN IF NOT EXISTS visivel_para_usuario BOOLEAN DEFAULT true;

-- Add cancelado_em field to track cancellation timestamp
ALTER TABLE public.agendamentos 
ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMP WITH TIME ZONE;

-- Update existing 'excluido' appointments to 'cancelado' with visivel_para_usuario = false
UPDATE public.agendamentos 
SET status = 'cancelled_by_user', visivel_para_usuario = false
WHERE status = 'excluido';

-- Create function to auto-hide cancelled appointments after 7 days
CREATE OR REPLACE FUNCTION public.auto_hide_old_cancelled_appointments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.agendamentos
  SET visivel_para_usuario = false
  WHERE status IN ('cancelled_by_user', 'cancelled_by_admin')
    AND cancelado_em IS NOT NULL
    AND cancelado_em < NOW() - INTERVAL '7 days'
    AND visivel_para_usuario = true;
END;
$$;

-- Create trigger to set cancelado_em when status changes to cancelled
CREATE OR REPLACE FUNCTION public.set_cancelado_em()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('cancelled_by_user', 'cancelled_by_admin') 
     AND OLD.status NOT IN ('cancelled_by_user', 'cancelled_by_admin') THEN
    NEW.cancelado_em = NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_cancelado_em_trigger ON public.agendamentos;
CREATE TRIGGER set_cancelado_em_trigger
BEFORE UPDATE ON public.agendamentos
FOR EACH ROW
EXECUTE FUNCTION public.set_cancelado_em();

-- Enable realtime for agendamentos table
ALTER TABLE public.agendamentos REPLICA IDENTITY FULL;

-- Enable realtime for planos table
ALTER TABLE public.planos REPLICA IDENTITY FULL;