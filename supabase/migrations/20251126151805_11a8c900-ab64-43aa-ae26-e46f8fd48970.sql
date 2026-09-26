-- Inserir horário de funcionamento na tabela informacoes_empresa
INSERT INTO public.informacoes_empresa (categoria, chave, valor, ativo) VALUES
('horario', 'abertura', '09:00', true),
('horario', 'fechamento', '20:00', true),
('horario', 'almoco_inicio', '13:00', true),
('horario', 'almoco_fim', '14:00', true),
('horario', 'dias_funcionamento', 'Segunda a Sábado', true);

-- Adicionar comentário explicativo
COMMENT ON COLUMN public.informacoes_empresa.categoria IS 'Categorias: empresa, contato, localizacao, equipe, historia, programa, horario';