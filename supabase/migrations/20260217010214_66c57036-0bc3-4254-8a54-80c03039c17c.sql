
-- Tabela para armazenar contas bancárias dos usuários (para saques via Asaas)
CREATE TABLE public.contas_bancarias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  barbeiro_id UUID REFERENCES public.barbeiros(id) ON DELETE CASCADE,
  
  -- Dados do banco (formato Asaas API)
  banco_codigo TEXT NOT NULL,         -- Código do banco (ex: "237" = Bradesco)
  banco_nome TEXT,                     -- Nome do banco (exibição)
  titular_nome TEXT NOT NULL,          -- ownerName
  titular_cpf_cnpj TEXT NOT NULL,      -- cpfCnpj
  agencia TEXT NOT NULL,               -- agency
  conta TEXT NOT NULL,                 -- account
  conta_digito TEXT NOT NULL,          -- accountDigit
  tipo_conta TEXT NOT NULL DEFAULT 'CONTA_CORRENTE', -- CONTA_CORRENTE ou CONTA_POUPANCA
  
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.contas_bancarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem ver suas próprias contas"
  ON public.contas_bancarias FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem criar suas próprias contas"
  ON public.contas_bancarias FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar suas próprias contas"
  ON public.contas_bancarias FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar suas próprias contas"
  ON public.contas_bancarias FOR DELETE
  USING (auth.uid() = user_id);

-- Index
CREATE INDEX idx_contas_bancarias_user ON public.contas_bancarias(user_id);

-- Trigger para updated_at
CREATE TRIGGER update_contas_bancarias_updated_at
  BEFORE UPDATE ON public.contas_bancarias
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
