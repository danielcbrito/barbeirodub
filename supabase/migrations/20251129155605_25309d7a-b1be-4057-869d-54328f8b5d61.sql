-- Corrigindo funções sem search_path definido

-- 1. Recriar função update_support_updated_at com search_path
CREATE OR REPLACE FUNCTION update_support_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 2. Recriar função update_conversation_last_message com search_path
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE support_conversations 
  SET last_message_at = NEW.created_at 
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;