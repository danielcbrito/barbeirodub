ALTER TABLE public.n8n_chat_histories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.n8n_chat_histories FROM anon, authenticated;

DROP POLICY IF EXISTS agente_webhook_global_read ON public.agente_webhook_global;
CREATE POLICY agente_webhook_global_read
ON public.agente_webhook_global
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.barbeiros b
    JOIN public.tenants t ON t.id = b.tenant_id
    WHERE (b.user_id = auth.uid() OR t.owner_user_id = auth.uid())
      AND t.nome ILIKE '%dub%'
  )
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS authenticated_manage_discount_coupons ON public.discount_coupons;
CREATE POLICY admin_and_owner_read_discount_coupons
ON public.discount_coupons
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'ti')
  OR (tenant_id IS NOT NULL AND public.is_tenant_owner_by_tenant(tenant_id))
);
CREATE POLICY admin_and_owner_insert_discount_coupons
ON public.discount_coupons
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'ti')
  OR (tenant_id IS NOT NULL AND public.is_tenant_owner_by_tenant(tenant_id))
);
CREATE POLICY admin_and_owner_update_discount_coupons
ON public.discount_coupons
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'ti')
  OR (tenant_id IS NOT NULL AND public.is_tenant_owner_by_tenant(tenant_id))
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'ti')
  OR (tenant_id IS NOT NULL AND public.is_tenant_owner_by_tenant(tenant_id))
);
CREATE POLICY admin_and_owner_delete_discount_coupons
ON public.discount_coupons
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'ti')
  OR (tenant_id IS NOT NULL AND public.is_tenant_owner_by_tenant(tenant_id))
);

DROP POLICY IF EXISTS "Users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can upload owned avatars"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars' AND owner_id = (SELECT auth.uid())::text);
CREATE POLICY "Users can update owned avatars"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars' AND owner_id = (SELECT auth.uid())::text)
WITH CHECK (bucket_id = 'avatars' AND owner_id = (SELECT auth.uid())::text);
CREATE POLICY "Users can delete owned avatars"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'avatars' AND owner_id = (SELECT auth.uid())::text);

ALTER FUNCTION public.fn_sync_agendamento_cliente_nome() SET search_path = public;
ALTER FUNCTION public.get_admin_dashboard_fast(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.guard_barber_debt_release() SET search_path = public;
ALTER FUNCTION public.update_agendamento_cliente_nome(uuid, text) SET search_path = public;