import { supabase } from "@/integrations/supabase/client";

/**
 * Formata o número de telefone no padrão WhatsApp: NUMERO@s.whatsapp.net
 * - Remove tudo que não for número
 * - Adiciona DDI 55 se não tiver
 * - Nunca coloca +
 * - Sempre termina com @s.whatsapp.net
 */
function formatPhoneForWhatsApp(phone: string | null | undefined): string {
  if (!phone) return '';
  
  // Remove tudo que não for número
  let cleaned = phone.replace(/\D/g, '');
  
  // Se o número estiver vazio após limpeza, retorna vazio
  if (!cleaned) return '';
  
  // Se não começar com 55 (DDI Brasil), adiciona
  if (!cleaned.startsWith('55')) {
    cleaned = '55' + cleaned;
  }
  
  // Retorna no formato WhatsApp
  return `${cleaned}@s.whatsapp.net`;
}

/**
 * Interface completa para dados de evento de webhook
 * Contém TODOS os dados relevantes para integração externa (WhatsApp, n8n, etc.)
 */
interface WebhookEventData {
  // Identificação do evento
  evento: string;
  evento_id?: string;
  descricao?: string;
  timestamp?: string;

  // Dados do agendamento
  agendamento_id?: string;
  data?: string;
  hora?: string;
  duracao_minutos?: number;
  status?: string;
  tipo_agendamento?: string;
  observacoes?: string;

  // Dados do serviço
  servico_id?: string;
  servico?: string;
  
  // Dados financeiros
  preco?: number;
  valor_total?: number;
  valor_pago_app?: number;
  valor_pago_creditos?: number;
  metodo_pagamento?: string;
  saldo_creditos_restante?: number;

  // Dados do cliente
  cliente_id?: string;
  cliente_nome?: string;
  cliente_telefone?: string;
  cliente_telefone_whatsapp?: string; // Formato: NUMERO@s.whatsapp.net
  cliente_email?: string;
  cliente_cpf?: string;

  // Dados do barbeiro
  barbeiro_id?: string;
  barbeiro_nome?: string;

  // Mensagens e detalhes extras
  mensagem_barbeiro?: string;
  mensagem?: string;
  motivo?: string;
  detalhes?: Record<string, unknown>;
}

/**
 * Função auxiliar para buscar dados completos do cliente
 * Retorna telefone normal E telefone formatado para WhatsApp
 */
async function getClienteCompleto(clienteId: string): Promise<{
  nome: string;
  telefone: string | null;
  telefone_whatsapp: string;
  email: string | null;
  cpf: string | null;
}> {
  try {
    // Buscar profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('nome, telefone, cpf')
      .eq('id', clienteId)
      .single();

    // Tentar buscar email do auth (via edge function se necessário)
    let email: string | null = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && user.id === clienteId) {
        email = user.email || null;
      }
    } catch {
      // Ignorar erro de auth
    }

    const telefone = profile?.telefone || null;

    return {
      nome: profile?.nome || 'Cliente',
      telefone: telefone,
      telefone_whatsapp: formatPhoneForWhatsApp(telefone),
      email: email,
      cpf: profile?.cpf || null,
    };
  } catch (error) {
    console.error('[webhookService] Erro ao buscar cliente:', error);
    return { nome: 'Cliente', telefone: null, telefone_whatsapp: '', email: null, cpf: null };
  }
}

/**
 * Função auxiliar para buscar dados do barbeiro
 */
async function getBarbeiroCompleto(barbeiroId: string): Promise<{
  nome: string;
  id: string;
}> {
  try {
    const { data: barbeiro } = await supabase
      .from('barbeiros')
      .select('id, apelido')
      .eq('id', barbeiroId)
      .single();

    return {
      id: barbeiro?.id || barbeiroId,
      nome: barbeiro?.apelido || 'Barbeiro',
    };
  } catch (error) {
    console.error('[webhookService] Erro ao buscar barbeiro:', error);
    return { id: barbeiroId, nome: 'Barbeiro' };
  }
}

/**
 * Função auxiliar para buscar saldo de créditos do cliente
 */
