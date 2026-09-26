-- Add missing RLS policies for barbeiros
CREATE POLICY "Admins can manage barbeiros" ON public.barbeiros
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view active barbeiros" ON public.barbeiros
  FOR SELECT USING (ativo = TRUE);

-- Add missing RLS policies for assinaturas
CREATE POLICY "Users can view own subscriptions" ON public.assinaturas
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all subscriptions" ON public.assinaturas
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Add missing RLS policies for pagamentos
CREATE POLICY "Users can view own payments" ON public.pagamentos
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all payments" ON public.pagamentos
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Add missing RLS policies for comissoes
CREATE POLICY "Barbeiros can view own commissions" ON public.comissoes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.barbeiros
      WHERE barbeiros.id = comissoes.barbeiro_id
      AND barbeiros.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all commissions" ON public.comissoes
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Add missing RLS policies for promocoes (public read)
CREATE POLICY "Anyone can view active promotions" ON public.promocoes
  FOR SELECT USING (ativo = TRUE);

CREATE POLICY "Admins can manage promotions" ON public.promocoes
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Fix function search_path for update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;