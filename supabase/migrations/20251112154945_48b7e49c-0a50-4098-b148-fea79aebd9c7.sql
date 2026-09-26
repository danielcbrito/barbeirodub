-- Add confirmation fields to agendamentos table
ALTER TABLE agendamentos
ADD COLUMN IF NOT EXISTS cliente_confirmou BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS barbeiro_confirmou BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ponto_liberado BOOLEAN DEFAULT FALSE;

-- Create index for better performance on confirmation queries
CREATE INDEX IF NOT EXISTS idx_agendamentos_confirmations 
ON agendamentos(cliente_confirmou, barbeiro_confirmou, status);

-- Update existing completed appointments to have both confirmations
UPDATE agendamentos 
SET cliente_confirmou = TRUE, 
    barbeiro_confirmou = TRUE,
    ponto_liberado = TRUE
WHERE status = 'completed';