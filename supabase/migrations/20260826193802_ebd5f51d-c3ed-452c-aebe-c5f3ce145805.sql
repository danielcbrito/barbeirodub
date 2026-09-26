
ALTER TABLE public.ai_agents DROP CONSTRAINT IF EXISTS ai_agents_barbershop_id_fkey;
ALTER TABLE public.ai_agents
  ADD CONSTRAINT ai_agents_barbeiro_fkey FOREIGN KEY (barbershop_id) REFERENCES public.barbeiros(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS ai_agents_barbershop_id_key ON public.ai_agents (barbershop_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agents TO authenticated;
GRANT ALL ON public.ai_agents TO service_role;

DROP POLICY IF EXISTS "Barbers manage own ai agent" ON public.ai_agents;
CREATE POLICY "Barbers manage own ai agent" ON public.ai_agents
FOR ALL TO authenticated
USING (barbershop_id IN (SELECT b.id FROM public.barbeiros b WHERE b.user_id = auth.uid()))
WITH CHECK (barbershop_id IN (SELECT b.id FROM public.barbeiros b WHERE b.user_id = auth.uid()));

DROP POLICY IF EXISTS "Tenant owners manage tenant ai agents" ON public.ai_agents;
CREATE POLICY "Tenant owners manage tenant ai agents" ON public.ai_agents
FOR ALL TO authenticated
USING (barbershop_id IN (
  SELECT b.id FROM public.barbeiros b
  WHERE b.tenant_id IN (SELECT t.id FROM public.tenants t WHERE t.owner_user_id = auth.uid())
))
WITH CHECK (barbershop_id IN (
  SELECT b.id FROM public.barbeiros b
  WHERE b.tenant_id IN (SELECT t.id FROM public.tenants t WHERE t.owner_user_id = auth.uid())
));

DROP POLICY IF EXISTS "Admins manage all ai agents" ON public.ai_agents;
CREATE POLICY "Admins manage all ai agents" ON public.ai_agents
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'ti'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'ti'::public.app_role));
