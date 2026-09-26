-- 1. Permitir que barbeiros atualizem agendamentos de outros colegas no mesmo tenant
-- Isso é necessário para quando um barbeiro ativa um plano e o cliente tinha um agendamento com outro colega hoje.
DROP POLICY IF EXISTS "Barbers can update tenant appointments" ON public.agendamentos;
CREATE POLICY "Barbers can update tenant appointments" ON public.agendamentos
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.barbeiros b_auth
    JOIN public.barbeiros b_target ON b_auth.tenant_id = b_target.tenant_id
    WHERE b_auth.user_id = auth.uid() 
    AND b_auth.ativo = true
    AND b_target.id = agendamentos.barbeiro_id
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.barbeiros b_auth
    JOIN public.barbeiros b_target ON b_auth.tenant_id = b_target.tenant_id
    WHERE b_auth.user_id = auth.uid() 
    AND b_auth.ativo = true
    AND b_target.id = agendamentos.barbeiro_id
  )
);

-- 2. Expandir permissões de assinaturas para toda a equipe do tenant
DROP POLICY IF EXISTS "Barbers can manage tenant subscriptions" ON public.assinaturas;
CREATE POLICY "Barbers can manage tenant subscriptions" ON public.assinaturas
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.barbeiros b_auth
    JOIN public.barbeiros b_target ON b_auth.tenant_id = b_target.tenant_id
    WHERE b_auth.user_id = auth.uid() 
    AND b_auth.ativo = true
    AND b_target.id = assinaturas.barbeiro_id
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.barbeiros b_auth
    JOIN public.barbeiros b_target ON b_auth.tenant_id = b_target.tenant_id
    WHERE b_auth.user_id = auth.uid() 
    AND b_auth.ativo = true
    AND b_target.id = assinaturas.barbeiro_id
  )
);

-- 3. Permitir que barbeiros enviem notificações para clientes do mesmo tenant
DROP POLICY IF EXISTS "Barbers can notify tenant clients" ON public.notificacoes;
CREATE POLICY "Barbers can notify tenant clients" ON public.notificacoes
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.barbeiros b
    JOIN public.tenant_clientes tc ON b.tenant_id = tc.tenant_id
    WHERE b.user_id = auth.uid()
    AND b.ativo = true
    AND tc.user_id = notificacoes.user_id
  )
);

-- 4. Garantir que barbeiros possam gerenciar pagamentos de plano no mesmo tenant
DROP POLICY IF EXISTS "Barbers can manage tenant plan payments" ON public.pagamentos_plano_barbearia;
CREATE POLICY "Barbers can manage tenant plan payments" ON public.pagamentos_plano_barbearia
FOR INSERT WITH CHECK (
  confirmado_por = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.barbeiros b_auth
    JOIN public.barbeiros b_target ON b_auth.tenant_id = b_target.tenant_id
    WHERE b_auth.user_id = auth.uid() 
    AND b_auth.ativo = true
    AND b_target.id = pagamentos_plano_barbearia.barbeiro_id
  )
);

-- 5. Simplificar e proteger usos de agendamentos de plano
DROP POLICY IF EXISTS "Barbeiros can insert plan usage" ON public.plano_agendamentos_usos;
CREATE POLICY "Barbers can manage plan usage for their tenant" ON public.plano_agendamentos_usos
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.barbeiros b
    JOIN public.assinaturas s ON b.id = s.barbeiro_id
    WHERE b.user_id = auth.uid()
    AND b.ativo = true
    AND s.id = plano_agendamentos_usos.assinatura_id
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.barbeiros b
    JOIN public.assinaturas s ON b.id = s.barbeiro_id
    WHERE b.user_id = auth.uid()
    AND b.ativo = true
    AND s.id = plano_agendamentos_usos.assinatura_id
  )
);

-- Garantir GRANTs básicos para a role authenticated
GRANT INSERT, UPDATE ON public.agendamentos TO authenticated;
GRANT INSERT, UPDATE, SELECT ON public.assinaturas TO authenticated;
GRANT INSERT ON public.notificacoes TO authenticated;
GRANT INSERT ON public.pagamentos_plano_barbearia TO authenticated;
GRANT ALL ON public.plano_agendamentos_usos TO authenticated;
