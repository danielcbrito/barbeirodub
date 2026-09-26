-- Criar tabela de configurações de horário de funcionamento
CREATE TABLE public.configuracoes_horario (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dia_semana integer NOT NULL, -- 0=Domingo, 1=Segunda, ..., 6=Sábado
  aberto boolean NOT NULL DEFAULT true,
  hora_abertura time NOT NULL DEFAULT '09:00',
  hora_fechamento time NOT NULL DEFAULT '20:00',
  hora_almoco_inicio time DEFAULT '13:00',
  hora_almoco_fim time DEFAULT '14:00',
  delay_entre_servicos integer NOT NULL DEFAULT 10, -- minutos
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(dia_semana)
);

-- Habilitar RLS
ALTER TABLE public.configuracoes_horario ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Admins podem gerenciar configurações"
ON public.configuracoes_horario FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Todos podem ver configurações"
ON public.configuracoes_horario FOR SELECT
USING (true);

-- Inserir configurações padrão para cada dia da semana
INSERT INTO public.configuracoes_horario (dia_semana, aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, delay_entre_servicos)
VALUES 
  (0, false, '09:00', '20:00', '13:00', '14:00', 10), -- Domingo (fechado)
  (1, true, '09:00', '20:00', '13:00', '14:00', 10),  -- Segunda
  (2, true, '09:00', '20:00', '13:00', '14:00', 10),  -- Terça
  (3, true, '09:00', '21:00', '13:00', '14:00', 10),  -- Quarta (até 21h)
  (4, true, '09:00', '21:00', '13:00', '14:00', 10),  -- Quinta (até 21h)
  (5, true, '09:00', '21:00', '13:00', '14:00', 10),  -- Sexta (até 21h)
  (6, true, '09:00', '21:00', '13:00', '14:00', 10);  -- Sábado (até 21h)

-- Trigger para updated_at
CREATE TRIGGER update_configuracoes_horario_updated_at
BEFORE UPDATE ON public.configuracoes_horario
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();