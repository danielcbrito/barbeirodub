-- Criar tabela de auditoria para rastrear todas as mudanças críticas
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- RLS policies
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem ver todos os logs"
  ON public.audit_logs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Sistema pode inserir logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (true);

-- Função para registrar mudanças em agendamentos
CREATE OR REPLACE FUNCTION public.audit_appointment_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (
      user_id,
      action,
      entity_type,
      entity_id,
      old_values,
      new_values
    ) VALUES (
      COALESCE(auth.uid(), OLD.user_id),
      'appointment_update',
      'agendamentos',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW)
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (
      user_id,
      action,
      entity_type,
      entity_id,
      old_values
    ) VALUES (
      COALESCE(auth.uid(), OLD.user_id),
      'appointment_delete',
      'agendamentos',
      OLD.id,
      to_jsonb(OLD)
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger para auditoria automática
DROP TRIGGER IF EXISTS audit_agendamentos_changes ON public.agendamentos;
CREATE TRIGGER audit_agendamentos_changes
  AFTER UPDATE OR DELETE ON public.agendamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_appointment_changes();

-- Adicionar campo para identificar remarcações legítimas
ALTER TABLE public.agendamentos 
ADD COLUMN IF NOT EXISTS remarcado_de UUID REFERENCES public.agendamentos(id);

COMMENT ON COLUMN public.agendamentos.remarcado_de IS 'ID do agendamento original quando este é uma remarcação';
