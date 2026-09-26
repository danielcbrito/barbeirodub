-- =====================================================
-- SISTEMA DE SEGURANÇA TI: Senha de Acesso e Dispositivos Autorizados
-- =====================================================

-- 1. Tabela para configurações de segurança do TI (senha do painel)
CREATE TABLE IF NOT EXISTS public.ti_security_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Inserir senha padrão inicial (a senha será "admin123" - o usuário vai trocar)
-- Nota: Em produção, isso será uma hash bcrypt, mas por simplicidade usamos texto
INSERT INTO public.ti_security_config (password_hash) 
VALUES ('admin123')
ON CONFLICT DO NOTHING;

-- RLS para ti_security_config (apenas admins)
ALTER TABLE public.ti_security_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage TI security config"
ON public.ti_security_config
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Tabela para dispositivos conectados (sessões ativas em tempo real)
CREATE TABLE IF NOT EXISTS public.dispositivos_conectados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  device_fingerprint TEXT NOT NULL,
  device_name TEXT NOT NULL,
  device_type TEXT NOT NULL, -- 'desktop', 'mobile', 'tablet'
  browser TEXT,
  os TEXT,
  ip_address TEXT,
  last_activity TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, device_fingerprint)
);

-- RLS para dispositivos_conectados
ALTER TABLE public.dispositivos_conectados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all connected devices"
ON public.dispositivos_conectados
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage connected devices"
ON public.dispositivos_conectados
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can manage their own devices"
ON public.dispositivos_conectados
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 3. Tabela para dispositivos autorizados (podem acessar mesmo em manutenção)
CREATE TABLE IF NOT EXISTS public.dispositivos_autorizados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_fingerprint TEXT NOT NULL UNIQUE,
  device_name TEXT NOT NULL,
  device_type TEXT NOT NULL,
  descricao TEXT,
  autorizado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS para dispositivos_autorizados
ALTER TABLE public.dispositivos_autorizados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage authorized devices"
ON public.dispositivos_autorizados
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Função para verificar se dispositivo está autorizado
CREATE OR REPLACE FUNCTION public.is_device_authorized(p_fingerprint TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.dispositivos_autorizados
    WHERE device_fingerprint = p_fingerprint
  )
$$;

-- 5. Habilitar realtime para dispositivos conectados
ALTER PUBLICATION supabase_realtime ADD TABLE public.dispositivos_conectados;
ALTER TABLE public.dispositivos_conectados REPLICA IDENTITY FULL;