-- RLS para role 'ti' acessar tabelas financeiras

CREATE POLICY "ti_read_all_pagamentos"
ON public.pagamentos FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'ti'));

CREATE POLICY "ti_read_all_saques"
ON public.saques FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'ti'));

CREATE POLICY "ti_read_all_depositos"
ON public.depositos FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'ti'));

CREATE POLICY "ti_update_saques"
ON public.saques FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'ti'));
