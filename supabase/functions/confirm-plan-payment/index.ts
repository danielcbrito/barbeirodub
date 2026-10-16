import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Autenticação via getClaims
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub as string;

    const { assinaturaId, formaPagamento } = await req.json();
    if (!assinaturaId) {
      throw new Error('assinaturaId é obrigatório');
    }

    // Buscar assinatura (usando service role para bypass RLS)
    const { data: assinatura, error: assError } = await supabaseAdmin
      .from('assinaturas')
      .select('*, plano:planos(nome, preco_mensal)')
      .eq('id', assinaturaId)
      .single();

    if (assError || !assinatura) {
      throw new Error('Assinatura não encontrada');
    }

    // Verificar permissão: barbeiro vinculado à assinatura, admin ou tenant_admin
    const { data: barbeiro } = await supabaseAdmin
      .from('barbeiros')
      .select('id')
      .eq('user_id', userId)
      .eq('id', assinatura.barbeiro_id)
      .single();

    const { data: roles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    const isAdmin = roles?.some(r => r.role === 'admin' || r.role === 'tenant_admin');

    if (!barbeiro && !isAdmin) {
      throw new Error('Sem permissão para confirmar este pagamento');
    }

    // Verificar status da assinatura
    const isLegacyActiveUnconfirmed = assinatura.status === 'active' && assinatura.cash_payment_confirmed !== true;
    if (!['suspended', 'pending_cash'].includes(assinatura.status) && !isLegacyActiveUnconfirmed) {
      throw new Error('Esta assinatura não possui pagamento pendente');
    }

    if (assinatura.payment_method !== 'cash') {
      throw new Error('Esta assinatura não é do tipo pagamento na barbearia');
    }

    // Marcar pagamentos pendentes de agendamentos vinculados como pagos
    await supabaseAdmin
      .from('pagamentos')
      .update({ status: 'paid' })
      .eq('status', 'pending')
      .in('agendamento_id', 
        (await supabaseAdmin
          .from('agendamentos')
          .select('id')
          .eq('user_id', assinatura.user_id)
          .eq('tipo_agendamento', 'plano')
          .not('status', 'in', "('cancelled_by_user','cancelled_by_admin')")
        ).data?.map((a: any) => a.id) || []
      );

    // Calcular competência (mês atual)
    const competenciaMonth = new Date().toISOString().slice(0, 7) + '-01';

    // Verificar se já foi confirmado neste mês
    const { data: existing } = await supabaseAdmin
      .from('pagamentos_plano_barbearia')
      .select('id')
      .eq('assinatura_id', assinaturaId)
      .eq('competencia', competenciaMonth)
      .maybeSingle();

    if (existing) {
      throw new Error('Pagamento deste mês já foi confirmado');
    }

    // Registrar pagamento
    const { error: insertError } = await supabaseAdmin
      .from('pagamentos_plano_barbearia')
      .insert({
        assinatura_id: assinaturaId,
        user_id: assinatura.user_id,
        barbeiro_id: assinatura.barbeiro_id,
        confirmado_por: userId,
        valor: assinatura.plano?.preco_mensal || 0,
        competencia: competenciaMonth,
        observacoes: formaPagamento ? `Forma de pagamento: ${String(formaPagamento).toUpperCase()}` : null,
      });

    if (insertError) throw insertError;

    // Ativar assinatura + next_billing_date +30 dias
    const nextBilling = new Date();
    nextBilling.setDate(nextBilling.getDate() + 30);

    const { error: updateError } = await supabaseAdmin
      .from('assinaturas')
      .update({
        status: 'active',
        cash_payment_confirmed: true,
        next_billing_date: nextBilling.toISOString().split('T')[0],
        updated_at: new Date().toISOString(),
      })
      .eq('id', assinaturaId);

    if (updateError) throw updateError;

    console.log('Plan payment confirmed:', { assinaturaId, by: userId });

    // Enviar notificação WhatsApp de confirmação do plano
    try {
      const clienteNome = await supabaseAdmin
        .from('profiles')
        .select('nome, telefone')
        .eq('id', assinatura.user_id)
        .single();

      const barbeiroData = await supabaseAdmin
        .from('barbeiros')
        .select('apelido')
        .eq('id', assinatura.barbeiro_id)
        .single();

      if (clienteNome?.data) {
        const primeiroNome = clienteNome.data.nome?.split(' ')[0] || 'Cliente';
        const planoNome = assinatura.plano?.nome || 'Plano';
        const precoTexto = `R$ ${Number(assinatura.plano?.preco_mensal || 0).toFixed(2).replace('.', ',')}`;
        const barbeiroNome = barbeiroData?.data?.apelido || '';

        const mensagem = `Olá ${primeiroNome}! ✅\n\nSeu plano *${planoNome}* foi ativado com sucesso!\n\n💰 Valor: ${precoTexto}/mês${barbeiroNome ? `\n💈 Barbeiro: ${barbeiroNome}` : ''}\n📅 Próxima renovação: ${nextBilling.toLocaleDateString('pt-BR')}\n\nAproveite seus benefícios! 🎉`;

        await supabaseAdmin.functions.invoke('send-webhook-event', {
          body: {
            evento: 'plano_ativado',
            cliente_id: assinatura.user_id,
            cliente_nome: clienteNome.data.nome,
            cliente_telefone: clienteNome.data.telefone,
            barbeiro_id: assinatura.barbeiro_id,
            barbeiro_nome: barbeiroNome,
            mensagem,
          },
        });
      }
    } catch (webhookErr) {
      console.warn('Webhook notification failed (non-blocking):', webhookErr);
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Pagamento confirmado! Plano ativado.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error confirming plan payment:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
