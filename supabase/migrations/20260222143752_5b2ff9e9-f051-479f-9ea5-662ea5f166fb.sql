
-- Tenant admins podem gerenciar exceções de horário globais da barbearia
CREATE POLICY "Tenant admins podem gerenciar exceções de horário"
ON public.horarios_excepcionais
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'tenant_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'tenant_admin'::app_role));

-- Tenant admins podem gerenciar exceções de horário dos barbeiros do tenant
CREATE POLICY "Tenant admin can manage tenant barber exceptional hours"
ON public.horarios_excepcionais_barbeiro
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM barbeiros b
    WHERE b.id = horarios_excepcionais_barbeiro.barbeiro_id
      AND b.tenant_id IS NOT NULL
      AND b.tenant_id = (SELECT id FROM tenants WHERE owner_user_id = auth.uid() LIMIT 1)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM barbeiros b
    WHERE b.id = horarios_excepcionais_barbeiro.barbeiro_id
      AND b.tenant_id IS NOT NULL
      AND b.tenant_id = (SELECT id FROM tenants WHERE owner_user_id = auth.uid() LIMIT 1)
  )
);