async function getSaldoCreditos(userId: string): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('get_user_available_credits', { p_user_id: userId });
    if (error) throw error;
    return Number(data) || 0;
  } catch (error) {
    console.error('[webhookService] Erro ao buscar saldo:', error);
    return 0;
  }
}

/**
 * Envia um evento para o webhook configurado
 * Não bloqueia o fluxo principal em caso de erro
 */
export async function sendWebhookEvent(eventData: WebhookEventData): Promise<void> {
  try {
    console.log('[webhookService] Enviando evento:', eventData.evento);
    
    // Gerar ID único do evento
    const eventoId = crypto.randomUUID();
    
    const payload = {
      ...eventData,
      evento_id: eventoId,
      timestamp: new Date().toISOString()
    };

    const { data, error } = await supabase.functions.invoke('send-webhook-event', {
      body: payload
    });

    if (error) {
      console.error('[webhookService] Erro ao enviar evento:', error);
      return;
    }

    if (data?.success) {
      console.log('[webhookService] Evento enviado com sucesso:', eventData.evento);
    } else {
      console.warn('[webhookService] Webhook não configurado ou falhou:', data?.error);
    }
  } catch (error) {
    // Não propaga o erro para não bloquear o fluxo principal
    console.error('[webhookService] Erro inesperado:', error);
  }
}

// ============================================================
// EVENTOS DE AGENDAMENTO
// ============================================================

/**
 * Evento: Novo agendamento criado pelo cliente
 */
export async function sendNovoAgendamentoEvent(data: {
  agendamento_id: string;
  cliente_id: string;
  cliente_nome: string;
  cliente_telefone?: string;
  cliente_email?: string;
  servico: string;
  servico_id?: string;
  data: string;
  hora: string;
  duracao_minutos?: number;
  preco: number;
  metodo_pagamento?: string;
  barbeiro_id?: string;
  barbeiro_nome?: string;
  tipo_agendamento?: string;
  observacoes?: string;
}): Promise<void> {
  const cliente = await getClienteCompleto(data.cliente_id);
  const saldoCreditos = await getSaldoCreditos(data.cliente_id);
  
  let barbeiro = { id: '', nome: '' };
  if (data.barbeiro_id) {
    barbeiro = await getBarbeiroCompleto(data.barbeiro_id);
  }

  await sendWebhookEvent({
    evento: 'agendamento_criado',
    descricao: 'Cliente criou um novo agendamento',
    status: 'pendente',
    
    agendamento_id: data.agendamento_id,
    data: data.data,
    hora: data.hora,
    duracao_minutos: data.duracao_minutos,
    tipo_agendamento: data.tipo_agendamento || 'normal',
    observacoes: data.observacoes,
    
    servico: data.servico,
    servico_id: data.servico_id,
    
    valor_total: data.preco,
    preco: data.preco,
    metodo_pagamento: data.metodo_pagamento,
    saldo_creditos_restante: saldoCreditos,
    
    cliente_id: data.cliente_id,
    cliente_nome: cliente.nome,
    cliente_telefone: cliente.telefone || data.cliente_telefone,
    cliente_telefone_whatsapp: cliente.telefone_whatsapp || formatPhoneForWhatsApp(data.cliente_telefone),
    cliente_email: cliente.email || data.cliente_email,
    cliente_cpf: cliente.cpf,
    
    barbeiro_id: barbeiro.id || data.barbeiro_id,
    barbeiro_nome: barbeiro.nome || data.barbeiro_nome,
  });
}

/**
 * Evento: Barbeiro confirmou o agendamento
 */
