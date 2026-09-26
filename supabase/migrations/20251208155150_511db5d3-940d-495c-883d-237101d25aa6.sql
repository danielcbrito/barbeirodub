
-- Criar tabela para exceções de horário em datas específicas
-- Permite que o barbeiro configure horários diferentes para dias específicos
-- Ex: Em 15/12/2025 só vai trabalhar das 14:00 às 20:00 (médico de manhã)

CREATE TABLE public.horarios_excepcionais (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data DATE NOT NULL,
  aberto BOOLEAN NOT NULL DEFAULT true,
  hora_abertura TIME WITHOUT TIME ZONE DEFAULT '09:00:00',
  hora_fechamento TIME WITHOUT TIME ZONE DEFAULT '20:00:00',
  hora_almoco_inicio TIME WITHOUT TIME ZONE DEFAULT NULL,
  hora_almoco_fim TIME WITHOUT TIME ZONE DEFAULT NULL,
  motivo TEXT DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Apenas uma exceção por data
  CONSTRAINT unique_data_excepcional UNIQUE (data)
);

-- Habilitar RLS
ALTER TABLE public.horarios_excepcionais ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins podem gerenciar exceções de horário"
  ON public.horarios_excepcionais
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Todos podem ver exceções de horário"
  ON public.horarios_excepcionais
  FOR SELECT
  USING (true);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_horarios_excepcionais_updated_at
  BEFORE UPDATE ON public.horarios_excepcionais
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Índice para busca por data
CREATE INDEX idx_horarios_excepcionais_data ON public.horarios_excepcionais(data);

-- Comentário explicativo
COMMENT ON TABLE public.horarios_excepcionais IS 'Exceções de horário para datas específicas. Sobrescreve configurações padrão do dia da semana.';
