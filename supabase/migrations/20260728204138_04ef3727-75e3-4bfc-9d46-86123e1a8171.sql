ALTER TABLE public.configuracoes_horario_barbeiro
ADD COLUMN IF NOT EXISTS slot_interval_minutes int
CHECK (slot_interval_minutes IN (5, 10, 15, 20, 30));