export async function sendAgendamentoConfirmadoEvent(data: {
  agendamento_id: string;
  cliente_id: string;
  cliente_nome?: string;
  servico: string;
  data: string;
  hora: string;
  preco: number;
  barbeiro_id?: string;
}): Promise<void> {
  const cliente = await getClienteCompleto(data.cliente_id);
  let barbeiro = { id: '', nome: '' };
  if (data.barbeiro_id) {
    barbeiro = await getBarbeiroCompleto(data.barbeiro_id);
  }

  await sendWebhookEvent({
    evento: 'agendamento_confirmado',
    descricao: 'Barbeiro confirmou o agendamento',
    status: 'confirmado',
    
    agendamento_id: data.agendamento_id,
    data: data.data,
    hora: data.hora,
    
    servico: data.servico,
    valor_total: data.preco,
    preco: data.preco,
    
    cliente_id: data.cliente_id,
    cliente_nome: cliente.nome,
    cliente_telefone: cliente.telefone,
    cliente_telefone_whatsapp: cliente.telefone_whatsapp,
    cliente_email: cliente.email,
    
    barbeiro_id: barbeiro.id || data.barbeiro_id,
    barbeiro_nome: barbeiro.nome,
  });
}

/**
 * Evento: Agendamento cancelado
 */
export async function sendAgendamentoCanceladoEvent(data: {
  agendamento_id: string;
  cliente_id: string;
  cliente_nome?: string;
  servico?: string;
  data?: string;
  hora?: string;
  preco?: number;
  mensagem_barbeiro?: string;
  motivo?: string;
  cancelado_por?: 'cliente' | 'barbeiro' | 'admin';
  credito_gerado?: number;
  barbeiro_id?: string;
}): Promise<void> {
  const cliente = await getClienteCompleto(data.cliente_id);
  const saldoCreditos = await getSaldoCreditos(data.cliente_id);
  let barbeiro = { id: '', nome: '' };
  if (data.barbeiro_id) {
    barbeiro = await getBarbeiroCompleto(data.barbeiro_id);
  }

  await sendWebhookEvent({
    evento: 'agendamento_cancelado',
    descricao: `Agendamento cancelado ${data.cancelado_por === 'cliente' ? 'pelo cliente' : data.cancelado_por === 'barbeiro' ? 'pelo barbeiro' : 'pelo administrador'}`,
    status: 'cancelado',
    
    agendamento_id: data.agendamento_id,
    data: data.data,
    hora: data.hora,
    
    servico: data.servico,
    valor_total: data.preco,
    
    cliente_id: data.cliente_id,
    cliente_nome: cliente.nome,
    cliente_telefone: cliente.telefone,
    cliente_telefone_whatsapp: cliente.telefone_whatsapp,
    cliente_email: cliente.email,
    
    barbeiro_id: barbeiro.id || data.barbeiro_id,
    barbeiro_nome: barbeiro.nome,
    
    mensagem_barbeiro: data.mensagem_barbeiro,
    motivo: data.motivo,
    
    saldo_creditos_restante: saldoCreditos,
    detalhes: {
      cancelado_por: data.cancelado_por,
      credito_gerado: data.credito_gerado,
    },
  });
}

/**
 * Evento: Barbeiro solicitou remarcação
 */
export async function sendRemarcacaoSolicitadaEvent(data: {
  agendamento_id: string;
  cliente_id: string;
  cliente_nome?: string;
  servico?: string;
  data?: string;
  hora?: string;
  mensagem_barbeiro: string;
  barbeiro_id?: string;
}): Promise<void> {
  const cliente = await getClienteCompleto(data.cliente_id);
  let barbeiro = { id: '', nome: '' };
  if (data.barbeiro_id) {
    barbeiro = await getBarbeiroCompleto(data.barbeiro_id);
  }

  await sendWebhookEvent({
    evento: 'remarcacao_solicitada',
    descricao: 'Barbeiro solicitou remarcação do agendamento',
    status: 'remarcacao_solicitada',
    
    agendamento_id: data.agendamento_id,
    data: data.data,
    hora: data.hora,
    
    servico: data.servico,
    
    cliente_id: data.cliente_id,
    cliente_nome: cliente.nome,
    cliente_telefone: cliente.telefone,
    cliente_telefone_whatsapp: cliente.telefone_whatsapp,
    cliente_email: cliente.email,
    
    barbeiro_id: barbeiro.id || data.barbeiro_id,
    barbeiro_nome: barbeiro.nome,
    
    mensagem_barbeiro: data.mensagem_barbeiro,
  });
}

/**
 * Evento: Cliente concluiu a remarcação
 */
