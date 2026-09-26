-- Criar tabela de tokens de confirmação de email
CREATE TABLE IF NOT EXISTS public.email_confirmation_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  used_at TIMESTAMP WITH TIME ZONE
);

-- Index para buscar tokens rapidamente
CREATE INDEX IF NOT EXISTS idx_email_confirmation_tokens_token ON public.email_confirmation_tokens(token);
CREATE INDEX IF NOT EXISTS idx_email_confirmation_tokens_user_id ON public.email_confirmation_tokens(user_id);

-- RLS para tokens
ALTER TABLE public.email_confirmation_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tokens"
ON public.email_confirmation_tokens
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Anyone can insert tokens"
ON public.email_confirmation_tokens
FOR INSERT
WITH CHECK (true);

-- Criar tabela de health checks para monitoramento
CREATE TABLE IF NOT EXISTS public.system_health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'down')),
  last_check_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  error_message TEXT,
  response_time_ms INTEGER,
  metadata JSONB
);

-- RLS para health checks (apenas admins)
ALTER TABLE public.system_health_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage health checks"
ON public.system_health_checks
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Criar tabela de logs do sistema para o painel DEV
CREATE TABLE IF NOT EXISTS public.system_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error', 'critical')),
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  details JSONB,
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Index para buscar logs
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON public.system_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON public.system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_category ON public.system_logs(category);

-- RLS para logs (apenas admins podem ver)
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all logs"
ON public.system_logs
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert logs"
ON public.system_logs
FOR INSERT
WITH CHECK (true);

-- Adicionar campos para promoções geradas por IA
ALTER TABLE public.promocoes ADD COLUMN IF NOT EXISTS gerada_por_ia BOOLEAN DEFAULT FALSE;
ALTER TABLE public.promocoes ADD COLUMN IF NOT EXISTS prompt_ia TEXT;
ALTER TABLE public.promocoes ADD COLUMN IF NOT EXISTS data_inicio DATE;
ALTER TABLE public.promocoes ADD COLUMN IF NOT EXISTS data_fim DATE;
ALTER TABLE public.promocoes ADD COLUMN IF NOT EXISTS imagem_url TEXT;
ALTER TABLE public.promocoes ADD COLUMN IF NOT EXISTS regras_json JSONB;
ALTER TABLE public.promocoes ADD COLUMN IF NOT EXISTS aprovada_por UUID;
ALTER TABLE public.promocoes ADD COLUMN IF NOT EXISTS aprovada_em TIMESTAMP WITH TIME ZONE;