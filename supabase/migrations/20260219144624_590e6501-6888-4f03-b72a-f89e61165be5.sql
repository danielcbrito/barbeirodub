-- Permite que qualquer usuário autenticado leia as configurações de manutenção/aviso
-- (apenas leitura - escrita ainda restrita a admins)
CREATE POLICY "Authenticated users can read maintenance config"
  ON public.webhook_config
  FOR SELECT
  USING (auth.role() = 'authenticated');