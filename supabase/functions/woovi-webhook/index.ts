// Webhook público Woovi. Trata OPENPIX:CHARGE_COMPLETED e TRANSACTION_RECEIVED.
// Valida assinatura HMAC do provedor e revalida a cobrança na API antes de creditar.

import { corsHeaders, jsonResponse, wooviFetch } from '../_shared/woovi-client.ts';
import { serviceClient } from '../_shared/woovi-auth.ts';
import { assertConfirmedAmount } from '../_shared/woovi-payment-policy.ts';
import { hmacSha256Hex, timingSafeEqual } from '../_shared/internal-auth.ts';

interface WooviWebhookEvent {
  event?: string;
  charge?: { correlationID?: string; identifier?: string; status?: string; value?: number };
  pix?: { endToEndId?: string };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);

  // ============================================
  // VALIDAÇÃO DE ORIGEM (deny by default)
  // ============================================
  const webhookSecret = Deno.env.get('WOOVI_WEBHOOK_SECRET');
  if (!webhookSecret) {
    console.error('[woovi-webhook] WOOVI_WEBHOOK_SECRET não configurado — rejeitando');
    return jsonResponse({ error: 'UNAUTHORIZED', message: 'webhook secret not configured' }, 401);
  }

  const rawBody = await req.text();
  const providedSig = (
    req.headers.get('x-webhook-signature') ??
    req.headers.get('x-woovi-signature') ??
    req.headers.get('signature') ??
    ''
  ).replace(/^sha256=/, '');
  const expected = await hmacSha256Hex(webhookSecret, rawBody);

  const staticOk = providedSig.length > 0 && timingSafeEqual(providedSig, webhookSecret);
  const hmacOk = providedSig.length > 0 && timingSafeEqual(providedSig.toLowerCase(), expected.toLowerCase());

  if (!staticOk && !hmacOk) {
    console.warn('[woovi-webhook] Assinatura inválida — rejeitando');
    return jsonResponse({ error: 'UNAUTHORIZED', message: 'invalid signature' }, 401);
  }

  let payload: WooviWebhookEvent;
  try { payload = JSON.parse(rawBody); } catch { return jsonResponse({ error: 'BAD_JSON' }, 400); }

  const admin = serviceClient();

  // Registra bruto para auditoria (best-effort).
  try {
    await admin.from('webhook_logs').insert({
      provider: 'woovi',
      event_type: payload.event ?? 'unknown',
      payload: payload as unknown as Record<string, unknown>,
    });
  } catch { /* tabela pode não ter esse formato — ignora */ }

  const event = payload.event ?? '';
  const correlationId = payload.charge?.correlationID;
  const isCompleted = event.includes('CHARGE_COMPLETED') || event.includes('TRANSACTION_RECEIVED');

  if (!isCompleted || !correlationId) {
    return jsonResponse({ ok: true, ignored: true });
  }

  // ============================================
  // REVALIDAR COBRANÇA DIRETAMENTE NA API WOOVI
  // Nunca confiar apenas no payload recebido antes de creditar carteira.
  // ============================================
  let confirmedValue = 0;
  let confirmedStatus = '';
  try {
    const remote = await wooviFetch<{ charge?: { status?: string; value?: number } }>(
      `/api/v1/charge/${encodeURIComponent(correlationId)}`,
    );
    confirmedStatus = String(remote.charge?.status ?? '');
    confirmedValue = Number(remote.charge?.value ?? 0);
  } catch (e) {
    console.error('[woovi-webhook] Falha ao revalidar cobrança na Woovi:', e);
    return jsonResponse({ error: 'REVALIDATION_FAILED' }, 502);
  }

  if (confirmedStatus !== 'COMPLETED') {
    console.warn('[woovi-webhook] Cobrança não está COMPLETED na Woovi — ignorando', { correlationId, confirmedStatus });
    return jsonResponse({ ok: true, ignored: true, reason: 'not_completed_at_source' });
  }

  const { data: chargeRow, error: lookupError } = await admin.from('woovi_charges')
    .select('value_centavos').eq('correlation_id', correlationId).maybeSingle();
  if (lookupError) return jsonResponse({ error: 'DB_ERROR' }, 500);
  if (!chargeRow) return jsonResponse({ error: 'UNKNOWN_CHARGE' }, 404);
  try { assertConfirmedAmount(chargeRow.value_centavos, confirmedValue, confirmedStatus); }
  catch { return jsonResponse({ error: 'VALUE_MISMATCH' }, 409); }
  const { data, error } = await admin.rpc('confirm_woovi_payment', {
    p_correlation_id: correlationId, p_value_centavos: confirmedValue,
  });
  if (error) {
    console.error('[woovi-webhook] Reconciliação necessária:', error.message);
    return jsonResponse({ error: 'RECONCILIATION_REQUIRED', message: error.message }, 409);
  }
  return jsonResponse({ ok: true, result: data });
});
