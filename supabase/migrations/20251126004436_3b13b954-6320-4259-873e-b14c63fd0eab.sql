-- ========================================
-- TABELA: informacoes_empresa
-- ========================================
CREATE TABLE public.informacoes_empresa (
  id SERIAL PRIMARY KEY,
  categoria VARCHAR(50) NOT NULL,
  chave VARCHAR(100) NOT NULL,
  valor TEXT NOT NULL,
  ativo BOOLEAN DEFAULT true,
  atualizado_em TIMESTAMP DEFAULT NOW()
);

-- Inserir todas as informações da empresa
INSERT INTO public.informacoes_empresa (categoria, chave, valor) VALUES
-- DADOS DA EMPRESA
('empresa', 'nome', 'Barbearia DUB'),
('empresa', 'slogan', 'Transformando seu visual desde 2015'),
('empresa', 'site', 'https://barbeariadub.com.br/'),

-- CONTATO
('contato', 'email', 'barbeariasdub@gmail.com'),
('contato', 'telefone', '(11) 95226-3002'),
('contato', 'whatsapp', '(11) 95226-3002'),
('contato', 'site_completo', 'https://barbeariadub.com.br/'),

-- LOCALIZAÇÃO
('localizacao', 'endereco_completo', 'Rua Ferrador, 108 – Cidade Ipava'),
('localizacao', 'rua', 'Rua Ferrador'),
('localizacao', 'numero', '108'),
('localizacao', 'bairro', 'Cidade Ipava'),
('localizacao', 'cidade', 'São Paulo'),
('localizacao', 'estado', 'SP'),
('localizacao', 'referencia', 'Localização de fácil acesso no coração da Cidade Ipava'),

-- EQUIPE/BARBEIROS
('equipe', 'barbeiro_principal', 'Túlio'),
('equipe', 'barbeiro_tulio_instagram', '@tulio.dub'),
('equipe', 'fundador', 'Fundador desde 2015'),

-- HISTÓRIA DA BARBEARIA
('historia', 'sobre', 'Desde 2015, o fundador da Barbearia DUB vem dedicando seu talento e paixão ao universo da barbearia. Apaixonado pela arte de transformar visuais e elevar a autoestima de cada cliente. Em 2018, abriu sua própria barbearia no coração da Cidade Ipava. Desde então, a Barbearia DUB se tornou referência no bairro.'),
('historia', 'ano_fundacao', '2015'),
('historia', 'ano_abertura_loja', '2018'),
('historia', 'clientes_atendidos', 'Mais de 10 mil clientes atendidos'),
('historia', 'diferenciais', 'Entregar o melhor corte, com atenção aos detalhes e um ambiente acolhedor para todos'),
('historia', 'missao', 'Transformar visuais e elevar a autoestima de cada cliente'),

-- PROGRAMA DE PONTOS
('programa', 'pontos_regra', 'A cada 5 cortes você ganha 5 pontos e leva 1 corte grátis'),
('programa', 'como_funciona', 'Economize com nossos planos mensais e mantenha seu visual sempre em dia'),
('programa', 'economia_mensal', 'Economize até R$ 50 por mês com nossos planos'),
('programa', 'beneficio_1', 'Tenha preferência no agendamento'),
('programa', 'beneficio_2', 'Cortes e barbas ilimitados durante o mês');

-- ========================================
-- ÍNDICES PARA PERFORMANCE
-- ========================================
CREATE INDEX idx_informacoes_categoria ON public.informacoes_empresa(categoria);
CREATE INDEX idx_informacoes_chave ON public.informacoes_empresa(chave);

-- ========================================
-- ROW LEVEL SECURITY (RLS)
-- ========================================
ALTER TABLE public.informacoes_empresa ENABLE ROW LEVEL SECURITY;

-- Admins podem gerenciar todas as informações da empresa
CREATE POLICY "Admins can manage all company info"
ON public.informacoes_empresa
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Qualquer pessoa pode visualizar informações ativas
CREATE POLICY "Anyone can view active company info"
ON public.informacoes_empresa
FOR SELECT
USING (ativo = true);