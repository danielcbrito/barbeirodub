-- Criar tabela de créditos para usuários
CREATE TABLE IF NOT EXISTS public.creditos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  valor NUMERIC NOT NULL,
  origem TEXT NOT NULL, -- 'cancelamento', 'reembolso', 'promocao'
  usado BOOLEAN DEFAULT FALSE,
  agendamento_origem_id UUID, -- ID do agendamento que gerou o crédito
  agendamento_usado_id UUID, -- ID do agendamento onde o crédito foi usado
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE, -- Validade do crédito (opcional)
  CONSTRAINT creditos_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Habilitar RLS
ALTER TABLE public.creditos ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Usuários podem ver seus próprios créditos"
  ON public.creditos
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins podem gerenciar todos os créditos"
  ON public.creditos
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Índices para performance
CREATE INDEX idx_creditos_user_id ON public.creditos(user_id);
CREATE INDEX idx_creditos_usado ON public.creditos(usado) WHERE usado = false;

-- Função para obter total de créditos disponíveis de um usuário
CREATE OR REPLACE FUNCTION public.get_user_available_credits(p_user_id UUID)
RETURNS NUMERIC AS $$
  SELECT COALESCE(SUM(valor), 0)
  FROM public.creditos
  WHERE user_id = p_user_id
    AND usado = FALSE
    AND (expires_at IS NULL OR expires_at > NOW());
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public;