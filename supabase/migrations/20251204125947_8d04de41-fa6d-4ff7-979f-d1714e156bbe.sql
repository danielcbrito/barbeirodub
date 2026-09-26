-- Tabela para configuração do webhook
CREATE TABLE public.webhook_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_url text,
  ativo boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Inserir configuração padrão (vazia)
INSERT INTO public.webhook_config (id, webhook_url, ativo) 
VALUES (gen_random_uuid(), null, true);

-- Enable RLS
ALTER TABLE public.webhook_config ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Admins podem gerenciar webhook config"
ON public.webhook_config
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Todos podem ver webhook config para enviar eventos"
ON public.webhook_config
FOR SELECT
USING (true);

-- Trigger para updated_at
CREATE TRIGGER update_webhook_config_updated_at
BEFORE UPDATE ON public.webhook_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();