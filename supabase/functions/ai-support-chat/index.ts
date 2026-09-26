import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ========================================
// BASE DE CONHECIMENTO EXPANDIDA
// ========================================

const APP_KNOWLEDGE = `
# SISTEMA DUB - BASE DE CONHECIMENTO COMPLETA

## FUNCIONALIDADES PRINCIPAIS

### Agendamentos
- Cliente escolhe: serviço → data → horário → barbeiro (opcional)
- Status possíveis: pending, confirmed, completed, cancelled_by_user, cancelled_by_admin, no_show
- Barbeiro confirma atendimento (libera ponto de fidelidade)
- Cliente pode remarcar até 2h antes do horário

### Sistema de Fidelidade
- 1 corte completado e confirmado = 1 ponto
- 8 pontos acumulados = 1 resgate (corte grátis) disponível
- Resgate válido por 90 dias após geração
- Apenas cortes pagos geram pontos (cortes grátis não contam)

### Pagamentos
- Métodos: PIX, Cartão de Crédito, Dinheiro (na barbearia)
- Gateway: Asaas
- Webhook processa confirmação em até 5 minutos
- Créditos podem ser usados como pagamento parcial

### Planos de Assinatura
- Assinatura mensal com créditos recorrentes
- Prioridade em horários
- Descontos em serviços adicionais

### Créditos
- Gerados por: promoções, cancelamentos reembolsados, planos
- Expiram após período definido (geralmente 90-180 dias)
- Podem ser usados parcialmente

## PROBLEMAS COMUNS E SOLUÇÕES

### "Meus pontos não creditaram"
→ VERIFICAR: barbeiro_confirmou = true no agendamento
→ VERIFICAR: status = completed
→ VERIFICAR: ponto_liberado = true
→ SOLUÇÃO: Se atendimento foi feito mas não confirmado, o barbeiro precisa confirmar

### "Não consigo agendar / sem horários"
→ VERIFICAR: configuracoes_horario do dia
→ VERIFICAR: horarios_excepcionais (feriados, folgas)
→ VERIFICAR: agendamentos existentes no slot
→ VERIFICAR: barbeiros ativos

### "Pagamento não confirmou"
→ VERIFICAR: tabela pagamentos (status, gateway_payment_id)
→ VERIFICAR: webhook_logs para eventos do Asaas
→ AGUARDAR: até 5 minutos para webhook processar
→ VERIFICAR: pending_bookings se foi PIX

### "Resgate expirado / não consigo usar"
→ VERIFICAR: resgates.expired_at > now()
→ VERIFICAR: resgates.status = 'available'
→ VERIFICAR: resgates.used_at IS NULL

### "Erro 202 / Pagamento pendente"
→ VERIFICAR: pending_bookings para ver se há reserva ativa
→ VERIFICAR: se QR code foi gerado mas não pago
→ SOLUÇÃO: Cliente pode tentar novo pagamento

### "Conta bloqueada"
→ VERIFICAR: profiles.blocked = true
→ NECESSÁRIO: Escalar para suporte humano (admin deve desbloquear)
`;

// ========================================
// FUNÇÕES DISPONÍVEIS PARA A IA (EXPANDIDAS)
// ========================================

