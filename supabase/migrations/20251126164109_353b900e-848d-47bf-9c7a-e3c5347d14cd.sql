-- Criar tabela de notificações para usuários
CREATE TABLE IF NOT EXISTS public.notificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('cancelamento', 'remarcacao', 'cancelamento_massa', 'geral')),
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  agendamento_id UUID,
  lida BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_agendamento FOREIGN KEY (agendamento_id) REFERENCES public.agendamentos(id) ON DELETE SET NULL
);

-- Habilitar RLS
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Usuários podem ver suas próprias notificações"
  ON public.notificacoes
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar suas próprias notificações"
  ON public.notificacoes
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins podem criar notificações"
  ON public.notificacoes
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins podem ver todas as notificações"
  ON public.notificacoes
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

-- Criar índice para melhor performance
CREATE INDEX idx_notificacoes_user_id ON public.notificacoes(user_id);
CREATE INDEX idx_notificacoes_lida ON public.notificacoes(lida);
CREATE INDEX idx_notificacoes_created_at ON public.notificacoes(created_at DESC);

-- Habilitar realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes;