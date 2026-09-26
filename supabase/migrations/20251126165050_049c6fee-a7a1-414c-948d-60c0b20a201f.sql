-- Corrigir política RLS para permitir que admins criem notificações para qualquer usuário
DROP POLICY IF EXISTS "Admins podem criar notificações" ON public.notificacoes;

CREATE POLICY "Admins podem criar notificações para qualquer usuário"
  ON public.notificacoes
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Esta política permite que admins insiram notificações com qualquer user_id
-- A verificação é apenas se quem está inserindo é admin, não valida o user_id do registro