-- ========================================
-- TABELA: pending_tickets (tickets que falharam ao criar)
-- ========================================
CREATE TABLE IF NOT EXISTS public.pending_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pending_ticket_id TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_id TEXT,
  conversation_id UUID REFERENCES public.support_conversations(id),
  user_id UUID,
  user_name TEXT,
  user_phone TEXT,
  user_email TEXT,
  summary TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  category TEXT NOT NULL DEFAULT 'bug',
  retry_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT,
  payload JSONB,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  ticket_id UUID REFERENCES public.support_tickets(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_pending_tickets_status ON public.pending_tickets(status);
CREATE INDEX IF NOT EXISTS idx_pending_tickets_user_id ON public.pending_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_pending_tickets_created_at ON public.pending_tickets(created_at DESC);

-- ========================================
-- TABELA: ai_actions_log (auditoria de ações da IA)
-- ========================================
CREATE TABLE IF NOT EXISTS public.ai_actions_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_id TEXT,
  conversation_id UUID REFERENCES public.support_conversations(id),
  user_id UUID,
  action_type TEXT NOT NULL,
  action_name TEXT NOT NULL,
  parameters JSONB,
  result JSONB,
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  before_state JSONB,
  after_state JSONB,
  auto_approved BOOLEAN DEFAULT true,
  approved_by UUID,
  reverted_at TIMESTAMPTZ,
  reverted_by UUID
);

CREATE INDEX IF NOT EXISTS idx_ai_actions_log_user_id ON public.ai_actions_log(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_actions_log_created_at ON public.ai_actions_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_actions_log_action_type ON public.ai_actions_log(action_type);

-- ========================================
-- TABELA: ai_feedback (feedback das respostas da IA)
-- ========================================
CREATE TABLE IF NOT EXISTS public.ai_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  conversation_id UUID REFERENCES public.support_conversations(id),
  message_id UUID REFERENCES public.support_messages(id),
  user_id UUID,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  helpful BOOLEAN,
  comment TEXT,
  resolved_issue BOOLEAN
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_conversation_id ON public.ai_feedback(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_created_at ON public.ai_feedback(created_at DESC);

-- ========================================
-- RLS POLICIES
-- ========================================

-- pending_tickets
ALTER TABLE public.pending_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin pode ver todos pending_tickets"
  ON public.pending_tickets FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin pode atualizar pending_tickets"
  ON public.pending_tickets FOR UPDATE
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Sistema pode inserir pending_tickets"
  ON public.pending_tickets FOR INSERT
  WITH CHECK (true);

-- ai_actions_log
ALTER TABLE public.ai_actions_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin pode ver todos logs de ações da IA"
  ON public.ai_actions_log FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Sistema pode inserir logs de ações"
  ON public.ai_actions_log FOR INSERT
  WITH CHECK (true);

-- ai_feedback
ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin pode ver todo feedback"
  ON public.ai_feedback FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Usuários podem inserir feedback em suas conversas"
  ON public.ai_feedback FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.support_conversations
      WHERE id = conversation_id AND user_id = auth.uid()
    )
  );

-- ========================================
-- TRIGGER: atualizar updated_at
-- ========================================
CREATE TRIGGER update_pending_tickets_updated_at
  BEFORE UPDATE ON public.pending_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_support_updated_at();