export async function sendRemarcacaoConcluidaEvent(data: {
  agendamento_id: string;
  cliente_id: string;
  cliente_nome?: string;
  servico?: string;
  data: string;
  hora: string;
  preco?: number;
  data_anterior?: string;
  hora_anterior?: string;
  barbeiro_id?: string;
}): Promise<void> {
  const cliente = await getClienteCompleto(data.cliente_id);
  let barbeiro = { id: '', nome: '' };
  if (data.barbeiro_id) {
    barbeiro = await getBarbeiroCompleto(data.barbeiro_id);
  }

  await sendWebhookEvent({
    evento: 'remarcacao_concluida',
    descricao: 'Cliente concluiu a remarcação do agendamento',
    status: 'remarcado',
    
    agendamento_id: data.agendamento_id,
    data: data.data,
    hora: data.hora,
    
    servico: data.servico,
    valor_total: data.preco,
    preco: data.preco,
    
    cliente_id: data.cliente_id,
    cliente_nome: cliente.nome,
    cliente_telefone: cliente.telefone,
    cliente_telefone_whatsapp: cliente.telefone_whatsapp,
    cliente_email: cliente.email,
    
    barbeiro_id: barbeiro.id || data.barbeiro_id,
    barbeiro_nome: barbeiro.nome,
    
    detalhes: {
      data_anterior: data.data_anterior,
      hora_anterior: data.hora_anterior,
    },
  });
}

/**
 * Evento: Atendimento iniciado pelo barbeiro
 */
export async function sendAtendimentoIniciadoEvent(data: {
  agendamento_id: string;
  cliente_id: string;
  servico?: string;
  data?: string;
  hora?: string;
  barbeiro_id?: string;
}): Promise<void> {
  const cliente = await getClienteCompleto(data.cliente_id);
  let barbeiro = { id: '', nome: '' };
  if (data.barbeiro_id) {
    barbeiro = await getBarbeiroCompleto(data.barbeiro_id);
  }

  await sendWebhookEvent({
    evento: 'atendimento_iniciado',
    descricao: 'Barbeiro iniciou o atendimento',
    status: 'em_atendimento',
    
    agendamento_id: data.agendamento_id,
    data: data.data,
    hora: data.hora,
    servico: data.servico,
    
    cliente_id: data.cliente_id,
    cliente_nome: cliente.nome,
    cliente_telefone: cliente.telefone,
    cliente_telefone_whatsapp: cliente.telefone_whatsapp,
    cliente_email: cliente.email,
    
    barbeiro_id: barbeiro.id || data.barbeiro_id,
    barbeiro_nome: barbeiro.nome,
  });
}

/**
 * Evento: Atendimento finalizado
 */
export async function sendAtendimentoFinalizadoEvent(data: {
  agendamento_id: string;
  cliente_id: string;
  servico?: string;
  data?: string;
  hora?: string;
  preco?: number;
  barbeiro_id?: string;
  ponto_liberado?: boolean;
}): Promise<void> {
  const cliente = await getClienteCompleto(data.cliente_id);
  const saldoCreditos = await getSaldoCreditos(data.cliente_id);
  let barbeiro = { id: '', nome: '' };
  if (data.barbeiro_id) {
    barbeiro = await getBarbeiroCompleto(data.barbeiro_id);
  }

  await sendWebhookEvent({
    evento: 'atendimento_finalizado',
    descricao: 'Atendimento foi finalizado com sucesso',
    status: 'completed',
    
    agendamento_id: data.agendamento_id,
    data: data.data,
    hora: data.hora,
    servico: data.servico,
    valor_total: data.preco,
    
    cliente_id: data.cliente_id,
    cliente_nome: cliente.nome,
    cliente_telefone: cliente.telefone,
    cliente_telefone_whatsapp: cliente.telefone_whatsapp,
    cliente_email: cliente.email,
    
    barbeiro_id: barbeiro.id || data.barbeiro_id,
    barbeiro_nome: barbeiro.nome,
    
    saldo_creditos_restante: saldoCreditos,
    detalhes: {
      ponto_liberado: data.ponto_liberado,
    },
  });
}

