-- Permitir barbeiros verem todos os profiles (nome, telefone) para busca no encaixe manual
-- Substitui a política restritiva anterior
DROP POLICY IF EXISTS "Barbers can view profiles of their clients" ON public.profiles;

CREATE POLICY "Barbers can view all profiles"
  ON public.profiles
  FOR SELECT
  USING (has_role(auth.uid(), 'barber'::app_role));