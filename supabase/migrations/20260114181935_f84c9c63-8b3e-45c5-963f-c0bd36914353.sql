-- =====================================================
-- RECONCILIAÇÃO: finalizar agendamentos antigos travados em 'confirmed'
-- =====================================================
-- Objetivo:
-- 1) Converter agendamentos já passados (data < current_date) que o barbeiro confirmou
--    e que ainda estão com status='confirmed' para status='completed'
-- 2) Ao fazer isso, o trigger award_loyalty_point (já corrigido) passa a rodar
--    e credita os pontos automaticamente (apenas quando ponto_liberado=false e is_free=false).

UPDATE public.agendamentos
SET
  status = 'completed',
  updated_at = NOW()
WHERE status = 'confirmed'
  AND COALESCE(barbeiro_confirmou, false) = true
  AND COALESCE(ponto_liberado, false) = false
  AND COALESCE(is_free, false) = false
  AND data < CURRENT_DATE;

-- Auditoria
INSERT INTO public.system_logs (level, category, message, details)
VALUES (
  'info',
  'loyalty_reconcile',
  'Agendamentos antigos confirmados pelo barbeiro foram finalizados para completed (para liberar pontos).',
  jsonb_build_object(
    'criteria', 'status=confirmed, barbeiro_confirmou=true, ponto_liberado=false, is_free=false, data < current_date',
    'executed_at', now()
  )
);
