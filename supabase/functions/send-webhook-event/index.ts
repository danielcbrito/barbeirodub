import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Formata o número de telefone no padrão WhatsApp: NUMERO@s.whatsapp.net
 */
function formatPhoneForWhatsApp(phone: string | null | undefined): string {
  if (!phone) return '';
  let cleaned = phone.replace(/\D/g, '');
  if (!cleaned) return '';
  if (!cleaned.startsWith('55')) {
    cleaned = '55' + cleaned;
  }
  return `${cleaned}@s.whatsapp.net`;
}

/**
 * Mapeamento de evento → slug do template no banco
 */
const EVENTO_TO_SLUG: Record<string, string> = {
  'agendamento_criado': 'novo_agendamento',
  'agendamento_confirmado': 'confirmacao_agendamento',
  'agendamento_cancelado': 'cancelamento_agendamento',
  'lembrete_agendamento': 'lembrete_2h',
};

/**
 * Busca o template de mensagem do banco de dados e substitui variáveis.
 */
async function gerarMensagemDoTemplate(
  supabase: any,
  evento: string,
  vars: {
    nome: string;
    data: string;
    hora: string;
    servico: string;
    preco: string;
    barbeiro: string;
    comBarbeiro: string;
    motivo: string;
  }
): Promise<string> {
  const { nome, data, hora, servico, preco, comBarbeiro, motivo } = vars;

  const slug = EVENTO_TO_SLUG[evento];
  if (slug) {
    try {
      const { data: template } = await supabase
        .from('mensagem_templates')
        .select('conteudo, ativo')
        .eq('slug', slug)
        .single();

      if (template?.conteudo && template.ativo) {
        return template.conteudo
          .replace(/\{nome\}/g, nome)
          .replace(/\{hora\}/g, hora)
          .replace(/\{data\}/g, data)
          .replace(/\{servico\}/g, servico)
          .replace(/\{barbeiro\}/g, comBarbeiro)
          .replace(/\{preco\}/g, preco);
      }
    } catch (e) {
      console.warn(`[send-webhook-event] Template '${slug}' não encontrado:`, e);
    }
  }

  // Fallback
  switch (evento) {
    case 'agendamento_criado':
      return `Olá ${nome}! 🎉\n\nSeu agendamento foi criado!\n\n📅 ${data}\n⏰ ${hora}\n✂️ ${servico}${comBarbeiro}\n💰 ${preco}\n\nAguarde a confirmação do barbeiro. 🔔`;
    case 'agendamento_confirmado':
      return `Olá ${nome}! 🎉\n\nSeu agendamento foi confirmado!\n\n📅 ${data}\n⏰ ${hora}\n✂️ ${servico}${comBarbeiro}\n💰 ${preco}\n\nAguardamos você! Qualquer dúvida, estamos à disposição.`;
    case 'agendamento_cancelado':
      return `Olá ${nome}!\n\nSeu agendamento para ${data} às ${hora}${comBarbeiro} foi cancelado.\n\nSe precisar remarcar, acesse nosso app ou entre em contato.`;
    case 'remarcacao_solicitada':
      return `Olá ${nome}!\n\nPrecisamos remarcar seu agendamento de ${data} às ${hora}${comBarbeiro}.\n\nMotivo: ${motivo}\n\nPor favor, acesse o app para escolher um novo horário.`;
    case 'lembrete_agendamento':
      return `Olá ${nome}! 📢\n\nLembrete: Seu agendamento é amanhã!\n\n📅 ${data}\n⏰ ${hora}\n✂️ ${servico}${comBarbeiro}\n\nTe esperamos!`;
    case 'atendimento_finalizado':
      return `Olá ${nome}! 💈\n\nObrigado pela visita${comBarbeiro}! Esperamos que tenha gostado do ${servico}.\n\nVolte sempre! ⭐`;
    default:
      return `Olá ${nome}! Temos uma atualização sobre seu agendamento. Acesse o app para mais detalhes.`;
  }
}

