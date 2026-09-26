
CREATE POLICY "ti_admin_read_servicos"
ON servicos FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'ti') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ti_admin_read_unidades"
ON tenant_unidades FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'ti') OR public.has_role(auth.uid(), 'admin'));
