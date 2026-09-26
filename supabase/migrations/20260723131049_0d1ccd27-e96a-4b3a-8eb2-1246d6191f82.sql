
-- 1. Barber photos: drop broad policies (ownership-scoped ones remain)
DROP POLICY IF EXISTS "Barbeiros podem fazer upload de suas fotos" ON storage.objects;
DROP POLICY IF EXISTS "Barbeiros podem atualizar suas fotos" ON storage.objects;
DROP POLICY IF EXISTS "Barbeiros podem deletar suas fotos" ON storage.objects;

-- 2. Produto-fotos: require admin/tenant_admin role for uploads
DROP POLICY IF EXISTS "produto_fotos_insert_auth" ON storage.objects;
CREATE POLICY "produto_fotos_insert_owner"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'produto-fotos'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'tenant_admin'::app_role))
  );

-- 3. Barbeiros: revoke sensitive financial columns from anon
REVOKE SELECT (woovi_pix_key, woovi_subaccount_name, asaas_wallet_id, asaas_account_id, comissao_pct)
  ON public.barbeiros FROM anon;

-- 4. Tenants: revoke PII/contact columns from anon
REVOKE SELECT (cpf, cnpj, telefone, whatsapp, email) ON public.tenants FROM anon;

-- 5. Tenant unidades: restrict public policy to anon only and revoke PII from anon
DROP POLICY IF EXISTS "public_read_tenant_unidades" ON public.tenant_unidades;
CREATE POLICY "anon_read_tenant_unidades"
  ON public.tenant_unidades FOR SELECT TO anon
  USING (ativo = true);

REVOKE SELECT (cpf, cnpj) ON public.tenant_unidades FROM anon;
