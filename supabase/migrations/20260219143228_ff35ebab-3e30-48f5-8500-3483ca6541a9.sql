-- Adiciona coluna de público-alvo do aviso prévio
-- Valores: 'cliente', 'barbeiro', 'ambos'
ALTER TABLE public.webhook_config
  ADD COLUMN IF NOT EXISTS manutencao_aviso_publico TEXT NOT NULL DEFAULT 'ambos'
    CHECK (manutencao_aviso_publico IN ('cliente', 'barbeiro', 'ambos'));

COMMENT ON COLUMN public.webhook_config.manutencao_aviso_publico
  IS 'Público-alvo do banner de aviso prévio: cliente | barbeiro | ambos';