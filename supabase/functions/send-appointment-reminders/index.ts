import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireInternalCaller } from "../_shared/internal-auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

/**
 * Formata telefone no padrão WhatsApp: NUMERO@s.whatsapp.net
 */
function formatPhoneForWhatsApp(phone: string | null | undefined): string {
  if (!phone) return '';
  let cleaned = phone.replace(/\D/g, '');
  if (!cleaned) return '';
  if (!cleaned.startsWith('55')) cleaned = '55' + cleaned;
  return `${cleaned}@s.whatsapp.net`;
}

/**
 * Resolve a instância WhatsApp ISOLADA por tenant do barbeiro.
 * Hierarquia: owner do tenant → qualquer barbeiro do tenant → barbeiro direto.
 * Se nenhuma encontrada → retorna null (NÃO envia).
 */
async function resolveWhatsAppInstanceForBarber(
  supabase: any,
  barbeiroId: string
): Promise<{ instance_name: string; api_key: string; status: string } | null> {
  try {
    // Descobrir tenant_id
    const { data: barbeiro } = await supabase
      .from('barbeiros')
      .select('tenant_id')
      .eq('id', barbeiroId)
      .maybeSingle();

    const tenantId = barbeiro?.tenant_id || null;

    if (tenantId) {
      // Prioridade 1: instância do owner do tenant
      const { data: tenant } = await supabase
        .from('tenants')
        .select('owner_user_id')
        .eq('id', tenantId)
        .maybeSingle();

      if (tenant?.owner_user_id) {
        const { data: ownerBarbers } = await supabase
          .from('barbeiros')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('user_id', tenant.owner_user_id);

        if (ownerBarbers?.length) {
          const ownerIds = ownerBarbers.map((b: any) => b.id);
          const { data: ownerInst } = await supabase
            .from('whatsapp_instances')
            .select('instance_name, api_key, status')
            .in('barbeiro_id', ownerIds)
            .eq('status', 'connected')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (ownerInst) return ownerInst;
        }
      }

      // Prioridade 2: qualquer instância do mesmo tenant
      const { data: tenantBarbers } = await supabase
        .from('barbeiros')
        .select('id')
        .eq('tenant_id', tenantId);

      if (tenantBarbers?.length) {
        const ids = tenantBarbers.map((b: any) => b.id);
        const { data: tenantInst } = await supabase
          .from('whatsapp_instances')
          .select('instance_name, api_key, status')
          .in('barbeiro_id', ids)
          .eq('status', 'connected')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (tenantInst) return tenantInst;
      }

      // Tenant existe mas sem WhatsApp → null
      return null;
    }

    // Sem tenant → instância do próprio barbeiro
    const { data: barbInst } = await supabase
      .from('whatsapp_instances')
      .select('instance_name, api_key, status')
      .eq('barbeiro_id', barbeiroId)
      .eq('status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return barbInst || null;
  } catch (e) {
    console.warn('[Reminders] Erro ao resolver instância WhatsApp para barbeiro', barbeiroId, e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const unauthorized = requireInternalCaller(req);
  if (unauthorized) return unauthorized;


  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[Reminders] Verificando agendamentos para lembrete...');

    const now = new Date();
    const fromTime = now;
    const toTime = new Date(now.getTime() + 2 * 60 * 60 * 1000 + 15 * 60 * 1000);

    const todayStr = now.toISOString().split('T')[0];
    const tomorrowStr = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data: appointments, error: aptError } = await supabase
      .from('agendamentos')
      .select('id, data, hora, duracao, preco, status, user_id, servico_id, barbeiro_id, tipo_agendamento')
      .eq('status', 'confirmed')
      .in('data', [todayStr, tomorrowStr]);

    if (aptError) {
      console.error('[Reminders] Erro ao buscar agendamentos:', aptError);
      throw aptError;
    }

    if (!appointments || appointments.length === 0) {
      console.log('[Reminders] Nenhum agendamento confirmado encontrado para hoje/amanhã');
      return new Response(
        JSON.stringify({ message: 'Nenhum agendamento para lembrar', sent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const appointmentsInWindow = appointments.filter(apt => {
      const aptDateTime = new Date(`${apt.data}T${apt.hora}-03:00`);
      return aptDateTime >= fromTime && aptDateTime <= toTime;
    });

    console.log(`[Reminders] ${appointmentsInWindow.length} agendamento(s) na janela de 2h`);

    if (appointmentsInWindow.length === 0) {
      return new Response(
        JSON.stringify({ message: 'Nenhum agendamento na janela de 2h', sent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aptIds = appointmentsInWindow.map(a => a.id);
    const { data: existingLogs } = await supabase
      .from('agendamento_lembretes_log')
      .select('agendamento_id')
      .in('agendamento_id', aptIds)
      .eq('kind', 'reminder_2h')
      .in('status', ['sent', 'pending']);

    const alreadySentIds = new Set((existingLogs || []).map(l => l.agendamento_id));
    const toSend = appointmentsInWindow.filter(a => !alreadySentIds.has(a.id));

    console.log(`[Reminders] ${toSend.length} lembrete(s) para enviar (${alreadySentIds.size} já enviados)`);

    if (toSend.length === 0) {
      return new Response(
        JSON.stringify({ message: 'Todos os lembretes já foram enviados', sent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: config } = await supabase
      .from('webhook_config')
      .select('lembrete_webhook_url, lembrete_ativo')
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!config?.lembrete_webhook_url || !config?.lembrete_ativo) {
      console.log('[Reminders] Webhook de lembrete não configurado ou inativo');
      return new Response(
        JSON.stringify({ message: 'Webhook de lembrete não configurado', sent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: templateData } = await supabase
      .from('mensagem_templates')
      .select('conteudo, ativo')
      .eq('slug', 'lembrete_2h')
      .single();

    const templateConteudo = templateData?.conteudo || null;
    const templateAtivo = templateData?.ativo ?? true;

    if (!templateAtivo) {
      console.log('[Reminders] Template de lembrete desativado');
      return new Response(
        JSON.stringify({ message: 'Template de lembrete desativado', sent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Cache de instâncias WhatsApp por barbeiro_id para evitar queries duplicadas
    const whatsappCache = new Map<string, { instance_name: string; api_key: string; status: string } | null>();
    // Cache da configuração do Agente de IA por barbeiro_id
    const agenteCache = new Map<string, { webhook_agente: string } | null>();
    // Webhook global do agente (sobrescreve o webhook por barbeiro quando definido)
    const { data: globalHook } = await supabase
      .from('agente_webhook_global')
      .select('webhook_url')
      .maybeSingle();
    const agenteWebhookGlobal = (globalHook?.webhook_url || '').trim() || null;


    let sent = 0;
    let errors = 0;
    let skipped = 0;

    for (const apt of toSend) {
      try {
        // Re-verificar status atual
        const { data: currentApt } = await supabase
          .from('agendamentos')
          .select('status')
          .eq('id', apt.id)
          .single();

        if (!currentApt || currentApt.status !== 'confirmed') {
          console.log(`[Reminders] ⏭️ Agendamento ${apt.id} não está mais confirmado (${currentApt?.status}), pulando...`);
          continue;
        }

        // Resolver instância WhatsApp POR BARBEIRO/TENANT (com cache)
        const barbId = apt.barbeiro_id;
        if (!barbId) {
          console.log(`[Reminders] ⏭️ Agendamento ${apt.id} sem barbeiro_id, pulando...`);
          skipped++;
          continue;
        }

        if (!whatsappCache.has(barbId)) {
          whatsappCache.set(barbId, await resolveWhatsAppInstanceForBarber(supabase, barbId));
        }

        const whatsappInstance = whatsappCache.get(barbId) || null;

        if (!whatsappInstance) {
          console.log(`[Reminders] ⏭️ Barbeiro ${barbId} sem WhatsApp conectado, lembrete pulado para agendamento ${apt.id}`);
          
          await supabase.from('agendamento_lembretes_log').insert({
            agendamento_id: apt.id,
            user_id: apt.user_id,
            kind: 'reminder_2h',
            scheduled_for: `${apt.data}T${apt.hora}`,
            channel: 'webhook',
            status: 'skipped',
            details: { reason: 'nenhuma_instancia_whatsapp_conectada', barbeiro_id: barbId },
          });

          skipped++;
          continue;
        }

        // Buscar dados do cliente
        const { data: profile } = await supabase
          .from('profiles')
          .select('nome, telefone, cpf')
          .eq('id', apt.user_id)
          .single();

        // Buscar serviço
        const { data: servico } = await supabase
          .from('servicos')
          .select('nome')
          .eq('id', apt.servico_id)
          .single();

        // Buscar barbeiro
        let barbeiroNome = '';
        if (apt.barbeiro_id) {
          const { data: barbeiro } = await supabase
            .from('barbeiros')
            .select('apelido')
            .eq('id', apt.barbeiro_id)
            .single();
          barbeiroNome = barbeiro?.apelido || '';
        }

        const clienteNome = profile?.nome || 'Cliente';
        const clienteTelefone = profile?.telefone || '';
        const servicoNome = servico?.nome || 'seu serviço';
        const comBarbeiro = barbeiroNome ? ` com ${barbeiroNome}` : '';

        const dataObj = new Date(`${apt.data}T00:00:00`);
        const dataFormatada = dataObj.toLocaleDateString('pt-BR', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
        });
        const horaFormatada = apt.hora.substring(0, 5);

        let mensagem: string;
        if (templateConteudo) {
          mensagem = templateConteudo
            .replace(/\{nome\}/g, clienteNome.split(' ')[0])
            .replace(/\{hora\}/g, horaFormatada)
            .replace(/\{data\}/g, dataFormatada)
            .replace(/\{servico\}/g, servicoNome)
            .replace(/\{barbeiro\}/g, comBarbeiro)
            .replace(/\{preco\}/g, `R$ ${Number(apt.preco).toFixed(2).replace('.', ',')}`);
        } else {
          mensagem = `Olá ${clienteNome.split(' ')[0]}! 👋\n\nSeu horário é *hoje às ${horaFormatada}* ✂️\n📅 ${dataFormatada}\n💈 ${servicoNome}${comBarbeiro}\n\n⚠️ *Não vai poder comparecer?*\nAbra o app agora e toque em "Remarcar" ou "Cancelar" para liberar o horário.\n\nTe esperamos! 💪`;
        }

        // Verificar se o Agente de IA está ativo para este barbeiro
        if (!agenteCache.has(barbId)) {
          const { data: agenteCfg } = await supabase
            .from('agente_config')
            .select('ativo, webhook_agente')
            .eq('barbeiro_id', barbId)
            .maybeSingle();
          agenteCache.set(
            barbId,
            agenteCfg?.ativo && agenteCfg?.webhook_agente
              ? { webhook_agente: agenteCfg.webhook_agente }
              : null,
          );
        }
        const agente = agenteCache.get(barbId) || null;

        const basePayload = {
          evento: 'lembrete_agendamento',
          evento_id: crypto.randomUUID(),
          descricao: 'Lembrete automático 2h antes do agendamento',
          timestamp: new Date().toISOString(),
          agendamento_id: apt.id,
          data: apt.data,
          hora: apt.hora,
          duracao_minutos: apt.duracao,
          status: 'confirmado',
          tipo_agendamento: apt.tipo_agendamento || 'normal',
          servico_id: apt.servico_id,
          servico: servicoNome,
          preco: apt.preco,
          valor_total: apt.preco,
          cliente_id: apt.user_id,
          cliente_nome: clienteNome,
          cliente_telefone: clienteTelefone,
          cliente_telefone_whatsapp: formatPhoneForWhatsApp(clienteTelefone),
          cliente_cpf: profile?.cpf || null,
          barbeiro_id: apt.barbeiro_id,
          barbeiro_nome: barbeiroNome,
          mensagem: mensagem,
          whatsapp_instance: whatsappInstance,
        };

        // Payload enxuto no formato esperado pelo agente de IA
        const agentePayload = {
          evento: 'lembrete_agendamento',
          agendamento_id: apt.id,
          cliente_nome: clienteNome,
          cliente_telefone: (clienteTelefone || '').replace(/\D/g, '')
            ? ((clienteTelefone || '').replace(/\D/g, '').startsWith('55')
                ? (clienteTelefone || '').replace(/\D/g, '')
                : '55' + (clienteTelefone || '').replace(/\D/g, ''))
            : '',
          barbeiro_id: apt.barbeiro_id,
          barbeiro_nome: barbeiroNome,
          servico_nome: servicoNome,
          data: apt.data,
          hora: horaFormatada,
          instance_name: whatsappInstance.instance_name,
          api_key: whatsappInstance.api_key,
        };

        const targetUrl = agente
          ? (agenteWebhookGlobal || agente.webhook_agente)
          : config.lembrete_webhook_url;
        const payload = agente ? agentePayload : basePayload;

        console.log(
          `[Reminders] Enviando lembrete para ${clienteNome} via ${whatsappInstance.instance_name} (${agente ? 'agente_ia' : 'padrao'})`,
        );

        const webhookResponse = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });


        const success = webhookResponse.ok;

        await supabase.from('agendamento_lembretes_log').insert({
          agendamento_id: apt.id,
          user_id: apt.user_id,
          kind: 'reminder_2h',
          scheduled_for: `${apt.data}T${apt.hora}`,
          sent_at: success ? new Date().toISOString() : null,
          channel: 'webhook',
          status: success ? 'sent' : 'failed',
          details: {
            webhook_status: webhookResponse.status,
            cliente_nome: clienteNome,
            servico: servicoNome,
            whatsapp_instance_name: whatsappInstance.instance_name,
            barbeiro_id: apt.barbeiro_id,
            rota: agente ? 'agente_ia' : 'padrao',

          },
        });

        if (success) {
          sent++;
          console.log(`[Reminders] ✅ Lembrete enviado para ${clienteNome}`);
        } else {
          errors++;
          console.error(`[Reminders] ❌ Falha no lembrete para ${clienteNome}: ${webhookResponse.status}`);
        }
      } catch (err) {
        errors++;
        console.error(`[Reminders] Erro ao processar lembrete para agendamento ${apt.id}:`, err);
      }
    }

    console.log(`[Reminders] Concluído: ${sent} enviados, ${errors} erros, ${skipped} pulados (sem WhatsApp)`);

    return new Response(
      JSON.stringify({ message: 'Lembretes processados', sent, errors, skipped, total: toSend.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Reminders] Erro fatal:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
