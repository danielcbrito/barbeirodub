
-- =============================================
-- SISTEMA BANCÁRIO FINANCEIRO
-- =============================================

-- Tabela de chaves PIX cadastradas
CREATE TABLE public.chaves_pix (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  barbeiro_id UUID REFERENCES public.barbeiros(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria')),
  chave TEXT NOT NULL,
  apelido TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.chaves_pix ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own PIX keys"
ON public.chaves_pix FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own PIX keys"
ON public.chaves_pix FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own PIX keys"
ON public.chaves_pix FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own PIX keys"
ON public.chaves_pix FOR DELETE
USING (auth.uid() = user_id);

-- Tabela de solicitações de saque
CREATE TABLE public.saques (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  barbeiro_id UUID REFERENCES public.barbeiros(id) ON DELETE SET NULL,
  valor NUMERIC NOT NULL CHECK (valor > 0),
  chave_pix_id UUID REFERENCES public.chaves_pix(id),
  chave_pix_valor TEXT NOT NULL,
  chave_pix_tipo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'processando', 'concluido', 'cancelado', 'falhou')),
  motivo_cancelamento TEXT,
  processado_em TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.saques ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own withdrawals"
ON public.saques FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can request their own withdrawals"
ON public.saques FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all withdrawals"
ON public.saques FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update withdrawal status"
ON public.saques FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- PIN financeiro
CREATE TABLE public.pin_financeiro (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pin_financeiro ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own PIN"
ON public.pin_financeiro FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own PIN"
ON public.pin_financeiro FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own PIN"
ON public.pin_financeiro FOR UPDATE
USING (auth.uid() = user_id);

-- Depósitos via PIX
CREATE TABLE public.depositos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  barbeiro_id UUID REFERENCES public.barbeiros(id) ON DELETE SET NULL,
  valor NUMERIC NOT NULL CHECK (valor > 0),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'confirmado', 'expirado', 'cancelado')),
  pix_qr_code TEXT,
  pix_payload TEXT,
  gateway_payment_id TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  confirmado_em TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.depositos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own deposits"
ON public.depositos FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own deposits"
ON public.depositos FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all deposits"
ON public.depositos FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Triggers para updated_at
CREATE TRIGGER update_chaves_pix_updated_at
BEFORE UPDATE ON public.chaves_pix
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_saques_updated_at
BEFORE UPDATE ON public.saques
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pin_financeiro_updated_at
BEFORE UPDATE ON public.pin_financeiro
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_depositos_updated_at
BEFORE UPDATE ON public.depositos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Índices para performance
CREATE INDEX idx_chaves_pix_user_id ON public.chaves_pix(user_id);
CREATE INDEX idx_saques_user_id ON public.saques(user_id);
CREATE INDEX idx_saques_status ON public.saques(status);
CREATE INDEX idx_depositos_user_id ON public.depositos(user_id);
CREATE INDEX idx_depositos_status ON public.depositos(status);
