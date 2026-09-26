
-- Barbeiros precisam ver pagamentos dos agendamentos vinculados a eles
-- para exibir corretamente o status de pagamento nas confirmações pendentes
CREATE POLICY "Barbers can view payments for their appointments"
ON public.pagamentos
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.agendamentos a
    JOIN public.barbeiros b ON b.id = a.barbeiro_id
    WHERE a.id = pagamentos.agendamento_id
      AND b.user_id = auth.uid()
  )
);
