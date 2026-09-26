-- Add per-tenant configurable slot interval for booking display
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS slot_interval_minutes integer NOT NULL DEFAULT 5;

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_slot_interval_minutes_check;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_slot_interval_minutes_check
  CHECK (slot_interval_minutes BETWEEN 1 AND 120);

COMMENT ON COLUMN public.tenants.slot_interval_minutes IS
  'Intervalo (em minutos) usado para gerar os horários disponíveis exibidos aos clientes na tela de agendamento. Configurável por barbearia.';