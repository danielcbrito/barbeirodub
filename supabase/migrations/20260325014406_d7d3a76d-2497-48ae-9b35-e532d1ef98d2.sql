-- Allow TI users to insert roles
CREATE POLICY "ti_insert_user_roles"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'ti'::app_role));

-- Allow TI users to delete roles
CREATE POLICY "ti_delete_user_roles"
  ON public.user_roles
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'ti'::app_role));