const AVAILABLE_TOOLS = [
  {
    type: "function",
    function: {
      name: "diagnosticar_usuario_completo",
      description: "Diagnóstico completo do usuário: perfil, agendamentos, pagamentos, pontos, resgates, créditos, assinatura, e erros recentes. Use SEMPRE como primeira ação para entender o contexto.",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "string",
            description: "ID do usuário no formato UUID"
          }
        },
        required: ["user_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "verificar_agendamento_especifico",
      description: "Verifica detalhes de um agendamento específico, incluindo pagamento associado, status de confirmação e logs.",
      parameters: {
        type: "object",
        properties: {
          agendamento_id: {
            type: "string",
            description: "ID do agendamento"
          }
        },
        required: ["agendamento_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "verificar_disponibilidade",
      description: "Verifica horários disponíveis para agendamento em uma data específica.",
      parameters: {
        type: "object",
        properties: {
          data: {
            type: "string",
            description: "Data no formato YYYY-MM-DD"
          },
          servico_id: {
            type: "string",
            description: "ID do serviço (opcional)"
          }
        },
        required: ["data"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "verificar_pagamento_detalhado",
      description: "Verifica status detalhado de pagamentos, incluindo logs de webhook e reservas pendentes.",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "string",
            description: "ID do usuário"
          },
          payment_id: {
            type: "string",
            description: "ID do pagamento (opcional)"
          }
        },
        required: ["user_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "corrigir_ponto_fidelidade",
      description: "Libera ponto de fidelidade manualmente para um agendamento que foi completado mas não teve o ponto creditado. REQUER CONFIRMAÇÃO do usuário antes de executar.",
      parameters: {
        type: "object",
        properties: {
          agendamento_id: {
            type: "string",
            description: "ID do agendamento"
          },
          user_id: {
            type: "string",
            description: "ID do usuário"
          },
          confirmado_pelo_usuario: {
            type: "boolean",
            description: "Se o usuário confirmou que o atendimento foi realizado"
          }
        },
        required: ["agendamento_id", "user_id", "confirmado_pelo_usuario"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "reenviar_email_confirmacao",
      description: "Reenvia email de confirmação de conta.",
      parameters: {
        type: "object",
        properties: {
          user_email: {
            type: "string",
            description: "Email do usuário"
          }
        },
        required: ["user_email"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "criar_ticket_automatico",
      description: "Abre ticket de suporte automaticamente quando não é possível resolver o problema. NÃO pede permissão - informa que foi aberto.",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "string",
            description: "ID do usuário"
          },
          titulo: {
            type: "string",
            description: "Título curto e claro do problema"
          },
          descricao: {
            type: "string",
            description: "Descrição detalhada incluindo diagnósticos já realizados"
          },
          prioridade: {
            type: "string",
            enum: ["low", "medium", "high", "critical"],
            description: "low: dúvida simples, medium: problema comum, high: afeta uso, critical: bloqueio total ou perda financeira"
          },
          categoria: {
            type: "string",
            enum: ["bug", "payment", "auth", "booking", "loyalty", "other"],
            description: "Categoria principal do problema"
          },
          diagnosticos_realizados: {
            type: "object",
            description: "Objeto com todos os diagnósticos já feitos"
          }
        },
        required: ["titulo", "descricao", "prioridade", "categoria"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "solicitar_confirmacao_acao",
      description: "Solicita confirmação do usuário antes de executar uma ação que modifica dados. Use para ações críticas.",
      parameters: {
        type: "object",
        properties: {
          acao: {
            type: "string",
            description: "Nome da ação a ser executada"
          },
          descricao_acao: {
            type: "string",
            description: "Descrição clara do que será feito"
          },
          impacto: {
            type: "string",
            description: "Impacto esperado da ação"
          }
        },
        required: ["acao", "descricao_acao", "impacto"]
      }
    }
  }
];

// ========================================
// UTILITÁRIOS
// ========================================

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function logAIAction(supabase: any, data: any) {
  try {
    await supabase.from('ai_actions_log').insert(data);
  } catch (e) {
    console.error('Erro ao logar ação:', e);
  }
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }
  
  throw lastError;
}

// ========================================
// IMPLEMENTAÇÃO DAS FUNÇÕES
// ========================================

async function executeFunction(functionName: string, args: any, supabase: any, conversationId: string) {
  console.log(`🔧 Executando: ${functionName}`, args);
  
  const actionLog: any = {
    conversation_id: conversationId,
    user_id: args.user_id,
    action_type: 'function_call',
    action_name: functionName,
    parameters: args,
    success: false,
    created_at: new Date().toISOString()
  };

  try {
    let result: any;
    
    switch (functionName) {
      // ========================================
      // DIAGNÓSTICO COMPLETO
      // ========================================
      case "diagnosticar_usuario_completo": {
        const { user_id } = args;
        
        // Perfil
        const { data: profile } = await supabase
          .from('profiles')
          .select('nome, telefone, blocked, created_at')
          .eq('id', user_id)
          .single();

        // Agendamentos (últimos 10)
        const { data: appointments } = await supabase
          .from('agendamentos')
          .select(`
            id, data, hora, status, 
            barbeiro_confirmou, cliente_confirmou, 
            ponto_liberado, is_free, preco,
            servico_id, created_at
          `)
          .eq('user_id', user_id)
          .order('data', { ascending: false })
          .limit(10);

        // Pagamentos (últimos 5)
        const { data: payments } = await supabase
          .from('pagamentos')
          .select('id, valor, status, metodo, created_at, data_pagamento, gateway_payment_id')
          .eq('user_id', user_id)
          .order('created_at', { ascending: false })
          .limit(5);

        // Pontos
        const { data: points } = await supabase
          .from('pontos')
          .select('pontos, last_awarded_at, promocao_id')
          .eq('user_id', user_id)
          .single();

        // Resgates disponíveis
        const { data: redemptions } = await supabase
          .from('resgates')
          .select('id, status, created_at, expired_at, used_at')
          .eq('user_id', user_id)
          .order('created_at', { ascending: false })
          .limit(5);

        // Créditos disponíveis
        const { data: credits } = await supabase
          .from('creditos')
          .select('id, valor, origem, usado, expires_at, created_at')
          .eq('user_id', user_id)
          .eq('usado', false);

        // Assinatura
        const { data: subscription } = await supabase
          .from('assinaturas')
          .select('id, status, next_billing_date, plano_id')
          .eq('user_id', user_id)
          .eq('status', 'active')
          .single();

        // Reservas pendentes
        const { data: pendingBookings } = await supabase
          .from('pending_bookings')
          .select('*')
          .eq('user_id', user_id)
          .order('created_at', { ascending: false })
          .limit(3);

        // Erros recentes
        const { data: recentLogs } = await supabase
          .from('system_logs')
          .select('level, message, category, created_at')
          .eq('user_id', user_id)
          .in('level', ['error', 'warn'])
          .order('created_at', { ascending: false })
          .limit(5);

        // Análise automática de problemas
        const issues: string[] = [];
        
        if (profile?.blocked) {
          issues.push('CONTA BLOQUEADA - necessita intervenção humana');
        }
        
        const completedWithoutPoints = appointments?.filter((a: any) => 
          a.status === 'completed' && 
          a.barbeiro_confirmou === true && 
          a.ponto_liberado === false &&
          !a.is_free
        );
        if (completedWithoutPoints?.length > 0) {
          issues.push(`${completedWithoutPoints.length} agendamento(s) completado(s) sem ponto creditado`);
        }

        const pendingPayments = payments?.filter((p: any) => p.status === 'pending');
        if (pendingPayments?.length > 0) {
          issues.push(`${pendingPayments.length} pagamento(s) pendente(s)`);
        }

        const expiredRedemptions = redemptions?.filter((r: any) => 
          r.status === 'available' && 
          new Date(r.expired_at) < new Date()
        );
        if (expiredRedemptions?.length > 0) {
          issues.push(`${expiredRedemptions.length} resgate(s) expirado(s)`);
        }

        result = {
          perfil: {
            nome: profile?.nome,
            telefone: profile?.telefone,
            bloqueado: profile?.blocked,
            cliente_desde: profile?.created_at
          },
          resumo: {
            pontos_atuais: points?.pontos || 0,
            resgates_disponiveis: redemptions?.filter((r: any) => r.status === 'available' && new Date(r.expired_at) > new Date()).length || 0,
            creditos_disponiveis: credits?.reduce((sum: number, c: any) => sum + Number(c.valor), 0) || 0,
            tem_assinatura: !!subscription,
            status_assinatura: subscription?.status
          },
          agendamentos_recentes: appointments?.slice(0, 5),
          pagamentos_recentes: payments?.slice(0, 3),
          reservas_pendentes: pendingBookings,
          problemas_detectados: issues,
          erros_recentes: recentLogs
        };

        console.log('✅ Diagnóstico completo:', result);
        break;
      }

      // ========================================
      // VERIFICAR AGENDAMENTO ESPECÍFICO
      // ========================================
      case "verificar_agendamento_especifico": {
        const { agendamento_id } = args;
        
        const { data: appointment } = await supabase
          .from('agendamentos')
          .select(`
            *,
            servicos (nome, preco, duracao_minutos),
            barbeiros (apelido)
          `)
          .eq('id', agendamento_id)
          .single();

        if (!appointment) {
          result = { erro: 'Agendamento não encontrado' };
          break;
        }

        // Pagamento associado
        const { data: payment } = await supabase
          .from('pagamentos')
          .select('*')
          .eq('agendamento_id', agendamento_id)
          .single();

        // Logs do agendamento
        const { data: logs } = await supabase
          .from('logs_agendamentos')
          .select('*')
          .eq('agendamento_id', agendamento_id)
          .order('timestamp', { ascending: false })
          .limit(10);

        result = {
          agendamento: appointment,
          servico: appointment.servicos,
          barbeiro: appointment.barbeiros,
          pagamento: payment,
          historico_alteracoes: logs
        };
        break;
      }

      // ========================================
      // VERIFICAR DISPONIBILIDADE
      // ========================================
      case "verificar_disponibilidade": {
        const { data: dataStr, servico_id } = args;
        
        const dayOfWeek = new Date(dataStr).getDay();
        
        // Configuração de horário do dia
        const { data: config } = await supabase
          .from('configuracoes_horario')
          .select('*')
          .eq('dia_semana', dayOfWeek)
          .single();

        // Horário excepcional
        // Horário excepcional (diagnóstico — pega o primeiro sem escopo de tenant)
        const { data: exception } = await supabase
          .from('horarios_excepcionais')
          .select('*')
          .eq('data', dataStr)
          .limit(1)
          .maybeSingle();

        // Agendamentos existentes
        const { data: existingAppointments } = await supabase
          .from('agendamentos')
          .select('hora, duracao, status')
          .eq('data', dataStr)
          .not('status', 'in', '("cancelled_by_user","cancelled_by_admin","excluido")');

        result = {
          data: dataStr,
          dia_semana: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][dayOfWeek],
          configuracao_normal: config,
          horario_excepcional: exception,
          aberto: exception ? exception.aberto : (config?.aberto ?? false),
          agendamentos_existentes: existingAppointments?.length || 0,
          horarios_ocupados: existingAppointments?.map((a: any) => a.hora)
        };
        break;
      }

      // ========================================
      // VERIFICAR PAGAMENTO DETALHADO
      // ========================================
      case "verificar_pagamento_detalhado": {
        const { user_id, payment_id } = args;
        
        let paymentsQuery = supabase
          .from('pagamentos')
          .select('*')
          .eq('user_id', user_id)
          .order('created_at', { ascending: false })
          .limit(5);
        
        if (payment_id) {
          paymentsQuery = supabase
            .from('pagamentos')
            .select('*')
            .eq('id', payment_id)
            .single();
        }

        const { data: payments } = await paymentsQuery;

        // Webhook logs recentes
        const { data: webhookLogs } = await supabase
          .from('webhook_logs')
          .select('*')
          .eq('provider', 'asaas')
          .order('created_at', { ascending: false })
          .limit(10);

        // Reservas pendentes
        const { data: pendingBookings } = await supabase
          .from('pending_bookings')
          .select('*')
          .eq('user_id', user_id);

        result = {
          pagamentos: payments,
          webhooks_recentes: webhookLogs?.slice(0, 5),
          reservas_pendentes: pendingBookings
        };
        break;
      }

      // ========================================
      // CORRIGIR PONTO DE FIDELIDADE
      // ========================================
      case "corrigir_ponto_fidelidade": {
        const { agendamento_id, user_id, confirmado_pelo_usuario } = args;
        
        if (!confirmado_pelo_usuario) {
          result = {
            sucesso: false,
            requer_confirmacao: true,
            mensagem: 'Esta ação requer confirmação do usuário de que o atendimento foi realizado'
          };
          break;
        }

        // Verificar agendamento
        const { data: appointment } = await supabase
          .from('agendamentos')
          .select('*')
          .eq('id', agendamento_id)
          .eq('user_id', user_id)
          .single();

        if (!appointment) {
          result = { sucesso: false, erro: 'Agendamento não encontrado' };
          break;
        }

        if (appointment.ponto_liberado) {
          result = { sucesso: false, erro: 'Ponto já foi creditado para este agendamento' };
          break;
        }

        if (appointment.is_free) {
          result = { sucesso: false, erro: 'Cortes grátis não geram pontos de fidelidade' };
          break;
        }

        // Atualizar agendamento
        const { error: updateError } = await supabase
          .from('agendamentos')
          .update({ 
            ponto_liberado: true, 
            barbeiro_confirmou: true,
            status: 'completed'
          })
          .eq('id', agendamento_id);

        if (updateError) {
          result = { sucesso: false, erro: updateError.message };
          break;
        }

        // Adicionar ponto
        const { data: currentPoints } = await supabase
          .from('pontos')
          .select('pontos')
          .eq('user_id', user_id)
          .single();

        if (currentPoints) {
          await supabase
            .from('pontos')
            .update({ 
              pontos: currentPoints.pontos + 1,
              last_awarded_at: new Date().toISOString()
            })
            .eq('user_id', user_id);
        } else {
          await supabase
            .from('pontos')
            .insert({ user_id, pontos: 1, last_awarded_at: new Date().toISOString() });
        }

        // Log da ação
        actionLog.before_state = { ponto_liberado: false, pontos: currentPoints?.pontos || 0 };
        actionLog.after_state = { ponto_liberado: true, pontos: (currentPoints?.pontos || 0) + 1 };

        result = {
          sucesso: true,
          mensagem: 'Ponto creditado com sucesso',
          novos_pontos: (currentPoints?.pontos || 0) + 1
        };
        break;
      }

      // ========================================
      // REENVIAR EMAIL
      // ========================================
      case "reenviar_email_confirmacao": {
        const { user_email } = args;
        
        const { error } = await supabase.functions.invoke('send-confirmation-email', {
          body: { email: user_email }
        });

        if (error) {
          result = { sucesso: false, erro: error.message };
        } else {
          result = { sucesso: true, mensagem: 'Email reenviado' };
        }
        break;
      }

      // ========================================
      // CRIAR TICKET AUTOMÁTICO
      // ========================================
      case "criar_ticket_automatico": {
        const { user_id, titulo, descricao, prioridade, categoria, diagnosticos_realizados } = args;
        
        // Buscar dados do usuário
        let userName = '';
        let userPhone = '';
        let userEmail = '';
        
        if (user_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('nome, telefone')
            .eq('id', user_id)
            .single();
          
          userName = profile?.nome || '';
          userPhone = profile?.telefone || '';
        }

        try {
          const { data: ticket, error } = await retryWithBackoff(async () => {
            return await supabase
              .from('support_tickets')
              .insert({
                user_id: user_id || null,
                conversation_id: conversationId,
                title: titulo,
                description: descricao,
                priority: prioridade,
                category: categoria,
                status: 'open',
                metadata: {
                  created_by_ai: true,
                  auto_created: true,
                  diagnosticos: diagnosticos_realizados,
                  timestamp: new Date().toISOString()
                }
              })
              .select()
              .single();
          }, 3, 2000);

          if (error) throw error;

          result = {
            sucesso: true,
            ticket_id: ticket.id,
            protocolo: ticket.id.substring(0, 8).toUpperCase(),
            mensagem: `Ticket aberto automaticamente — protocolo ${ticket.id.substring(0, 8).toUpperCase()}`
          };
        } catch (error: any) {
          console.error('Erro ao criar ticket:', error);
          
          // Fallback: pending_ticket
          const pendingId = `PT-${Date.now()}`;
          await supabase.from('pending_tickets').insert({
            pending_ticket_id: pendingId,
            conversation_id: conversationId,
            user_id,
            user_name: userName,
            user_phone: userPhone,
            user_email: userEmail,
            summary: titulo,
            description: descricao,
            priority: prioridade,
            category: categoria,
            status: 'pending',
            last_error: error.message,
            payload: { diagnosticos_realizados }
          });

          result = {
            sucesso: true,
            pending: true,
            protocolo: pendingId,
            mensagem: `Registrei seu caso (${pendingId}) — suporte já foi notificado`
          };
        }
        break;
      }

      // ========================================
      // SOLICITAR CONFIRMAÇÃO
      // ========================================
      case "solicitar_confirmacao_acao": {
        const { acao, descricao_acao, impacto } = args;
        
        result = {
          requer_confirmacao: true,
          acao,
          descricao: descricao_acao,
          impacto,
          instrucao: 'Por favor, confirme se deseja que eu execute esta ação respondendo "sim" ou "confirmo"'
        };
        break;
      }

      default:
        result = { erro: 'Função não encontrada' };
    }
    
    actionLog.success = true;
    actionLog.result = result;
    await logAIAction(supabase, actionLog);
    
    return JSON.stringify(result);
    
  } catch (error: any) {
    console.error(`❌ Erro em ${functionName}:`, error);
    actionLog.success = false;
    actionLog.error_message = error.message;
    await logAIAction(supabase, actionLog);
    
    return JSON.stringify({ sucesso: false, erro: error.message });
  }
}

// ========================================
// SERVIDOR PRINCIPAL
// ========================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, conversationId, guestName, guestEmail } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Autenticação
    const authHeader = req.headers.get('Authorization');
    let user = null;
    let isGuest = false;
    
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user: authUser } } = await supabase.auth.getUser(token);
      if (authUser) user = authUser;
    }
    
    if (!user) {
      isGuest = true;
      user = { id: `guest-${Date.now()}`, email: guestEmail };
    }

    console.log('📩 Mensagem:', { userId: user.id, isGuest });

    // Buscar ou criar conversa
    let conversation;
    if (conversationId) {
      const { data } = await supabase
        .from('support_conversations')
        .select('*')
        .eq('id', conversationId)
        .single();
      conversation = data;
    }

    if (!conversation) {
      const { data: newConv } = await supabase
        .from('support_conversations')
        .insert({ 
          user_id: isGuest ? null : user.id,
          status: 'active',
          metadata: isGuest ? { guest_name: guestName, guest_email: guestEmail, is_guest: true } : {}
        })
        .select()
        .single();
      conversation = newConv;
    }

    // Salvar mensagem do usuário
    await supabase.from('support_messages').insert({
      conversation_id: conversation.id,
      role: 'user',
      content: message
    });

    // Buscar histórico completo da conversa
    const { data: allMessages } = await supabase
      .from('support_messages')
      .select('role, content')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true })
      .limit(30);

    const conversationHistory = allMessages?.map(msg => ({
      role: msg.role,
      content: msg.content
    })) || [];

    // ========================================
    // PROMPT DO AGENTE INTELIGENTE
    // ========================================

    const systemPrompt = `# AGENTE DE SUPORTE INTELIGENTE — DUB

Você é um agente de IA AUTÔNOMO com acesso TOTAL aos dados do sistema. Sua missão é RESOLVER problemas, não apenas conversar.

## IDENTIDADE
- Nome: Assistente DUB
- Capacidade: Acesso a dados + execução de ações
- Objetivo: Resolver 90% dos problemas automaticamente

## COMPORTAMENTO OBRIGATÓRIO

### 1. DIAGNÓSTICO PRIMEIRO
- SEMPRE use \`diagnosticar_usuario_completo\` como primeira ação
- Analise os dados ANTES de responder
- Identifique problemas mesmo que o usuário não saiba explicar

### 2. RESOLVER, NÃO PERGUNTAR
- Se você TEM a informação, USE
- Se você PODE resolver, RESOLVA
- NÃO faça perguntas que você pode responder sozinho

### 3. AÇÕES AUTÔNOMAS vs AÇÕES COM CONFIRMAÇÃO

**EXECUTAR AUTOMATICAMENTE (sem pedir):**
- Diagnósticos e verificações
- Abrir tickets
- Reenviar emails
- Consultar horários

**PEDIR CONFIRMAÇÃO (ação crítica):**
- Corrigir pontos manualmente
- Alterar dados do perfil
- Cancelar/remarcar agendamentos

### 4. TICKETS AUTOMÁTICOS
Quando identificar que NÃO consegue resolver:
- Abra o ticket IMEDIATAMENTE
- NÃO pergunte "posso abrir um ticket?"
- Diga: "Abri um ticket (protocolo XXX) para resolver isso"

### 5. FORMATO DE RESPOSTA
- Máximo 3-4 frases
- Tom: profissional, direto, confiante
- Informe AÇÕES executadas: "Verifiquei seus dados e encontrei X"
- Próximo passo claro ou "Pronto, resolvido!"

## DADOS DO CONTEXTO

- **Usuário**: ${!isGuest ? user.id : 'visitante (não logado)'}
- **Email**: ${user.email || 'não disponível'}
- **Conversa**: ${conversation.id}
- **Logado**: ${!isGuest ? 'Sim' : 'Não'}

## BASE DE CONHECIMENTO

${APP_KNOWLEDGE}

## FERRAMENTAS DISPONÍVEIS

Use as funções para:
- \`diagnosticar_usuario_completo\`: SEMPRE usar primeiro
- \`verificar_agendamento_especifico\`: detalhes de um agendamento
- \`verificar_disponibilidade\`: horários livres
- \`verificar_pagamento_detalhado\`: status de pagamentos
- \`corrigir_ponto_fidelidade\`: liberar ponto (requer confirmação)
- \`criar_ticket_automatico\`: abrir ticket (automático)

## REGRAS CRÍTICAS

1. Se usuário NÃO está logado → funcionalidades limitadas, pedir login
2. Se conta bloqueada → ticket imediato (não pode resolver)
3. Se problema financeiro crítico → ticket de prioridade alta
4. NUNCA diga "não tenho acesso" se você TEM acesso
5. NUNCA peça dados que você pode buscar

Seja o melhor agente de suporte: eficiente, direto e resolutivo.`;
    
    // ========================================
    // CHAMADA DA IA COM TOOLS
    // ========================================

    const initialPayload = {
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        ...conversationHistory
      ],
      tools: AVAILABLE_TOOLS,
      temperature: 0.6,
      max_tokens: 1500
    };

    let aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(initialPayload)
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI Error:', aiResponse.status, errorText);
      throw new Error(`AI error: ${aiResponse.status}`);
    }

    let aiData = await aiResponse.json();
    let choice = aiData.choices[0];
    let iterations = 0;
    const maxIterations = 8; // Mais iterações para resolver problemas complexos

    // ========================================
    // LOOP DE TOOL CALLING
    // ========================================

    while (choice.finish_reason === 'tool_calls' && iterations < maxIterations) {
      iterations++;
      console.log(`🔄 Iteração ${iterations}`);

      const toolCalls = choice.message.tool_calls;
      const toolResults = [];

      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);
        
        // Injetar user_id se não fornecido
        if (!functionArgs.user_id && !isGuest) {
          functionArgs.user_id = user.id;
        }
        
        const result = await executeFunction(functionName, functionArgs, supabase, conversation.id);
        
        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          name: functionName,
          content: result
        });
      }

      // Continuar conversa
      const followUpPayload = {
        model: 'google/gemini-2.5-flash',
        messages: [
          ...initialPayload.messages,
          choice.message,
          ...toolResults
        ],
        tools: AVAILABLE_TOOLS,
        temperature: 0.6,
        max_tokens: 1500
      };

      aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(followUpPayload)
      });

      if (!aiResponse.ok) {
        throw new Error(`AI error: ${aiResponse.status}`);
      }

      aiData = await aiResponse.json();
      choice = aiData.choices[0];
    }

    // Resposta final
    const assistantMessage = choice.message.content || 'Desculpe, ocorreu um erro. Tente novamente.';

    // Salvar resposta
    await supabase.from('support_messages').insert({
      conversation_id: conversation.id,
      role: 'assistant',
      content: assistantMessage
    });

    // Atualizar last_message_at
    await supabase
      .from('support_conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversation.id);

    return new Response(JSON.stringify({
      conversationId: conversation.id,
      response: assistantMessage
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Erro:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      response: 'Desculpe, ocorreu um erro temporário. Por favor, tente novamente em alguns segundos.'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
