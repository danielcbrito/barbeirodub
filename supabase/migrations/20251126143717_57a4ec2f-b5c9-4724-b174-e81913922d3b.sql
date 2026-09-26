-- ========================================
-- TABELA: informacoes_aplicativo
-- ========================================
CREATE TABLE public.informacoes_aplicativo (
  id SERIAL PRIMARY KEY,
  categoria VARCHAR(50) NOT NULL,
  chave VARCHAR(100) NOT NULL,
  titulo TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  ordem INTEGER DEFAULT 0,
  ativo BOOLEAN DEFAULT true,
  atualizado_em TIMESTAMP DEFAULT NOW(),
  atualizado_por UUID REFERENCES auth.users(id)
);

-- Inserir todas as informações do aplicativo
INSERT INTO public.informacoes_aplicativo (categoria, chave, titulo, conteudo, ordem) VALUES

-- CADASTRO E LOGIN
('cadastro', 'como_cadastrar', 'Como se cadastrar no aplicativo', 'Para se cadastrar na Barbearia DUB: 1) Abra o aplicativo e clique em "Criar Conta". 2) Preencha seu nome completo, CPF (sem pontos ou traços), telefone e crie uma senha forte. 3) Clique em "Cadastrar". 4) Você receberá um email de confirmação. Clique no link do email para ativar sua conta. 5) Após confirmar, faça login com seu email e senha.', 1),

('cadastro', 'problemas_cadastro', 'Problemas ao se cadastrar', 'Se você está tendo problemas para se cadastrar: 1) Verifique se o CPF está correto e sem pontos ou traços. 2) Certifique-se de que o email não está cadastrado. 3) A senha deve ter pelo menos 6 caracteres. 4) Verifique sua conexão com a internet. 5) Se o problema persistir, entre em contato pelo WhatsApp (11) 95226-3002.', 2),

('cadastro', 'recuperar_senha', 'Como recuperar sua senha', 'Para recuperar sua senha: 1) Na tela de login, clique em "Esqueceu sua senha?". 2) Digite o email cadastrado. 3) Você receberá um email com um link para redefinir a senha. 4) Clique no link e crie uma nova senha. 5) Faça login com a nova senha.', 3),

-- AGENDAMENTOS
('agendamento', 'como_agendar', 'Como agendar um corte', 'Para agendar seu corte: 1) Faça login no aplicativo. 2) Na tela inicial, clique em "Agendar Corte". 3) Escolha o serviço desejado (corte, barba, etc). 4) Selecione o barbeiro de sua preferência ou deixe automático. 5) Escolha a data e horário disponível. 6) Confirme os dados e finalize. 7) Você receberá uma confirmação por email e no app.', 1),

('agendamento', 'remarcar_agendamento', 'Como remarcar um agendamento', 'Para remarcar: 1) Acesse "Meus Agendamentos" no menu. 2) Encontre o agendamento que deseja remarcar. 3) Clique em "Remarcar". 4) Escolha nova data e horário. 5) Confirme a remarcação. Atenção: Só é possível remarcar com no mínimo 2 horas de antecedência.', 2),

('agendamento', 'cancelar_agendamento', 'Como cancelar um agendamento', 'Para cancelar: 1) Acesse "Meus Agendamentos". 2) Clique no agendamento desejado. 3) Clique em "Cancelar Agendamento". 4) Confirme o cancelamento. Atenção: Cancelamentos com menos de 2 horas de antecedência podem não gerar crédito de reembolso.', 3),

('agendamento', 'confirmacao_atendimento', 'Confirmação de atendimento', 'Após o corte ser realizado: 1) O barbeiro confirma o atendimento no sistema. 2) Você receberá uma notificação para confirmar também. 3) Após ambas confirmações, seu ponto de fidelidade é liberado automaticamente. 4) Você pode ver seu histórico em "Histórico de Agendamentos".', 4),

-- PLANOS E ASSINATURAS
('planos', 'como_assinar', 'Como assinar um plano mensal', 'Para assinar um plano: 1) Acesse o menu e clique em "Meus Planos". 2) Clique em "Assinar Plano". 3) Escolha o plano desejado (Basic, Pro ou Premium). 4) Revise os benefícios incluídos. 5) Escolha a forma de pagamento (cartão ou PIX). 6) Confirme a assinatura. 7) Você receberá confirmação por email.', 1),

