-- Create system_config table
CREATE TABLE IF NOT EXISTS public.system_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chave TEXT NOT NULL UNIQUE,
  valor TEXT,
  descricao TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ti_admin_manage_system_config"
ON public.system_config FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'ti')
  )
);

-- Pre-populate test account keys
INSERT INTO public.system_config (chave, descricao) VALUES
  ('test_tenant_id', 'ID do tenant de testes'),
  ('test_barber_owner_id', 'ID do dono da barbearia teste'),
  ('test_client_id', 'ID do cliente de teste'),
  ('test_barber_id', 'ID do barbeiro de teste')
ON CONFLICT (chave) DO NOTHING;