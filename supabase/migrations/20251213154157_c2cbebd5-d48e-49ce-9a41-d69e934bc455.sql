-- Tabela para armazenar códigos de verificação via WhatsApp
CREATE TABLE public.whatsapp_verification_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  verified_at TIMESTAMP WITH TIME ZONE,
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Dados temporários do cadastro (para envio no webhook)
  user_name TEXT,
  user_email TEXT,
  user_cpf TEXT
);

-- Índices para performance
CREATE INDEX idx_whatsapp_verification_user_id ON public.whatsapp_verification_codes(user_id);
CREATE INDEX idx_whatsapp_verification_phone ON public.whatsapp_verification_codes(phone);
CREATE INDEX idx_whatsapp_verification_code ON public.whatsapp_verification_codes(code);
CREATE INDEX idx_whatsapp_verification_expires ON public.whatsapp_verification_codes(expires_at);

-- Habilitar RLS
ALTER TABLE public.whatsapp_verification_codes ENABLE ROW LEVEL SECURITY;

-- Política: Usuários podem ver apenas seus próprios códigos
CREATE POLICY "Users can view own verification codes"
ON public.whatsapp_verification_codes
FOR SELECT
USING (auth.uid() = user_id);

-- Política: Sistema pode inserir códigos (via service role)
-- Não permitimos INSERT direto por usuários - isso é feito via edge function

-- Política: Sistema pode atualizar códigos (via service role)
-- Não permitimos UPDATE direto por usuários - isso é feito via edge function

-- Função para limpar códigos expirados (manutenção)
CREATE OR REPLACE FUNCTION public.clean_expired_verification_codes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.whatsapp_verification_codes
  WHERE expires_at < NOW() - INTERVAL '1 day';
END;
$$;