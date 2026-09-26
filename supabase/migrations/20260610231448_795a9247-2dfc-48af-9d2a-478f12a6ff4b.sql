CREATE POLICY "Barbeiros can insert plan usage" ON public.plano_agendamentos_usos
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.barbeiros 
    WHERE user_id = auth.uid() 
    AND ativo = true
  )
);

CREATE POLICY "Barbeiros can delete plan usage" ON public.plano_agendamentos_usos
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.barbeiros 
    WHERE user_id = auth.uid() 
    AND ativo = true
  )
);

GRANT INSERT, DELETE ON public.plano_agendamentos_usos TO authenticated;