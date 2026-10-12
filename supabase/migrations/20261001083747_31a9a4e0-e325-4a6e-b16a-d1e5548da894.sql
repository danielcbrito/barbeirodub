CREATE OR REPLACE FUNCTION public.release_plan_charge_on_first_cut()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' AND NEW.user_id IS NOT NULL THEN
    UPDATE public.woovi_charges wc
       SET released_at = now(), updated_at = now()
      FROM public.assinaturas s
     WHERE wc.correlation_id = 'sub-' || s.id::text
       AND s.user_id = NEW.user_id
       AND s.barbeiro_id = NEW.barbeiro_id
       AND wc.released_at IS NULL
       AND wc.status IN ('PAID','paid','COMPLETED','ACTIVE_PAID')
       AND wc.paid_at <= now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_release_plan_charge_on_first_cut ON public.agendamentos;
CREATE TRIGGER trg_release_plan_charge_on_first_cut
AFTER UPDATE OF status ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.release_plan_charge_on_first_cut();

-- Libera retroativamente planos pagos cujo cliente já tem corte concluído
UPDATE public.woovi_charges wc
   SET released_at = now(), updated_at = now()
  FROM public.assinaturas s
 WHERE wc.correlation_id = 'sub-' || s.id::text
   AND wc.released_at IS NULL
   AND wc.status IN ('PAID','paid','COMPLETED','ACTIVE_PAID')
   AND EXISTS (SELECT 1 FROM public.agendamentos a
                WHERE a.user_id = s.user_id AND a.barbeiro_id = s.barbeiro_id
                  AND a.status = 'completed' AND a.created_at >= wc.paid_at - interval '1 day');