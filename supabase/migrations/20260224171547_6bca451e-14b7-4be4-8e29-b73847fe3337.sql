
-- Tabela para armazenar instâncias WhatsApp de cada barbeiro
CREATE TABLE public.whatsapp_instances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  barbeiro_id UUID NOT NULL REFERENCES public.barbeiros(id) ON DELETE CASCADE,
  instance_name TEXT NOT NULL,
  api_key TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected', 'connecting', 'connected', 'failed')),
  qrcode_base64 TEXT,
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(barbeiro_id),
  UNIQUE(instance_name)
);

-- RLS
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

-- Admin pode ver tudo
CREATE POLICY "Admins can manage all whatsapp instances"
  ON public.whatsapp_instances
  FOR ALL
  USING (public.is_admin());

-- Barbeiro pode ver/editar a própria instância
CREATE POLICY "Barbers can view own instance"
  ON public.whatsapp_instances
  FOR SELECT
  USING (
    barbeiro_id IN (
      SELECT b.id FROM public.barbeiros b WHERE b.user_id = auth.uid()
    )
  );

CREATE POLICY "Barbers can update own instance"
  ON public.whatsapp_instances
  FOR UPDATE
  USING (
    barbeiro_id IN (
      SELECT b.id FROM public.barbeiros b WHERE b.user_id = auth.uid()
    )
  );

CREATE POLICY "Barbers can insert own instance"
  ON public.whatsapp_instances
  FOR INSERT
  WITH CHECK (
    barbeiro_id IN (
      SELECT b.id FROM public.barbeiros b WHERE b.user_id = auth.uid()
    )
  );

-- Tenant admins podem gerenciar instâncias dos seus barbeiros
CREATE POLICY "Tenant admins can manage tenant barber instances"
  ON public.whatsapp_instances
  FOR ALL
  USING (
    barbeiro_id IN (
      SELECT b.id FROM public.barbeiros b
      WHERE b.tenant_id IN (
        SELECT t.id FROM public.tenants t WHERE t.owner_user_id = auth.uid()
      )
    )
  );

-- Trigger para updated_at
CREATE TRIGGER set_whatsapp_instances_updated_at
  BEFORE UPDATE ON public.whatsapp_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
