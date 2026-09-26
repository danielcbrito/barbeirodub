CREATE TABLE IF NOT EXISTS public.plano_servicos (
  plano_id UUID NOT NULL REFERENCES public.planos(id) ON DELETE CASCADE,
  servico_id UUID NOT NULL REFERENCES public.servicos(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (plano_id, servico_id)
);

CREATE INDEX IF NOT EXISTS idx_plano_servicos_plano ON public.plano_servicos(plano_id);
CREATE INDEX IF NOT EXISTS idx_plano_servicos_servico ON public.plano_servicos(servico_id);

ALTER TABLE public.plano_servicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Plano servicos viewable by everyone authenticated"
  ON public.plano_servicos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Tenant admins can insert plano_servicos"
  ON public.plano_servicos FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.planos p
      WHERE p.id = plano_servicos.plano_id
        AND (
          public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'ti'::app_role)
          OR (p.tenant_id IS NOT NULL AND public.is_tenant_owner_by_tenant(p.tenant_id))
        )
    )
  );

CREATE POLICY "Tenant admins can delete plano_servicos"
  ON public.plano_servicos FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.planos p
      WHERE p.id = plano_servicos.plano_id
        AND (
          public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'ti'::app_role)
          OR (p.tenant_id IS NOT NULL AND public.is_tenant_owner_by_tenant(p.tenant_id))
        )
    )
  );

INSERT INTO public.plano_servicos (plano_id, servico_id)
SELECT id, servico_id
FROM public.planos
WHERE servico_id IS NOT NULL
ON CONFLICT DO NOTHING;