('planos', 'beneficios_planos', 'Benefícios dos planos', 'Nossos planos oferecem: 1) Cortes ilimitados durante o mês (conforme limite do plano). 2) Prioridade no agendamento. 3) Descontos exclusivos. 4) Sem fila de espera. Plano Basic: até 4 cortes/mês por R$ 79,90. Plano Pro: até 8 cortes/mês por R$ 139,90. Plano Premium: cortes ilimitados por R$ 199,90.', 2),

('planos', 'cancelar_plano', 'Como cancelar um plano', 'Para cancelar seu plano: 1) Acesse "Meus Planos". 2) Clique no plano ativo. 3) Clique em "Cancelar Plano". 4) Confirme o cancelamento. Atenção: O plano permanece ativo até o fim do período pago. Você continuará tendo acesso aos benefícios até lá.', 3),

('planos', 'renovacao_plano', 'Renovação automática', 'Todos os planos são renovados automaticamente: 1) A cobrança ocorre no mesmo dia do mês em que você assinou. 2) Você receberá um lembrete 3 dias antes da renovação. 3) Se o pagamento falhar, você tem 5 dias para regularizar. 4) Após esse período, o plano é cancelado automaticamente.', 4),

-- PROGRAMA DE FIDELIDADE
('fidelidade', 'como_funciona_pontos', 'Como funciona o programa de pontos', 'Nosso programa de fidelidade: 1) A cada corte confirmado, você ganha 1 ponto. 2) Ao juntar 5 pontos, você ganha automaticamente 1 corte grátis. 3) O corte grátis fica disponível por 90 dias. 4) Você pode usar o corte grátis agendando normalmente e selecionando a opção "Usar Corte Grátis". 5) Cortes grátis não acumulam novos pontos.', 1),

('fidelidade', 'ver_pontos', 'Como ver meus pontos', 'Para ver seus pontos: 1) Na tela inicial, você verá um card com seus pontos atuais. 2) Clique em "Ver Detalhes" para ver histórico completo. 3) Lá você vê quantos pontos tem, quando ganhou cada ponto e quando expira seu corte grátis (se houver).', 2),

('fidelidade', 'usar_corte_gratis', 'Como usar o corte grátis', 'Para usar seu corte grátis: 1) Agende normalmente um horário. 2) Na tela de pagamento, selecione "Usar Corte Grátis". 3) Confirme o agendamento. 4) Seu corte grátis será descontado automaticamente. Atenção: Cortes grátis expiram em 90 dias após serem liberados.', 3),

-- PAGAMENTOS
('pagamento', 'formas_pagamento', 'Formas de pagamento aceitas', 'Aceitamos: 1) Cartão de crédito (pagamento processado pela plataforma Asaas). 2) PIX (você receberá um QR Code para pagar). 3) Dinheiro ou cartão na barbearia (opção disponível no agendamento). Todos os pagamentos online são processados com segurança através da Asaas.', 1),

('pagamento', 'pagamento_pendente', 'Pagamento pendente', 'Se seu pagamento está pendente: 1) Para PIX: você tem até 30 minutos para pagar após gerar o QR Code. 2) Para cartão: geralmente é aprovado em segundos, mas pode levar até 2 dias úteis. 3) Você receberá notificação quando o pagamento for confirmado. 4) Enquanto pendente, seu horário fica reservado.', 2),

('pagamento', 'reembolso', 'Política de reembolso', 'Sobre reembolsos: 1) Cancelamentos com mais de 24h de antecedência: reembolso total em créditos. 2) Cancelamentos entre 2h e 24h: reembolso de 50% em créditos. 3) Cancelamentos com menos de 2h: sem reembolso. 4) Créditos podem ser usados em futuros agendamentos e não expiram.', 3),

-- NOTIFICAÇÕES E LEMBRETES
('notificacoes', 'tipos_notificacoes', 'Tipos de notificações', 'Você receberá notificações sobre: 1) Confirmação de agendamento. 2) Lembrete 24h antes do horário. 3) Lembrete 2h antes do horário. 4) Confirmação de atendimento. 5) Pontos de fidelidade ganhos. 6) Corte grátis disponível. 7) Renovação de plano. 8) Promoções e novidades.', 1),

