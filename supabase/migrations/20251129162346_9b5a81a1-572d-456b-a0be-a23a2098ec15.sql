-- Adicionar coluna metadata para support_conversations (para armazenar dados de guests)
ALTER TABLE support_conversations 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Permitir user_id null em support_conversations (para guests)
ALTER TABLE support_conversations 
ALTER COLUMN user_id DROP NOT NULL;

-- Permitir user_id null em support_tickets (para guests)
ALTER TABLE support_tickets 
ALTER COLUMN user_id DROP NOT NULL;

-- Atualizar comentários
COMMENT ON COLUMN support_conversations.metadata IS 'Armazena dados de usuários convidados (nome, email) e outras informações contextuais';
COMMENT ON COLUMN support_conversations.user_id IS 'ID do usuário autenticado. NULL para usuários convidados.';
COMMENT ON COLUMN support_tickets.user_id IS 'ID do usuário autenticado. NULL para usuários convidados.';