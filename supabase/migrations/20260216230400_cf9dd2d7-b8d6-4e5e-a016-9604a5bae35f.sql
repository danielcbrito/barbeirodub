CREATE POLICY "Users can delete their own PIN"
ON public.pin_financeiro
FOR DELETE
USING (auth.uid() = user_id);