-- Adicionar coluna de método de pagamento no agendamento para mostrar na agenda
ALTER TABLE public.agendamentos 
ADD COLUMN IF NOT EXISTS payment_method text;

-- Criar função para liberar pontos apenas quando barbeiro confirmar
CREATE OR REPLACE FUNCTION public.award_loyalty_point()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_points integer;
  promo_id uuid;
BEGIN
  -- Só libera ponto se:
  -- 1. Status mudou para completed
  -- 2. Barbeiro confirmou
  -- 3. Ponto ainda não foi liberado
  -- 4. Não é um corte grátis (is_free = false)
  IF NEW.status = 'completed' 
     AND NEW.barbeiro_confirmou = true 
     AND NEW.ponto_liberado = false
     AND NEW.is_free = false THEN
    
    -- Buscar promoção ativa de fidelidade
    SELECT id INTO promo_id
    FROM public.promocoes
    WHERE ativo = true
    LIMIT 1;
    
    -- Se não houver promoção ativa, não faz nada
    IF promo_id IS NULL THEN
      RETURN NEW;
    END IF;
    
    -- Adicionar 1 ponto ao usuário
    INSERT INTO public.pontos (user_id, pontos, promocao_id)
    VALUES (NEW.user_id, 1, promo_id)
    ON CONFLICT (user_id) 
    DO UPDATE SET 
      pontos = pontos.pontos + 1,
      last_awarded_at = NOW(),
      updated_at = NOW();
    
    -- Buscar pontos atuais
    SELECT pontos INTO current_points
    FROM public.pontos
    WHERE user_id = NEW.user_id;
    
    -- Se chegou a 5 pontos, converter em 1 crédito de corte grátis
    IF current_points >= 5 THEN
      -- Zerar pontos
      UPDATE public.pontos
      SET pontos = 0,
          updated_at = NOW()
      WHERE user_id = NEW.user_id;
      
      -- Criar resgate disponível (corte grátis)
      INSERT INTO public.resgates (user_id, promocao_id, status, created_at, expired_at)
      VALUES (
        NEW.user_id, 
        promo_id, 
        'available',
        NOW(),
        NOW() + INTERVAL '90 days'
      );
    END IF;
    
    -- Marcar ponto como liberado
    NEW.ponto_liberado = true;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Criar trigger para liberar pontos automaticamente
DROP TRIGGER IF EXISTS trigger_award_loyalty_point ON public.agendamentos;
CREATE TRIGGER trigger_award_loyalty_point
  BEFORE UPDATE ON public.agendamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.award_loyalty_point();

-- Adicionar constraint unique em pontos por user_id
ALTER TABLE public.pontos DROP CONSTRAINT IF EXISTS pontos_user_id_key;
ALTER TABLE public.pontos ADD CONSTRAINT pontos_user_id_key UNIQUE (user_id);

-- Atualizar RLS de pontos para MÁXIMA SEGURANÇA
-- Cliente NÃO PODE modificar pontos de forma alguma
DROP POLICY IF EXISTS "Users can view own points" ON public.pontos;
DROP POLICY IF EXISTS "Admins can manage points" ON public.pontos;

-- Apenas visualização para o próprio usuário
CREATE POLICY "Users can only view own points"
ON public.pontos
FOR SELECT
USING (auth.uid() = user_id);

-- APENAS admin pode modificar pontos
CREATE POLICY "Only admins can manage points"
ON public.pontos
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Atualizar RLS de resgates para MÁXIMA SEGURANÇA
DROP POLICY IF EXISTS "Users can view own redemptions" ON public.resgates;
DROP POLICY IF EXISTS "Admins can manage redemptions" ON public.resgates;

-- Cliente pode visualizar seus resgates
CREATE POLICY "Users can view own redemptions"
ON public.resgates
FOR SELECT
USING (auth.uid() = user_id);

-- Cliente NÃO pode criar, editar ou deletar resgates manualmente
-- Apenas o sistema (trigger) e admin podem
CREATE POLICY "Only admins can manage redemptions"
ON public.resgates
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));