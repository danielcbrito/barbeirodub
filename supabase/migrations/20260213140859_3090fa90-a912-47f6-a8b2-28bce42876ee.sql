
-- Tabela para templates de mensagens editáveis
CREATE TABLE public.mensagem_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT,
  conteudo TEXT NOT NULL,
  variaveis_disponiveis TEXT[] DEFAULT '{}',
  categoria TEXT NOT NULL DEFAULT 'geral',
  ativo BOOLEAN NOT NULL DEFAULT true,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mensagem_templates ENABLE ROW LEVEL SECURITY;

-- Admins podem ler e editar
CREATE POLICY "Admins podem ler templates" ON public.mensagem_templates FOR SELECT USING (true);
CREATE POLICY "Admins podem editar templates" ON public.mensagem_templates FOR UPDATE USING (true);
CREATE POLICY "Admins podem inserir templates" ON public.mensagem_templates FOR INSERT WITH CHECK (true);

-- Trigger updated_at
CREATE TRIGGER update_mensagem_templates_updated_at
  BEFORE UPDATE ON public.mensagem_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Inserir templates padrão com mensagens estratégicas
INSERT INTO public.mensagem_templates (slug, nome, descricao, conteudo, variaveis_disponiveis, categoria) VALUES
(
  'lembrete_2h',
  'Lembrete 2h Antes',
  'Enviado automaticamente 2 horas antes do agendamento confirmado',
  E'Olá {nome}! 👋\n\nSeu horário é *hoje às {hora}* ✂️\n📅 {data}\n💈 {servico}{barbeiro}\n\n⚠️ *Não vai poder comparecer?*\nAbra o app agora e toque em "Remarcar" ou "Cancelar" para liberar o horário.\n\nTe esperamos! 💪',
  ARRAY['nome', 'hora', 'data', 'servico', 'barbeiro', 'preco'],
  'lembrete'
),
(
  'confirmacao_agendamento',
  'Confirmação de Agendamento',
  'Enviado quando um agendamento é confirmado pelo barbeiro',
  E'✅ *Agendamento confirmado!*\n\nOlá {nome}!\n\n📅 {data}\n⏰ {hora}\n✂️ {servico}{barbeiro}\n💰 {preco}\n\nTe esperamos! Não se atrase 😉',
  ARRAY['nome', 'hora', 'data', 'servico', 'barbeiro', 'preco'],
  'confirmacao'
),
(
  'cancelamento_agendamento',
  'Cancelamento de Agendamento',
  'Enviado quando um agendamento é cancelado',
  E'❌ *Agendamento cancelado*\n\nOlá {nome}, seu agendamento foi cancelado:\n\n📅 {data} às {hora}\n✂️ {servico}\n\nDeseja reagendar? Abra o app e escolha um novo horário! 📱',
  ARRAY['nome', 'hora', 'data', 'servico', 'barbeiro'],
  'cancelamento'
),
(
  'novo_agendamento',
  'Novo Agendamento Criado',
  'Enviado quando um novo agendamento é criado',
  E'📋 *Novo agendamento!*\n\nOlá {nome}!\n\n📅 {data}\n⏰ {hora}\n✂️ {servico}{barbeiro}\n💰 {preco}\n\nAguarde a confirmação do barbeiro. 🔔',
  ARRAY['nome', 'hora', 'data', 'servico', 'barbeiro', 'preco'],
  'agendamento'
);
