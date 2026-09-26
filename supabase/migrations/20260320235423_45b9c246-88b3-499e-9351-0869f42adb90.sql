
-- Tabela de logs de impersonação
CREATE TABLE public.ti_impersonation_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  operador_id UUID REFERENCES auth.users(id),
  operador_email TEXT NOT NULL,
  cliente_id UUID REFERENCES auth.users(id),
  cliente_nome TEXT,
  cliente_email TEXT,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  usado_em TIMESTAMPTZ,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_impersonation_token ON public.ti_impersonation_logs(token);
CREATE INDEX idx_impersonation_operador ON public.ti_impersonation_logs(operador_id);
CREATE INDEX idx_impersonation_expires ON public.ti_impersonation_logs(expires_at);

-- RLS
ALTER TABLE public.ti_impersonation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ti_admin_manage_impersonation"
ON public.ti_impersonation_logs FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'ti') OR 
  public.has_role(auth.uid(), 'admin')
);
