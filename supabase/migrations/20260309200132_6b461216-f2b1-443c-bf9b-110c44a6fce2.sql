
-- ═══════════════════════════════════════════════════
-- Junction table: barbeiro ↔ unidade (multi-unit)
-- Permite que um barbeiro trabalhe em várias unidades
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.barbeiro_unidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbeiro_id UUID NOT NULL REFERENCES public.barbeiros(id) ON DELETE CASCADE,
  unidade_id UUID NOT NULL REFERENCES public.tenant_unidades(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (barbeiro_id, unidade_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_barbeiro_unidades_barbeiro ON public.barbeiro_unidades(barbeiro_id);
CREATE INDEX IF NOT EXISTS idx_barbeiro_unidades_unidade ON public.barbeiro_unidades(unidade_id);

-- RLS
ALTER TABLE public.barbeiro_unidades ENABLE ROW LEVEL SECURITY;

-- Admin global pode tudo
CREATE POLICY "admin_full_access_barbeiro_unidades"
  ON public.barbeiro_unidades FOR ALL
  TO authenticated
  USING (public.is_admin());

-- Tenant admin pode gerenciar vínculos dos barbeiros do seu tenant
CREATE POLICY "tenant_admin_manage_barbeiro_unidades"
  ON public.barbeiro_unidades FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.barbeiros b
      JOIN public.tenants t ON t.id = b.tenant_id
      WHERE b.id = barbeiro_unidades.barbeiro_id
        AND t.owner_user_id = auth.uid()
    )
  );

-- Barbeiro pode ver seus próprios vínculos
CREATE POLICY "barber_view_own_barbeiro_unidades"
  ON public.barbeiro_unidades FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.barbeiros b
      WHERE b.id = barbeiro_unidades.barbeiro_id
        AND b.user_id = auth.uid()
    )
  );
