import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

/**
 * Edge Function: authorize-transfer-webhook
 * 
 * Webhook de autorização de transferências do Asaas.
 * Configurado em: Menu do usuário > Integrações > Mecanismos de Segurança
 * 
 * IMPORTANTE: Esta configuração na conta raiz se propaga automaticamente
 * para TODAS as subcontas (barbeiros), resolvendo o 2FA para todos.
 * 
 * Fluxo:
 * 1. Asaas cria transferência via API
 * 2. Asaas aguarda 5 segundos
 * 3. Asaas faz POST para esta URL com o payload da transferência
 * 4. Verificamos se é um saque legítimo registrado no banco
 * 5. Respondemos APPROVED ou REFUSED
 * 
 * Formatos de payload possíveis:
 * - {"type": "TRANSFER", "transfer": {...}}
 * - {"type": "PIX_QR_CODE", "pixQrCode": {...}}
 * - {"type": "BILL", "bill": {...}}
 * - Outros tipos (aprovamos por padrão pois não são saques)
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, asaas-access-token',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const webhookToken = Deno.env.get('ASAAS_TRANSFER_WEBHOOK_TOKEN');

    // ============================================
    // VALIDAÇÃO DO TOKEN (obrigatória — deny by default)
    // ============================================
    if (!webhookToken) {
      console.error('[authorize-transfer] ASAAS_TRANSFER_WEBHOOK_TOKEN não configurado');
      return jsonResponse({ status: 'REFUSED', reason: 'webhook token not configured' }, 401);
    }
    const receivedToken = req.headers.get('asaas-access-token');
    if (receivedToken !== webhookToken) {
      console.warn('[authorize-transfer] ⚠️ Token inválido — rejeitando');
      return jsonResponse({ status: 'REFUSED', reason: 'invalid token' }, 401);
    }

    const body = await req.json();
    
    // Log do tipo de evento recebido
    console.log('[authorize-transfer] Evento recebido:', {
      type: body.type,
      hasTransfer: !!body.transfer,
      hasBill: !!body.bill,
      hasPixQrCode: !!body.pixQrCode,
      hasPixRefund: !!body.pixRefund,
      hasMobileRecharge: !!body.mobilePhoneRecharge,
    });

    // ============================================
    // IDENTIFICAR TIPO DE EVENTO
    // ============================================
    // Apenas eventos TRANSFER precisam de validação de saque.
    // Outros tipos (BILL, PIX_QR_CODE etc.) NÃO são fluxos financeiros da nossa app
    // e portanto devem ser recusados por padrão para não abrir brechas.
    if (body.type && body.type !== 'TRANSFER') {
      console.warn(`[authorize-transfer] Tipo ${body.type} não permitido — REFUSED`);
      return jsonResponse({ status: 'REFUSED', reason: `type ${body.type} not allowed` });
    }

    // ============================================
    // EXTRAIR DADOS DA TRANSFERÊNCIA
    // ============================================
    let transfer: Record<string, unknown> | null = null;

    if (body.transfer && typeof body.transfer === 'object') {
      transfer = body.transfer;
    } else if (body.id && body.value !== undefined) {
      transfer = body;
    }

    if (!transfer) {
      console.warn('[authorize-transfer] Payload sem dados de transferência — REFUSED');
      return jsonResponse({ status: 'REFUSED', reason: 'missing transfer payload' });
    }

    const transferId = transfer.id as string | undefined;
    const valor = Number(transfer.value ?? 0);
    const operationType = transfer.operationType || transfer.type;
    const status = transfer.status;

    console.log('[authorize-transfer] Transferência:', { transferId, valor, operationType, status });

    if (!valor || valor <= 0) {
      console.warn('[authorize-transfer] Valor inválido ou zero — REFUSED');
      return jsonResponse({ status: 'REFUSED', reason: 'invalid amount' });
    }

    // ============================================
    // VERIFICAR SAQUE CORRESPONDENTE NO BANCO
    // ============================================
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: saquesPendentes, error } = await supabase
      .from('saques')
      .select('id, user_id, valor, status, created_at')
      .in('status', ['processando', 'concluido'])
      .gte('created_at', umaHoraAtras)
      .gte('valor', valor - 0.10)
      .lte('valor', valor + 0.10)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.error('[authorize-transfer] Erro ao buscar saques — REFUSED por segurança:', error);
      return jsonResponse({ status: 'REFUSED', reason: 'db error' });
    }

    if (!saquesPendentes || saquesPendentes.length === 0) {
      console.warn('[authorize-transfer] Nenhum saque correspondente — REFUSED', { valor });
      return jsonResponse({ status: 'REFUSED', reason: 'no matching withdrawal' });
    }

    const saqueMatch = saquesPendentes[0];
    console.log('[authorize-transfer] Saque correspondente encontrado:', {
      saqueId: saqueMatch.id, valor: saqueMatch.valor, status: saqueMatch.status,
    });

    if (saqueMatch.status === 'processando') {
      const { error: updateError } = await supabase
        .from('saques')
        .update({ status: 'concluido', processado_em: new Date().toISOString() })
        .eq('id', saqueMatch.id);
      if (updateError) console.error('[authorize-transfer] Erro ao atualizar saque:', updateError);
    }

    console.log('[authorize-transfer] APPROVED:', transferId || valor);
    return jsonResponse({ status: 'APPROVED' });

  } catch (err) {
    console.error('[authorize-transfer] Erro geral — REFUSED por segurança:', err);
    return jsonResponse({ status: 'REFUSED', reason: 'unexpected error' });
  }
});