// ============================================================
// EVENTOS DE PAGAMENTO
// ============================================================

/**
 * Evento: Pagamento realizado
 */
export async function sendPagamentoRealizadoEvent(data: {
  agendamento_id: string;
  cliente_id: string;
  cliente_nome?: string;
  servico?: string;
  data?: string;
  hora?: string;
  preco: number;
  metodo_pagamento: string;
  valor_pago_app?: number;
  valor_pago_creditos?: number;
  barbeiro_id?: string;
}): Promise<void> {
  const cliente = await getClienteCompleto(data.cliente_id);
  const saldoCreditos = await getSaldoCreditos(data.cliente_id);
  let barbeiro = { id: '', nome: '' };
  if (data.barbeiro_id) {
    barbeiro = await getBarbeiroCompleto(data.barbeiro_id);
  }

  const isParcial = (data.valor_pago_creditos || 0) > 0 && (data.valor_pago_app || 0) > 0;

  await sendWebhookEvent({
    evento: isParcial ? 'pagamento_parcial_credito' : 'pagamento_realizado',
    descricao: isParcial 
      ? `Pagamento parcial: R$${data.valor_pago_creditos} em créditos + R$${data.valor_pago_app} via ${data.metodo_pagamento}`
      : `Pagamento realizado via ${data.metodo_pagamento}`,
    status: 'pago',
    
    agendamento_id: data.agendamento_id,
    data: data.data,
    hora: data.hora,
    servico: data.servico,
    
    valor_total: data.preco,
    preco: data.preco,
    valor_pago_app: data.valor_pago_app || data.preco,
    valor_pago_creditos: data.valor_pago_creditos || 0,
    metodo_pagamento: data.metodo_pagamento,
    saldo_creditos_restante: saldoCreditos,
    
    cliente_id: data.cliente_id,
    cliente_nome: cliente.nome,
    cliente_telefone: cliente.telefone,
    cliente_telefone_whatsapp: cliente.telefone_whatsapp,
    cliente_email: cliente.email,
    
    barbeiro_id: barbeiro.id || data.barbeiro_id,
    barbeiro_nome: barbeiro.nome,
  });
}

/**
 * Evento: Pagamento com créditos (total)
 */
export async function sendPagamentoCreditosEvent(data: {
  agendamento_id: string;
  cliente_id: string;
  servico?: string;
  data?: string;
  hora?: string;
  valor_creditos: number;
  barbeiro_id?: string;
}): Promise<void> {
  const cliente = await getClienteCompleto(data.cliente_id);
  const saldoCreditos = await getSaldoCreditos(data.cliente_id);

  await sendWebhookEvent({
    evento: 'pagamento_creditos',
    descricao: `Pagamento realizado integralmente com créditos: R$${data.valor_creditos}`,
    status: 'pago',
    
    agendamento_id: data.agendamento_id,
    data: data.data,
    hora: data.hora,
    servico: data.servico,
    
    valor_total: data.valor_creditos,
    valor_pago_creditos: data.valor_creditos,
    valor_pago_app: 0,
    metodo_pagamento: 'credito',
    saldo_creditos_restante: saldoCreditos,
    
    cliente_id: data.cliente_id,
    cliente_nome: cliente.nome,
    cliente_telefone: cliente.telefone,
    cliente_telefone_whatsapp: cliente.telefone_whatsapp,
    cliente_email: cliente.email,
    
    barbeiro_id: data.barbeiro_id,
  });
}

// ============================================================
// EVENTOS DE CRÉDITOS
// ============================================================

/**
 * Evento: Crédito adicionado à carteira do cliente
 */
export async function sendCreditoAdicionadoEvent(data: {
  cliente_id: string;
  valor: number;
  origem: string;
  agendamento_origem_id?: string;
}): Promise<void> {
  const cliente = await getClienteCompleto(data.cliente_id);
  const saldoCreditos = await getSaldoCreditos(data.cliente_id);

  await sendWebhookEvent({
    evento: 'credito_adicionado',
    descricao: `Crédito de R$${data.valor} adicionado à carteira. Origem: ${data.origem}`,
    
    cliente_id: data.cliente_id,
    cliente_nome: cliente.nome,
    cliente_telefone: cliente.telefone,
    cliente_telefone_whatsapp: cliente.telefone_whatsapp,
    cliente_email: cliente.email,
    
    saldo_creditos_restante: saldoCreditos,
    detalhes: {
      valor_adicionado: data.valor,
      origem: data.origem,
      agendamento_origem_id: data.agendamento_origem_id,
    },
  });
}

