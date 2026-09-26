-- ============================================
-- SISTEMA DE SUPORTE COM IA
-- ============================================

-- 1. Tabela de conversas de suporte
CREATE TABLE IF NOT EXISTS support_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'escalated')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- 2. Tabela de mensagens do chat
CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES support_conversations(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Tabela de tickets (para bugs reportados)
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES support_conversations(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  category TEXT NOT NULL DEFAULT 'bug' CHECK (category IN ('bug', 'feature', 'question', 'other')),
  location TEXT,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- 4. Índices para performance
CREATE INDEX IF NOT EXISTS idx_support_conversations_user ON support_conversations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_messages_conversation ON support_messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id, status, created_at DESC);

-- 5. Enable RLS
ALTER TABLE support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies para support_conversations
CREATE POLICY "Usuários veem suas próprias conversas"
  ON support_conversations FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Usuários criam suas próprias conversas"
  ON support_conversations FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Usuários atualizam suas próprias conversas"
  ON support_conversations FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Admin vê todas conversas
CREATE POLICY "Admin vê todas conversas"
  ON support_conversations FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- 7. RLS Policies para support_messages
CREATE POLICY "Usuários veem mensagens de suas conversas"
  ON support_messages FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM support_conversations 
    WHERE id = conversation_id AND user_id = auth.uid()
  ));

CREATE POLICY "Usuários criam mensagens em suas conversas"
  ON support_messages FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM support_conversations 
    WHERE id = conversation_id AND user_id = auth.uid()
  ));

-- Admin vê todas mensagens
CREATE POLICY "Admin vê todas mensagens"
  ON support_messages FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- 8. RLS Policies para support_tickets
CREATE POLICY "Usuários veem seus próprios tickets"
  ON support_tickets FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Usuários criam seus próprios tickets"
  ON support_tickets FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Usuários atualizam seus próprios tickets"
  ON support_tickets FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Admin vê e atualiza todos tickets
CREATE POLICY "Admin vê todos tickets"
  ON support_tickets FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "Admin atualiza todos tickets"
  ON support_tickets FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- 9. Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_support_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_support_conversations_updated_at
  BEFORE UPDATE ON support_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_support_updated_at();

CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_support_updated_at();

-- 10. Trigger para atualizar last_message_at na conversa
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE support_conversations 
  SET last_message_at = NEW.created_at 
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_conversation_on_message
  AFTER INSERT ON support_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_last_message();