// ================================================================
// HANDLER PRINCIPAL
// ================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const raw = await req.json();

    console.log('[send-webhook-event] Evento recebido:', raw.evento);

    // ── 1. Buscar config do webhook ──────────────────────────
    const { data: config, error: configError } = await supabase
      .from('webhook_config')
      .select('webhook_url, ativo')
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (configError || !config?.webhook_url || !config?.ativo) {
      console.log('[send-webhook-event] Webhook não configurado ou inativo');
      return new Response(
        JSON.stringify({ success: false, error: 'Webhook não configurado ou inativo' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // ── 2. Variáveis base vindas do payload ──────────────────
    let evento        = raw.evento || 'evento_desconhecido';
    let evento_id     = raw.evento_id || crypto.randomUUID();
    let descricao     = raw.descricao || null;
    let timestamp     = raw.timestamp || new Date().toISOString();

    let agendamento_id    = raw.agendamento_id || null;
    let data_agendamento  = raw.data || null;
    let hora              = raw.hora || null;
    let duracao_minutos   = raw.duracao_minutos || null;
    let status            = raw.status || null;
    let tipo_agendamento  = raw.tipo_agendamento || null;
    let observacoes       = raw.observacoes || null;

    let servico_id  = raw.servico_id || null;
    let servico     = raw.servico || null;

    let preco                   = raw.preco ?? null;
    let valor_total             = raw.valor_total ?? null;
    let valor_pago_app          = raw.valor_pago_app ?? null;
    let valor_pago_creditos     = raw.valor_pago_creditos ?? null;
    let metodo_pagamento        = raw.metodo_pagamento || null;
    let saldo_creditos_restante = raw.saldo_creditos_restante ?? null;

    let cliente_id                = raw.cliente_id || null;
    let cliente_nome              = raw.cliente_nome || null;
    let cliente_telefone          = raw.cliente_telefone || null;
    let cliente_telefone_whatsapp = raw.cliente_telefone_whatsapp || null;
    let cliente_email             = raw.cliente_email || null;
    let cliente_cpf               = raw.cliente_cpf || null;

    let barbeiro_id   = raw.barbeiro_id || null;
    let barbeiro_nome = raw.barbeiro_nome || null;

    let mensagem_barbeiro = raw.mensagem_barbeiro || null;
    let mensagem          = raw.mensagem || null;
    let motivo            = raw.motivo || null;
    let detalhes          = raw.detalhes || null;

    let whatsapp_instance = raw.whatsapp_instance || null;

    // ── 3. Enriquecer com dados do agendamento se faltam ─────
    if (agendamento_id && (!servico || !data_agendamento || !hora || !barbeiro_id)) {
      try {
        const { data: apt } = await supabase
          .from('agendamentos')
          .select(`
            data, hora, duracao, preco, status, tipo_agendamento, observacoes,
            servico_id, barbeiro_id,
            servicos:servico_id (nome)
          `)
          .eq('id', agendamento_id)
          .single();

        if (apt) {
          data_agendamento = data_agendamento || apt.data;
          hora             = hora || apt.hora;
          duracao_minutos  = duracao_minutos || apt.duracao;
          preco            = preco ?? apt.preco;
          valor_total      = valor_total ?? apt.preco;
          status           = status || apt.status;
          tipo_agendamento = tipo_agendamento || apt.tipo_agendamento;
          observacoes      = observacoes || apt.observacoes;
          servico_id       = servico_id || apt.servico_id;
          barbeiro_id      = barbeiro_id || apt.barbeiro_id;

          if (apt.servicos && typeof apt.servicos === 'object') {
            servico = servico || (apt.servicos as { nome?: string }).nome || null;
          }
        }
      } catch (e) {
        console.warn('[send-webhook-event] Erro ao buscar agendamento:', e);
      }
    }

    // ── 4. Enriquecer dados do cliente ───────────────────────
    if (cliente_id && (!cliente_nome || !cliente_telefone)) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('nome, telefone, cpf')
          .eq('id', cliente_id)
          .single();

        if (profile) {
          cliente_nome     = cliente_nome || profile.nome;
          cliente_telefone = cliente_telefone || profile.telefone;
          cliente_cpf      = cliente_cpf || profile.cpf;
        }
      } catch (e) {
        console.warn('[send-webhook-event] Erro ao buscar perfil do cliente:', e);
      }
    }

    // Garantir formato WhatsApp
    if (cliente_telefone) {
      cliente_telefone_whatsapp = formatPhoneForWhatsApp(cliente_telefone);
    }

    // ── 5. Enriquecer dados do barbeiro ──────────────────────
    if (barbeiro_id && !barbeiro_nome) {
      try {
        const { data: barb } = await supabase
          .from('barbeiros')
          .select('apelido')
          .eq('id', barbeiro_id)
          .single();

        if (barb) {
          barbeiro_nome = barb.apelido;
        }
      } catch (e) {
        console.warn('[send-webhook-event] Erro ao buscar barbeiro:', e);
      }
    }

    // ── 6. Buscar instância WhatsApp do TENANT do barbeiro ──
    // Se não houver instância conectada → NÃO envia mensagem
    whatsapp_instance = null;
    try {
      // Descobrir tenant_id do barbeiro
      let tenantId: string | null = null;
      if (barbeiro_id) {
        const { data: barbData } = await supabase
          .from('barbeiros')
          .select('tenant_id')
          .eq('id', barbeiro_id)
          .maybeSingle();
        tenantId = barbData?.tenant_id || null;
      }

      if (tenantId) {
        // Prioridade 1: instância do owner do tenant
        const { data: tenant } = await supabase
          .from('tenants')
          .select('owner_user_id')
          .eq('id', tenantId)
          .maybeSingle();

        if (tenant?.owner_user_id) {
          // Primeiro encontrar barbeiros do owner neste tenant
          const { data: ownerBarbers } = await supabase
            .from('barbeiros')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('user_id', tenant.owner_user_id);

          if (ownerBarbers?.length) {
            const ownerBarberIds = ownerBarbers.map(b => b.id);
            // Buscar instância conectada APENAS dos barbeiros do owner
            const { data: ownerInst } = await supabase
              .from('whatsapp_instances')
              .select('instance_name, api_key, status')
              .in('barbeiro_id', ownerBarberIds)
              .eq('status', 'connected')
              .order('updated_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (ownerInst) {
              whatsapp_instance = {
                instance_name: ownerInst.instance_name,
                api_key: ownerInst.api_key,
                status: ownerInst.status,
              };
            }
          }
        }

        // Prioridade 2: qualquer instância do mesmo tenant
        if (!whatsapp_instance) {
          const { data: tenantBarbers } = await supabase
            .from('barbeiros')
            .select('id')
            .eq('tenant_id', tenantId);

          if (tenantBarbers?.length) {
            const ids = tenantBarbers.map(b => b.id);
            const { data: tenantInst } = await supabase
              .from('whatsapp_instances')
              .select('instance_name, api_key, status')
              .in('barbeiro_id', ids)
              .eq('status', 'connected')
              .order('updated_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (tenantInst) {
              whatsapp_instance = {
                instance_name: tenantInst.instance_name,
                api_key: tenantInst.api_key,
                status: tenantInst.status,
              };
            }
          }
        }
      } else if (barbeiro_id) {
        // Sem tenant → buscar instância do próprio barbeiro
        const { data: barbInst } = await supabase
          .from('whatsapp_instances')
          .select('instance_name, api_key, status')
          .eq('barbeiro_id', barbeiro_id)
          .eq('status', 'connected')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (barbInst) {
          whatsapp_instance = {
            instance_name: barbInst.instance_name,
            api_key: barbInst.api_key,
            status: barbInst.status,
          };
        }
      }

      if (whatsapp_instance) {
        console.log('[send-webhook-event] WhatsApp encontrado:', whatsapp_instance.instance_name);
      } else {
        console.log('[send-webhook-event] Nenhuma instância WhatsApp conectada para este tenant/barbeiro. Mensagem NÃO será enviada.');
        return new Response(
          JSON.stringify({ success: false, error: 'Nenhuma instância WhatsApp conectada para esta barbearia' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }
    } catch (e) {
      console.warn('[send-webhook-event] Erro ao buscar instância WhatsApp:', e);
    }

    // ── 7. Gerar mensagem do template (se não veio pronta) ───
    if (!mensagem && evento !== 'disparo_mensagem') {
      const primeiroNome = cliente_nome?.split(' ')[0] || 'Cliente';
      const dataFormatada = data_agendamento
        ? new Date(data_agendamento + 'T00:00:00').toLocaleDateString('pt-BR', {
            weekday: 'long', day: '2-digit', month: 'long',
          })
        : '';
      const horaFormatada = hora ? hora.substring(0, 5) : '';
      const servicoTexto  = servico || 'seu serviço';
      const precoTexto    = preco != null ? `R$ ${Number(preco).toFixed(2).replace('.', ',')}` : '';
      const barbeiroTexto = barbeiro_nome || '';
      const comBarbeiro   = barbeiroTexto ? ` com ${barbeiroTexto}` : '';

      mensagem = await gerarMensagemDoTemplate(supabase, evento, {
        nome: primeiroNome,
        data: dataFormatada,
        hora: horaFormatada,
        servico: servicoTexto,
        preco: precoTexto,
        barbeiro: barbeiroTexto,
        comBarbeiro,
        motivo: motivo || 'Imprevisto',
      });
    }

    // ── 8. Montar payload FINAL padronizado ──────────────────
    // TODOS os campos SEMPRE presentes, mesmo que null
    const finalPayload = {
      // Identificação do evento
      evento,
      evento_id,
      descricao,
      timestamp,

      // Agendamento
      agendamento_id,
      data: data_agendamento,
      hora,
      duracao_minutos,
      status,
      tipo_agendamento,
      observacoes,

      // Serviço
      servico_id,
      servico,

      // Financeiro
      preco,
      valor_total,
      valor_pago_app,
      valor_pago_creditos,
      metodo_pagamento,
      saldo_creditos_restante,

      // Cliente
      cliente_id,
      cliente_nome,
      cliente_telefone,
      cliente_telefone_whatsapp,
      cliente_email,
      cliente_cpf,

      // Barbeiro
      barbeiro_id,
      barbeiro_nome,

      // Mensagens
      mensagem,
      mensagem_barbeiro,
      motivo,

      // WhatsApp (SEMPRE presente)
      whatsapp_instance,

      // Extras
      detalhes,
    };

    console.log('[send-webhook-event] Enviando para:', config.webhook_url);
    console.log('[send-webhook-event] WhatsApp:', cliente_telefone_whatsapp);
    console.log('[send-webhook-event] Instance:', whatsapp_instance?.instance_name || 'N/A');

    // ── 9. Enviar ────────────────────────────────────────────
    const webhookResponse = await fetch(config.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finalPayload),
    });

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      console.error('[send-webhook-event] Webhook erro:', webhookResponse.status, errorText);

      await supabase.from('system_logs').insert({
        level: 'error',
        category: 'webhook',
        message: `Falha ao enviar evento ${evento}`,
        details: {
          evento,
          evento_id,
          cliente_id,
          barbeiro_id,
          status_code: webhookResponse.status,
          error: errorText,
          whatsapp_instance_name: whatsapp_instance?.instance_name || null,
        },
      });

      return new Response(
        JSON.stringify({ success: false, error: `Webhook retornou status ${webhookResponse.status}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log('[send-webhook-event] ✅ Enviado com sucesso');

    await supabase.from('system_logs').insert({
      level: 'info',
      category: 'webhook',
      message: `Evento ${evento} enviado`,
      details: {
        evento,
        evento_id,
        agendamento_id,
        cliente_id,
        barbeiro_id,
        cliente_telefone_whatsapp,
        whatsapp_instance_name: whatsapp_instance?.instance_name || null,
      },
    });

    return new Response(
      JSON.stringify({ success: true, evento_id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[send-webhook-event] Erro fatal:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
