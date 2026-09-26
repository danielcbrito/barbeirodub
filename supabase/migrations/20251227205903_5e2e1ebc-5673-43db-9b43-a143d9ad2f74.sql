
-- Criar tabela para armazenar relatórios mensais gerados pela IA
CREATE TABLE public.relatorios_mensais (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mes INTEGER NOT NULL CHECK (mes >= 1 AND mes <= 12),
  ano INTEGER NOT NULL CHECK (ano >= 2020 AND ano <= 2100),
  
  -- Dados financeiros
  receita_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  receita_app NUMERIC(10,2) NOT NULL DEFAULT 0,
  receita_barbearia NUMERIC(10,2) NOT NULL DEFAULT 0,
  receita_credito NUMERIC(10,2) NOT NULL DEFAULT 0,
  receita_plano NUMERIC(10,2) NOT NULL DEFAULT 0,
  taxas_asaas NUMERIC(10,2) NOT NULL DEFAULT 0,
  lucro_liquido NUMERIC(10,2) NOT NULL DEFAULT 0,
  
  -- Dados de atendimento
  total_agendamentos INTEGER NOT NULL DEFAULT 0,
  agendamentos_completados INTEGER NOT NULL DEFAULT 0,
  agendamentos_cancelados INTEGER NOT NULL DEFAULT 0,
  agendamentos_no_show INTEGER NOT NULL DEFAULT 0,
  
  -- Comparação com mês anterior
  variacao_receita_percentual NUMERIC(5,2) DEFAULT 0,
  variacao_agendamentos_percentual NUMERIC(5,2) DEFAULT 0,
  
  -- Resumo gerado por IA
  resumo_ia TEXT,
  insights_ia JSONB,
  
  -- Metadados
  gerado_automaticamente BOOLEAN NOT NULL DEFAULT false,
  arquivo_pdf_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Garantir unicidade por mês/ano
  CONSTRAINT unique_mes_ano UNIQUE (mes, ano)
);

-- Enable RLS
ALTER TABLE public.relatorios_mensais ENABLE ROW LEVEL SECURITY;

-- Apenas admins podem ver e gerenciar relatórios
CREATE POLICY "Admins can view reports"
  ON public.relatorios_mensais
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert reports"
  ON public.relatorios_mensais
  FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update reports"
  ON public.relatorios_mensais
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger para updated_at
CREATE TRIGGER update_relatorios_mensais_updated_at
  BEFORE UPDATE ON public.relatorios_mensais
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Índice para busca rápida
CREATE INDEX idx_relatorios_mensais_ano_mes ON public.relatorios_mensais (ano DESC, mes DESC);
