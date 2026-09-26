-- Permitir que barbeiros vejam perfis de clientes que agendaram com eles
CREATE POLICY "Barbers can view profiles of their clients"
ON public.profiles
FOR SELECT
USING (
  has_role(auth.uid(), 'barber'::app_role)
  AND id IN (
    SELECT DISTINCT a.user_id
    FROM agendamentos a
    JOIN barbeiros b ON b.id = a.barbeiro_id
    WHERE b.user_id = auth.uid()
  )
);