('notificacoes', 'gerenciar_notificacoes', 'Como gerenciar notificações', 'Para gerenciar notificações: 1) Acesse o menu e clique em "Meu Perfil". 2) Role até "Configurações de Notificações". 3) Ative ou desative os tipos de notificação desejados. 4) As alterações são salvas automaticamente. Recomendamos manter ativas pelo menos as notificações de lembrete.', 2),

-- PERFIL E DADOS
('perfil', 'atualizar_dados', 'Como atualizar meus dados', 'Para atualizar seus dados: 1) Acesse o menu e clique em "Meu Perfil". 2) Clique em "Editar Perfil". 3) Atualize as informações desejadas (nome, telefone, etc). 4) Clique em "Salvar". Atenção: O CPF não pode ser alterado. Para mudar email, entre em contato conosco.', 1),

('perfil', 'historico', 'Histórico de agendamentos', 'Para ver seu histórico: 1) Acesse o menu e clique em "Histórico". 2) Lá você verá todos os seus agendamentos passados. 3) Pode filtrar por status (concluído, cancelado, etc). 4) Clique em qualquer agendamento para ver detalhes completos. 5) Você pode também fazer download do histórico em PDF.', 2),

-- DÚVIDAS GERAIS
('geral', 'horario_funcionamento', 'Horário de funcionamento', 'A Barbearia DUB funciona de: Segunda a Sexta: 9h às 20h. Sábado: 9h às 18h. Domingo: Fechado. Feriados: Consulte no app, pois pode variar. Os horários disponíveis para agendamento já consideram nossa agenda atualizada.', 1),

('geral', 'servicos_oferecidos', 'Serviços oferecidos', 'Oferecemos: 1) Corte de cabelo (masculino e infantil). 2) Barba (aparar, fazer e finalizar). 3) Combo Corte + Barba. 4) Platinado/Luzes. 5) Sobrancelha. Todos os preços e durações estão disponíveis na tela de agendamento.', 2),

('geral', 'politica_atraso', 'Política de atraso', 'Sobre atrasos: 1) Se você atrasar mais de 15 minutos, seu horário pode ser perdido. 2) Tentaremos encaixar você, mas não podemos garantir. 3) Recomendamos chegar 5 minutos antes. 4) Se souber que vai atrasar, entre em contato pelo WhatsApp para tentarmos reagendar.', 3),

('geral', 'primeiro_acesso', 'Primeira vez usando o app', 'Bem-vindo à Barbearia DUB! Para começar: 1) Faça seu cadastro. 2) Confirme seu email. 3) Faça login. 4) Agende seu primeiro corte. 5) Você já começará a acumular pontos de fidelidade! Qualquer dúvida, estamos no WhatsApp (11) 95226-3002.', 4),

('geral', 'suporte', 'Como entrar em contato', 'Para falar conosco: WhatsApp: (11) 95226-3002. Email: barbeariasdub@gmail.com. Instagram: @tulio.dub. Endereço: Rua Ferrador, 108 - Cidade Ipava, São Paulo - SP. Horário de atendimento online: Segunda a Sexta, 9h às 20h.', 5);

-- ========================================
-- ÍNDICES PARA PERFORMANCE
-- ========================================
CREATE INDEX idx_info_app_categoria ON public.informacoes_aplicativo(categoria);
CREATE INDEX idx_info_app_chave ON public.informacoes_aplicativo(chave);
CREATE INDEX idx_info_app_ativo ON public.informacoes_aplicativo(ativo);
CREATE INDEX idx_info_app_ordem ON public.informacoes_aplicativo(ordem);

-- ========================================
-- ROW LEVEL SECURITY (RLS)
-- ========================================
ALTER TABLE public.informacoes_aplicativo ENABLE ROW LEVEL SECURITY;

-- Admins podem gerenciar todas as informações
CREATE POLICY "Admins can manage all app info"
ON public.informacoes_aplicativo
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Qualquer pessoa pode visualizar informações ativas (importante para agentes externos)
CREATE POLICY "Anyone can view active app info"
ON public.informacoes_aplicativo
FOR SELECT
USING (ativo = true);

-- ========================================
-- TRIGGER PARA ATUALIZAR TIMESTAMP
-- ========================================
CREATE TRIGGER update_informacoes_aplicativo_updated_at
BEFORE UPDATE ON public.informacoes_aplicativo
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();