/**
 * ADMIN-CANCEL-APPOINTMENTS EDGE FUNCTION
 *
 * Cancelamento atômico de agendamentos pelo admin.
 * Aceita um array de appointmentIds e para cada um:
 *   1. Busca o agendamento (user_id, servico, hora, preço)
 *   2. Atualiza status → cancelled_by_admin
 *   3. Verifica pagamento com status 'paid' → gera crédito
 *   4. Insere notificação para o cliente
 *
 * Payload: { appointmentIds: string[], reason: string }
 * Retorna: { success: true, data: { cancelled: number, credits: number } }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, ' +
    'x-supabase-client-platform, x-supabase-client-platform-version, ' +
    'x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    // ═══ AUTENTICAÇÃO (deny-by-default) ═══
    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    // ═══ AUTORIZAÇÃO: exige role admin ou tenant_admin ═══
    const { data: roles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);
    const roleList = (roles || []).map((r: any) => r.role);
    const isAdmin = roleList.includes('admin') || roleList.includes('tenant_admin');
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: 'Acesso negado' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { appointmentIds, reason } = await req.json();

    // ═══ Validação ═══
    if (!Array.isArray(appointmentIds) || appointmentIds.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'appointmentIds deve ser um array não vazio' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'reason é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let cancelledCount = 0;
    let creditsCount = 0;

    for (const appointmentId of appointmentIds) {
      // ═══ Passo 1 — Buscar agendamento com dados necessários ═══
      const { data: apt, error: fetchError } = await supabaseAdmin
        .from('agendamentos')
        .select('id, user_id, hora, preco, data, servico_id, servicos(nome)')
        .eq('id', appointmentId)
        .single();

      if (fetchError || !apt) {
        console.error(`[admin-cancel] Agendamento ${appointmentId} não encontrado:`, fetchError);
        continue;
      }

      // ═══ Passo 2 — Atualizar status para cancelled_by_admin ═══
      const { error: updateError } = await supabaseAdmin
        .from('agendamentos')
        .update({
          status: 'cancelled_by_admin',
          cancelado_em: new Date().toISOString(),
          observacoes: `Cancelamento: ${reason.trim()}`,
        })
        .eq('id', appointmentId);

      if (updateError) {
        console.error(`[admin-cancel] Erro ao cancelar ${appointmentId}:`, updateError);
        continue;
      }

      cancelledCount++;

      // ═══ Passo 3 — Verificar pagamento paid → gerar crédito ═══
      const { data: payment } = await supabaseAdmin
        .from('pagamentos')
        .select('id, valor, status')
        .eq('agendamento_id', appointmentId)
        .eq('status', 'paid')
        .maybeSingle();

      if (payment) {
        const { error: creditError } = await supabaseAdmin
          .from('creditos')
          .insert({
            user_id: apt.user_id,
            valor: payment.valor,
            origem: 'cancelamento',
            agendamento_origem_id: appointmentId,
          });

        if (creditError) {
          console.error(`[admin-cancel] Erro ao criar crédito para ${appointmentId}:`, creditError);
        } else {
          creditsCount++;
        }
      }

      // ═══ Passo 4 — Inserir notificação para o cliente ═══
      const serviceName = (apt as any).servicos?.nome || 'Serviço';
      const horaFormatted = apt.hora?.substring(0, 5) || '';
      const creditMsg = payment
        ? ` O valor de R$ ${payment.valor.toFixed(2)} foi adicionado como crédito na sua carteira.`
        : '';

      const { error: notifError } = await supabaseAdmin
        .from('notificacoes')
        .insert({
          user_id: apt.user_id,
          tipo: 'cancelamento',
          titulo: 'Agendamento Cancelado',
          mensagem: `Seu agendamento de ${serviceName} às ${horaFormatted} foi cancelado. Motivo: ${reason.trim()}.${creditMsg}`,
          agendamento_id: appointmentId,
          lida: false,
        });

      if (notifError) {
        console.error(`[admin-cancel] Erro ao criar notificação para ${appointmentId}:`, notifError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: { cancelled: cancelledCount, credits: creditsCount },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[admin-cancel-appointments]', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Erro interno ao cancelar agendamentos',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
