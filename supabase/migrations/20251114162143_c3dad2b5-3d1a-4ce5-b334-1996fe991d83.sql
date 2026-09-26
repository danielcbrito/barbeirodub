-- Add 'excluido' status to appointment_status enum
ALTER TYPE appointment_status ADD VALUE IF NOT EXISTS 'excluido';

-- Create logs table for appointment audit trail
CREATE TABLE IF NOT EXISTS public.logs_agendamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id UUID REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  usuario_id UUID,
  acao VARCHAR(50) NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  detalhes TEXT
);

-- Enable RLS on logs table
ALTER TABLE public.logs_agendamentos ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can view all logs
CREATE POLICY "Admins can view all logs"
ON public.logs_agendamentos
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Policy: Admins can insert logs
CREATE POLICY "Admins can insert logs"
ON public.logs_agendamentos
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger to log appointment changes
CREATE OR REPLACE FUNCTION public.log_appointment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Log status changes
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.logs_agendamentos (agendamento_id, usuario_id, acao, detalhes)
      VALUES (NEW.id, auth.uid(), 'status_change', 
              'Status alterado de ' || OLD.status || ' para ' || NEW.status);
    END IF;
    
    -- Log confirmations
    IF OLD.barbeiro_confirmou = FALSE AND NEW.barbeiro_confirmou = TRUE THEN
      INSERT INTO public.logs_agendamentos (agendamento_id, usuario_id, acao, detalhes)
      VALUES (NEW.id, auth.uid(), 'barbeiro_confirmou', 'Barbeiro confirmou o atendimento');
    END IF;
    
    IF OLD.cliente_confirmou = FALSE AND NEW.cliente_confirmou = TRUE THEN
      INSERT INTO public.logs_agendamentos (agendamento_id, usuario_id, acao, detalhes)
      VALUES (NEW.id, auth.uid(), 'cliente_confirmou', 'Cliente confirmou o atendimento');
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Attach trigger to agendamentos table
DROP TRIGGER IF EXISTS log_appointment_changes ON public.agendamentos;
CREATE TRIGGER log_appointment_changes
AFTER UPDATE ON public.agendamentos
FOR EACH ROW
EXECUTE FUNCTION public.log_appointment_change();