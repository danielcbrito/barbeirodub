-- Criar tabela para armazenar reservas pendentes (antes do pagamento)
CREATE TABLE IF NOT EXISTS public.pending_bookings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  servico_id UUID NOT NULL REFERENCES public.servicos(id),
  barbeiro_id UUID REFERENCES public.barbeiros(id),
  data DATE NOT NULL,
  hora TIME NOT NULL,
  duracao INTEGER NOT NULL,
  preco NUMERIC NOT NULL,
  observacoes TEXT,
  payment_intent_id TEXT, -- ID do pagamento no Asaas (se houver)
  payment_method TEXT, -- 'pix', 'card', 'cash'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + INTERVAL '30 minutes'), -- Expira em 30 minutos
  CONSTRAINT unique_pending_booking_slot UNIQUE (data, hora, barbeiro_id)
);

-- Habilitar RLS
ALTER TABLE public.pending_bookings ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can create own pending bookings"
  ON public.pending_bookings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own pending bookings"
  ON public.pending_bookings
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own pending bookings"
  ON public.pending_bookings
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own pending bookings"
  ON public.pending_bookings
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all pending bookings"
  ON public.pending_bookings
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Função para limpar reservas pendentes expiradas
CREATE OR REPLACE FUNCTION public.clean_expired_pending_bookings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.pending_bookings
  WHERE expires_at < NOW();
END;
$$;

-- Índices para performance
CREATE INDEX idx_pending_bookings_user_id ON public.pending_bookings(user_id);
CREATE INDEX idx_pending_bookings_expires_at ON public.pending_bookings(expires_at);
CREATE INDEX idx_pending_bookings_payment_intent ON public.pending_bookings(payment_intent_id);