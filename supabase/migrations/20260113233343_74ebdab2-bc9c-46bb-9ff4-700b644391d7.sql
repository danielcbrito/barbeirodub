-- =====================================================
-- CORREÇÃO DO TRIGGER DE PONTOS DE FIDELIDADE
-- =====================================================
-- O problema atual: o trigger só funciona quando status='completed'
-- Solução: Também liberar ponto quando barbeiro_confirmou mudar para true
-- (independente do status, desde que o corte não seja grátis)

CREATE OR REPLACE FUNCTION public.award_loyalty_point()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_points integer;
  promo_id uuid;
BEGIN
  -- Libera ponto se:
  -- 1. Barbeiro acabou de confirmar (barbeiro_confirmou mudou de false para true) OU
  -- 2. Status mudou para completed com barbeiro já confirmado
  -- E: ponto ainda não foi liberado E não é corte grátis
  
  IF (
    -- Caso 1: Barbeiro está confirmando agora
    (OLD.barbeiro_confirmou = false AND NEW.barbeiro_confirmou = true)
    OR
    -- Caso 2: Status virou completed com barbeiro já confirmado
    (OLD.status != 'completed' AND NEW.status = 'completed' AND NEW.barbeiro_confirmou = true)
  )
  AND NEW.ponto_liberado = false
  AND COALESCE(NEW.is_free, false) = false
  THEN
    
    -- Buscar promoção ativa de fidelidade
    SELECT id INTO promo_id
    FROM public.promocoes
    WHERE ativo = true
    LIMIT 1;
    
    -- Se não houver promoção ativa, não faz nada
    IF promo_id IS NULL THEN
      RETURN NEW;
    END IF;
    
    -- Adicionar 1 ponto ao usuário (inserir se não existe, ou incrementar)
    INSERT INTO public.pontos (user_id, pontos, promocao_id, last_awarded_at, updated_at)
    VALUES (NEW.user_id, 1, promo_id, NOW(), NOW())
    ON CONFLICT (user_id) 
    DO UPDATE SET 
      pontos = pontos.pontos + 1,
      last_awarded_at = NOW(),
      updated_at = NOW();
    
    -- Buscar pontos atuais após incremento
    SELECT pontos INTO current_points
    FROM public.pontos
    WHERE user_id = NEW.user_id;
    
    -- Se chegou a 5 pontos, converter em 1 resgate (corte grátis)
    IF current_points >= 5 THEN
      -- Zerar pontos
      UPDATE public.pontos
      SET pontos = 0,
          updated_at = NOW()
      WHERE user_id = NEW.user_id;
      
      -- Criar resgate disponível (corte grátis válido por 90 dias)
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
$function$;

-- Registrar correção no log
INSERT INTO public.system_logs (level, category, message, details)
VALUES (
  'info',
  'trigger_fix',
  'Trigger award_loyalty_point corrigido para funcionar ao confirmar barbeiro',
  jsonb_build_object(
    'fix_description', 'Agora libera ponto quando barbeiro_confirmou muda para true OU quando status vira completed',
    'executed_at', now()
  )
);