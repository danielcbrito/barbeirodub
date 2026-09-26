-- Tabela de usuários TI com permissões
CREATE TABLE ti_usuarios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  email TEXT NOT NULL,
  nome TEXT,
  ativo BOOLEAN DEFAULT true,
  criado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de permissões por módulo
CREATE TABLE ti_permissoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  perm_clientes BOOLEAN DEFAULT false,
  perm_usuarios BOOLEAN DEFAULT false,
  perm_barbearias BOOLEAN DEFAULT false,
  perm_tenants BOOLEAN DEFAULT false,
  perm_agendamentos BOOLEAN DEFAULT false,
  perm_financeiro BOOLEAN DEFAULT false,
  perm_notificacoes BOOLEAN DEFAULT false,
  perm_webhooks BOOLEAN DEFAULT false,
  perm_dispositivos BOOLEAN DEFAULT false,
  perm_manutencao BOOLEAN DEFAULT false,
  perm_logs BOOLEAN DEFAULT false,
  perm_agendadas BOOLEAN DEFAULT false,
  perm_monitoramento BOOLEAN DEFAULT false,
  perm_suporte_ia BOOLEAN DEFAULT false,
  perm_impersonar BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- RLS
ALTER TABLE ti_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE ti_permissoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ti_admin_manage_ti_usuarios"
ON ti_usuarios FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'ti') OR 
  public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'ti') OR 
  public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "ti_admin_manage_ti_permissoes"
ON ti_permissoes FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'ti') OR 
  public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'ti') OR 
  public.has_role(auth.uid(), 'admin')
);

-- Trigger updated_at
CREATE TRIGGER set_ti_usuarios_updated_at
  BEFORE UPDATE ON ti_usuarios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_ti_permissoes_updated_at
  BEFORE UPDATE ON ti_permissoes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();