/**
 * Evento: Crédito usado pelo cliente
 */
export async function sendCreditoUsadoEvent(data: {
  cliente_id: string;
  valor_usado: number;
  agendamento_id?: string;
}): Promise<void> {
  const cliente = await getClienteCompleto(data.cliente_id);
  const saldoCreditos = await getSaldoCreditos(data.cliente_id);

  await sendWebhookEvent({
    evento: 'credito_usado',
    descricao: `Cliente usou R$${data.valor_usado} de créditos`,
    
    agendamento_id: data.agendamento_id,
    
    cliente_id: data.cliente_id,
    cliente_nome: cliente.nome,
    cliente_telefone: cliente.telefone,
    cliente_telefone_whatsapp: cliente.telefone_whatsapp,
    cliente_email: cliente.email,
    
    valor_pago_creditos: data.valor_usado,
    saldo_creditos_restante: saldoCreditos,
  });
}

/**
 * Evento: Crédito estornado após cancelamento
 */
export async function sendCreditoEstornadoEvent(data: {
  cliente_id: string;
  valor: number;
  agendamento_id: string;
}): Promise<void> {
  const cliente = await getClienteCompleto(data.cliente_id);
  const saldoCreditos = await getSaldoCreditos(data.cliente_id);

  await sendWebhookEvent({
    evento: 'credito_estornado',
    descricao: `Crédito de R$${data.valor} devolvido após cancelamento do agendamento`,
    
    agendamento_id: data.agendamento_id,
    
    cliente_id: data.cliente_id,
    cliente_nome: cliente.nome,
    cliente_telefone: cliente.telefone,
    cliente_telefone_whatsapp: cliente.telefone_whatsapp,
    cliente_email: cliente.email,
    
    saldo_creditos_restante: saldoCreditos,
    detalhes: {
      valor_estornado: data.valor,
    },
  });
}

// ============================================================
// EVENTOS DE CLIENTE
// ============================================================

/**
 * Evento: Novo cliente cadastrado
 */
export async function sendClienteCriadoEvent(data: {
  cliente_id: string;
  cliente_nome: string;
  cliente_telefone?: string;
  cliente_email?: string;
}): Promise<void> {
  await sendWebhookEvent({
    evento: 'cliente_criado',
    descricao: 'Novo cliente cadastrado no sistema',
    
    cliente_id: data.cliente_id,
    cliente_nome: data.cliente_nome,
    cliente_telefone: data.cliente_telefone,
    cliente_telefone_whatsapp: formatPhoneForWhatsApp(data.cliente_telefone),
    cliente_email: data.cliente_email,
  });
}

/**
 * Evento: Dados do cliente atualizados
 */
export async function sendClienteAtualizadoEvent(data: {
  cliente_id: string;
  campos_alterados?: string[];
}): Promise<void> {
  const cliente = await getClienteCompleto(data.cliente_id);

  await sendWebhookEvent({
    evento: 'cliente_atualizado',
    descricao: 'Dados do cliente foram atualizados',
    
    cliente_id: data.cliente_id,
    cliente_nome: cliente.nome,
    cliente_telefone: cliente.telefone,
    cliente_telefone_whatsapp: cliente.telefone_whatsapp,
    cliente_email: cliente.email,
    
    detalhes: {
      campos_alterados: data.campos_alterados,
    },
  });
}

// ============================================================
// EVENTOS DE STATUS
// ============================================================

/**
 * Evento: Cliente está aguardando
 */
