CREATE POLICY "Staff read payments of assigned subscriptions" ON public.pagamentos FOR SELECT TO authenticated USING (
  assinatura_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.assinaturas s
    JOIN public.barbeiros b ON b.id = s.barbeiro_id
    WHERE s.id = pagamentos.assinatura_id
    AND (
      b.user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = b.tenant_id AND t.owner_user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = b.tenant_id AND tm.user_id = auth.uid() AND tm.role = 'admin')
    )
  )
);