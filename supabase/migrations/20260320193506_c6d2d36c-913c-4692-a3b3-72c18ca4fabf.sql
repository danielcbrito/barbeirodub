-- RLS Policies para role 'ti' — acesso de leitura total

-- 1. profiles
CREATE POLICY "ti_read_all_profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'ti'));

-- 2. agendamentos
CREATE POLICY "ti_read_all_agendamentos"
ON public.agendamentos FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'ti'));

-- 3. creditos
CREATE POLICY "ti_read_all_creditos"
ON public.creditos FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'ti'));

-- 4. pontos
CREATE POLICY "ti_read_all_pontos"
ON public.pontos FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'ti'));

-- 5. user_roles
CREATE POLICY "ti_read_all_user_roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'ti'));

-- 6. wallet_balances
CREATE POLICY "ti_read_all_wallet_balances"
ON public.wallet_balances FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'ti'));

-- 7. tenants
CREATE POLICY "ti_read_all_tenants"
ON public.tenants FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'ti'));

-- 8. barbeiros
CREATE POLICY "ti_read_all_barbeiros"
ON public.barbeiros FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'ti'));

-- 9. audit_logs
CREATE POLICY "ti_read_all_audit_logs"
ON public.audit_logs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'ti'));

-- 10. ti_mudancas_agendadas
CREATE POLICY "ti_read_all_mudancas"
ON public.ti_mudancas_agendadas FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'ti'));

CREATE POLICY "ti_insert_mudancas"
ON public.ti_mudancas_agendadas FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'ti'));

CREATE POLICY "ti_update_mudancas"
ON public.ti_mudancas_agendadas FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'ti'));