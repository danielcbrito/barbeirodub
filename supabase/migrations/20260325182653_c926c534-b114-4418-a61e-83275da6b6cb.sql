
-- ═══════════════════════════════════════════════════════════
-- Trigger: confirmar renovação quando status muda de
-- pending_renewal → active (via webhook de pagamento)
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.confirmar_renovacao_plano()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'pending_renewal' AND NEW.status = 'active' THEN
    NEW.ciclo_inicio := CURRENT_DATE;
    NEW.ciclo_fim := CURRENT_DATE + INTERVAL '30 days';
    NEW.usos_ciclo_atual := 0;
    NEW.total_renovacoes := COALESCE(OLD.total_renovacoes, 0) + 1;
    NEW.renovada_antecipadamente := (CURRENT_DATE < OLD.ciclo_fim);
    NEW.next_billing_date := (CURRENT_DATE + INTERVAL '30 days')::date;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

DROP TRIGGER IF EXISTS trg_confirmar_renovacao ON public.assinaturas;
CREATE TRIGGER trg_confirmar_renovacao
  BEFORE UPDATE ON public.assinaturas
  FOR EACH ROW
  EXECUTE FUNCTION public.confirmar_renovacao_plano();

-- ═══════════════════════════════════════════════════════════
-- Trigger: incrementar usos_ciclo_atual ao inserir uso
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.incrementar_uso_ciclo_plano()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.assinaturas
  SET usos_ciclo_atual = usos_ciclo_atual + 1,
      updated_at = now()
  WHERE id = NEW.assinatura_id
    AND status IN ('active', 'pending_cash');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

DROP TRIGGER IF EXISTS trg_incrementar_uso_ciclo ON public.plano_agendamentos_usos;
CREATE TRIGGER trg_incrementar_uso_ciclo
  AFTER INSERT ON public.plano_agendamentos_usos
  FOR EACH ROW
  EXECUTE FUNCTION public.incrementar_uso_ciclo_plano();

-- ═══════════════════════════════════════════════════════════
-- Trigger: decrementar usos ao cancelar (released_at preenchido)
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.decrementar_uso_ciclo_plano()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.released_at IS NULL AND NEW.released_at IS NOT NULL THEN
    UPDATE public.assinaturas
    SET usos_ciclo_atual = GREATEST(0, usos_ciclo_atual - 1),
        updated_at = now()
    WHERE id = NEW.assinatura_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

DROP TRIGGER IF EXISTS trg_decrementar_uso_ciclo ON public.plano_agendamentos_usos;
CREATE TRIGGER trg_decrementar_uso_ciclo
  AFTER UPDATE ON public.plano_agendamentos_usos
  FOR EACH ROW
  EXECUTE FUNCTION public.decrementar_uso_ciclo_plano();
