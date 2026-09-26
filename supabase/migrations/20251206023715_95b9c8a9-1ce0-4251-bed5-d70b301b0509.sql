
-- ============================================
-- CORREÇÃO CRÍTICA: RLS da tabela creditos
-- Problema: Usuários não conseguem INSERT/UPDATE em seus próprios créditos
-- Causa: Políticas RLS não permitem essas operações
-- ============================================

-- 1. Adicionar política para UPDATE (usuários podem atualizar seus próprios créditos)
CREATE POLICY "Usuários podem atualizar seus próprios créditos" 
ON public.creditos 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 2. Adicionar política para INSERT (usuários podem inserir créditos para si mesmos)
-- Necessário para o caso de uso parcial de créditos (dividir um crédito em dois)
CREATE POLICY "Usuários podem inserir seus próprios créditos" 
ON public.creditos 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- 3. Criar função atômica para usar créditos com SECURITY DEFINER
-- Isso garante atomicidade e evita race conditions
CREATE OR REPLACE FUNCTION public.use_credits_atomic(
  p_user_id UUID,
  p_appointment_id UUID,
  p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit RECORD;
  v_remaining NUMERIC := p_amount;
  v_used_total NUMERIC := 0;
  v_leftover NUMERIC;
  v_result JSONB;
BEGIN
  -- Verificar se o usuário tem créditos suficientes
  IF (SELECT COALESCE(SUM(valor), 0) 
      FROM creditos 
      WHERE user_id = p_user_id 
        AND usado = false 
        AND (expires_at IS NULL OR expires_at > NOW())) < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Créditos insuficientes');
  END IF;

  -- Processar créditos um por um (mais antigos primeiro)
  FOR v_credit IN 
    SELECT * 
    FROM creditos 
    WHERE user_id = p_user_id 
      AND usado = false 
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY created_at ASC
    FOR UPDATE -- Lock para evitar race conditions
  LOOP
    EXIT WHEN v_remaining <= 0;
    
    IF v_credit.valor <= v_remaining THEN
      -- Usar crédito inteiro
      UPDATE creditos
      SET usado = true,
          agendamento_usado_id = p_appointment_id
      WHERE id = v_credit.id;
      
      v_remaining := v_remaining - v_credit.valor;
      v_used_total := v_used_total + v_credit.valor;
      
    ELSE
      -- Uso parcial: atualizar valor restante e criar registro de uso
      v_leftover := v_credit.valor - v_remaining;
      
      -- Atualizar crédito original com valor restante
      UPDATE creditos
      SET valor = v_leftover
      WHERE id = v_credit.id;
      
      -- Criar novo registro para a parte usada
      INSERT INTO creditos (
        user_id, 
        valor, 
        origem, 
        usado, 
        agendamento_usado_id, 
        agendamento_origem_id, 
        expires_at
      ) VALUES (
        p_user_id,
        v_remaining,
        v_credit.origem,
        true,
        p_appointment_id,
        v_credit.agendamento_origem_id,
        v_credit.expires_at
      );
      
      v_used_total := v_used_total + v_remaining;
      v_remaining := 0;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true, 
    'used_amount', v_used_total,
    'remaining_to_pay', v_remaining
  );
END;
$$;

-- 4. Conceder permissão de execução da função
GRANT EXECUTE ON FUNCTION public.use_credits_atomic(UUID, UUID, NUMERIC) TO authenticated;
