-- Allow TI role to insert notifications for any user
CREATE POLICY "ti_insert_notificacoes"
ON public.notificacoes FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'ti')
);