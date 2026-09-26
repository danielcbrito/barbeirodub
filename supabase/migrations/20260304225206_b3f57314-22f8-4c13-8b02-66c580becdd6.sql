
-- Tabela de portfólio de cortes
CREATE TABLE public.portfolio_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbeiro_id UUID NOT NULL REFERENCES public.barbeiros(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  caption TEXT,
  ordem INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index para consultas rápidas
CREATE INDEX idx_portfolio_barbeiro ON public.portfolio_images(barbeiro_id);
CREATE INDEX idx_portfolio_tenant ON public.portfolio_images(tenant_id);

-- Trigger para updated_at
CREATE TRIGGER set_portfolio_updated_at
  BEFORE UPDATE ON public.portfolio_images
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.portfolio_images ENABLE ROW LEVEL SECURITY;

-- Leitura pública (landing page)
CREATE POLICY "portfolio_select_public"
  ON public.portfolio_images FOR SELECT
  USING (true);

-- Barbeiro pode inserir/editar/deletar suas próprias imagens
CREATE POLICY "portfolio_insert_own"
  ON public.portfolio_images FOR INSERT
  TO authenticated
  WITH CHECK (
    barbeiro_id IN (
      SELECT id FROM public.barbeiros WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "portfolio_update_own"
  ON public.portfolio_images FOR UPDATE
  TO authenticated
  USING (
    barbeiro_id IN (
      SELECT id FROM public.barbeiros WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "portfolio_delete_own"
  ON public.portfolio_images FOR DELETE
  TO authenticated
  USING (
    barbeiro_id IN (
      SELECT id FROM public.barbeiros WHERE user_id = auth.uid()
    )
  );

-- Admin pode gerenciar imagens de qualquer barbeiro do seu tenant
CREATE POLICY "portfolio_admin_insert"
  ON public.portfolio_images FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
    )
    OR
    EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = portfolio_images.tenant_id AND t.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "portfolio_admin_update"
  ON public.portfolio_images FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
    )
    OR
    EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = portfolio_images.tenant_id AND t.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "portfolio_admin_delete"
  ON public.portfolio_images FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
    )
    OR
    EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = portfolio_images.tenant_id AND t.owner_user_id = auth.uid()
    )
  );

-- Storage bucket para portfólio
INSERT INTO storage.buckets (id, name, public)
VALUES ('portfolio', 'portfolio', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage
CREATE POLICY "portfolio_storage_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'portfolio');

CREATE POLICY "portfolio_storage_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'portfolio');

CREATE POLICY "portfolio_storage_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'portfolio');

CREATE POLICY "portfolio_storage_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'portfolio');

-- Habilitar realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.portfolio_images;
