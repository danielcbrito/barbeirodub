
-- Allow admins and barbers to insert appointments for any user
CREATE POLICY "Admins can create appointments for any user"
ON public.agendamentos
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR
  (barbeiro_id IN (
    SELECT b.id FROM barbeiros b WHERE b.user_id = auth.uid()
  ))
);
