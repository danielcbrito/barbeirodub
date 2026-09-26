-- Adicionar colunas para identificar encaixes manuais
ALTER TABLE agendamentos 
ADD COLUMN IF NOT EXISTS tipo_agendamento TEXT DEFAULT 'normal' CHECK (tipo_agendamento IN ('normal', 'encaixe_manual'));

ALTER TABLE agendamentos 
ADD COLUMN IF NOT EXISTS criado_por TEXT DEFAULT 'cliente' CHECK (criado_por IN ('cliente', 'barbeiro'));

-- Comentários
COMMENT ON COLUMN agendamentos.tipo_agendamento IS 'Tipo do agendamento: normal (via app) ou encaixe_manual (pelo barbeiro)';
COMMENT ON COLUMN agendamentos.criado_por IS 'Quem criou o agendamento: cliente ou barbeiro';