export async function sendClienteAguardandoEvent(data: {
  agendamento_id: string;
  cliente_id: string;
  servico?: string;
  data?: string;
  hora?: string;
  barbeiro_id?: string;
}): Promise<void> {
  const cliente = await getClienteCompleto(data.cliente_id);

  await sendWebhookEvent({
    evento: 'cliente_aguardando',
    descricao: 'Cliente chegou e está aguardando atendimento',
    status: 'aguardando',
    
    agendamento_id: data.agendamento_id,
    data: data.data,
    hora: data.hora,
    servico: data.servico,
    
    cliente_id: data.cliente_id,
    cliente_nome: cliente.nome,
    cliente_telefone: cliente.telefone,
    cliente_telefone_whatsapp: cliente.telefone_whatsapp,
    cliente_email: cliente.email,
    
    barbeiro_id: data.barbeiro_id,
  });
}

/**
 * Evento: Cliente não compareceu (no-show)
 */
export async function sendClienteNaoCompareceuEvent(data: {
  agendamento_id: string;
  cliente_id: string;
  servico?: string;
  data?: string;
  hora?: string;
  barbeiro_id?: string;
}): Promise<void> {
  const cliente = await getClienteCompleto(data.cliente_id);

  await sendWebhookEvent({
    evento: 'cliente_nao_compareceu',
    descricao: 'Cliente não compareceu ao agendamento',
    status: 'no_show',
    
    agendamento_id: data.agendamento_id,
    data: data.data,
    hora: data.hora,
    servico: data.servico,
    
    cliente_id: data.cliente_id,
    cliente_nome: cliente.nome,
    cliente_telefone: cliente.telefone,
    cliente_telefone_whatsapp: cliente.telefone_whatsapp,
    cliente_email: cliente.email,
    
    barbeiro_id: data.barbeiro_id,
  });
}

/**
 * Evento genérico para mudanças de status
 */
export async function sendStatusAlteradoEvent(data: {
  agendamento_id: string;
  cliente_id: string;
  status_anterior: string;
  status_novo: string;
  servico?: string;
  data?: string;
  hora?: string;
  barbeiro_id?: string;
}): Promise<void> {
  const cliente = await getClienteCompleto(data.cliente_id);

  await sendWebhookEvent({
    evento: 'status_alterado',
    descricao: `Status alterado de "${data.status_anterior}" para "${data.status_novo}"`,
    status: data.status_novo,
    
    agendamento_id: data.agendamento_id,
    data: data.data,
    hora: data.hora,
    servico: data.servico,
    
    cliente_id: data.cliente_id,
    cliente_nome: cliente.nome,
    cliente_telefone: cliente.telefone,
    cliente_telefone_whatsapp: cliente.telefone_whatsapp,
    cliente_email: cliente.email,
    
    barbeiro_id: data.barbeiro_id,
    
    detalhes: {
      status_anterior: data.status_anterior,
      status_novo: data.status_novo,
    },
  });
}

// ============================================================
// EVENTOS DE HORÁRIO
// ============================================================

/**
 * Evento: Horário de agendamento atualizado
 */
export async function sendHorarioAtualizadoEvent(data: {
  agendamento_id: string;
  cliente_id: string;
  data_anterior: string;
  hora_anterior: string;
  data_nova: string;
  hora_nova: string;
  servico?: string;
  barbeiro_id?: string;
}): Promise<void> {
  const cliente = await getClienteCompleto(data.cliente_id);

  await sendWebhookEvent({
    evento: 'horario_atualizado',
    descricao: `Horário alterado de ${data.data_anterior} ${data.hora_anterior} para ${data.data_nova} ${data.hora_nova}`,
    
    agendamento_id: data.agendamento_id,
    data: data.data_nova,
    hora: data.hora_nova,
    servico: data.servico,
    
    cliente_id: data.cliente_id,
    cliente_nome: cliente.nome,
    cliente_telefone: cliente.telefone,
    cliente_telefone_whatsapp: cliente.telefone_whatsapp,
    cliente_email: cliente.email,
    
    barbeiro_id: data.barbeiro_id,
    
    detalhes: {
      data_anterior: data.data_anterior,
      hora_anterior: data.hora_anterior,
      data_nova: data.data_nova,
      hora_nova: data.hora_nova,
    },
  });
}
