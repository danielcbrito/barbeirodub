// Webhook público Woovi. Revalida cobranças e Pix Automático na API antes de liberar acesso.
import { corsHeaders, jsonResponse, wooviFetch } from '../_shared/woovi-client.ts';
import { serviceClient } from '../_shared/woovi-auth.ts';
import { assertConfirmedAmount } from '../_shared/woovi-payment-policy.ts';
import { hmacSha256Hex, timingSafeEqual } from '../_shared/internal-auth.ts';
import { hasCompletedTenantInstallment, isApprovedTenantSubscription, isCompletedTenantCharge } from '../_shared/tenant-plan-policy.ts';

interface WooviWebhookEvent {
  event?: string;
  correlationID?: string;
  globalID?: string;
  value?: number;
  charge?: { correlationID?: string; identifier?: string; status?: string; value?: number };
  pix?: { endToEndId?: string };
}

interface RemoteSubscription {
  subscription?: {
    globalID?: string;
    correlationID?: string;
    status?: string;
    value?: number;
    pixRecurring?: { status?: string; journey?: string };
  };
}

interface RemoteInstallments {
  installments?: Array<{ status?: string; value?: number }>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const webhookSecret = Deno.env.get('WOOVI_WEBHOOK_SECRET');
  if (!webhookSecret) {
    console.error('[woovi-webhook] WOOVI_WEBHOOK_SECRET não configurado — rejeitando');
    return jsonResponse({ error: 'UNAUTHORIZED', message: 'webhook secret not configured' }, 401);
  }

  const rawBody = await req.text();
  const providedSig = (
    req.headers.get('x-webhook-signature')
    ?? req.headers.get('x-woovi-signature')
    ?? req.headers.get('signature')
    ?? ''
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
  try {
    await admin.from('webhook_logs').insert({
      provider: 'woovi',
      event_type: payload.event ?? 'unknown',
      payload: payload as unknown as Record<string, unknown>,
    });
  } catch { /* auditoria best-effort */ }

  const event = payload.event ?? '';

  if (event === 'PIX_AUTOMATIC_APPROVED' || event === 'PIX_AUTOMATIC_COBR_COMPLETED') {
    const correlationId = payload.correlationID;
    const globalID = payload.globalID;
    if (!correlationId || !globalID) return jsonResponse({ error: 'INVALID_PIX_AUTOMATIC_PAYLOAD' }, 400);

    let remote: RemoteSubscription;
    try {
      remote = await wooviFetch<RemoteSubscription>(
        `/api/v1/subscriptions/${encodeURIComponent(globalID)}`,
      );
    } catch (error) {
      console.error('[woovi-webhook] Falha ao revalidar Pix Automático:', error);
      return jsonResponse({ error: 'REVALIDATION_FAILED' }, 502);
    }

    const subscription = remote.subscription;
    const confirmedValue = Number(subscription?.value ?? 0);
    const validSubscription = subscription?.globalID === globalID
      && isApprovedTenantSubscription(subscription, correlationId, confirmedValue);
    if (!validSubscription) {
      return jsonResponse({ ok: true, ignored: true, reason: 'subscription_not_active_at_source' });
    }

    const { data: chargeRow, error: lookupError } = await admin.from('woovi_charges')
      .select('value_centavos').eq('correlation_id', correlationId).maybeSingle();
    if (lookupError) return jsonResponse({ error: 'DB_ERROR' }, 500);
    if (!chargeRow) return jsonResponse({ error: 'UNKNOWN_CHARGE' }, 404);
    try { assertConfirmedAmount(chargeRow.value_centavos, confirmedValue, 'COMPLETED'); }
    catch { return jsonResponse({ error: 'VALUE_MISMATCH' }, 409); }

    if (event === 'PIX_AUTOMATIC_COBR_COMPLETED') {
      try {
        const installments = await wooviFetch<RemoteInstallments>(
          `/api/v1/subscriptions/${encodeURIComponent(globalID)}/installments`,
        );
        if (!hasCompletedTenantInstallment(installments.installments, confirmedValue)) {
          return jsonResponse({ error: 'COMPLETED_INSTALLMENT_NOT_FOUND' }, 409);
        }
      } catch (error) {
        console.error('[woovi-webhook] Falha ao revalidar parcela do Pix Automático:', error);
        return jsonResponse({ error: 'INSTALLMENT_REVALIDATION_FAILED' }, 502);
      }
    }

    const { data, error } = await admin.rpc('confirm_tenant_plan_payment', {
      p_correlation_id: correlationId,
      p_value_centavos: confirmedValue,
      p_remote_payload: remote,
      p_renewal: event === 'PIX_AUTOMATIC_COBR_COMPLETED',
    });
    if (error) {
      console.error('[woovi-webhook] Falha ao liberar/renovar plano:', error.message);
      return jsonResponse({ error: 'RECONCILIATION_REQUIRED', message: error.message }, 409);
    }
    return jsonResponse({ ok: true, result: data });
  }

  const correlationId = payload.charge?.correlationID;
  const isCompleted = event.includes('CHARGE_COMPLETED') || event.includes('TRANSACTION_RECEIVED');
  if (!isCompleted || !correlationId) return jsonResponse({ ok: true, ignored: true });

  let confirmedValue = 0;
  let confirmedStatus = '';
  let remote: { charge?: { correlationID?: string; status?: string; value?: number } };
  try {
    remote = await wooviFetch<{ charge?: { correlationID?: string; status?: string; value?: number } }>(
      `/api/v1/charge/${encodeURIComponent(correlationId)}`,
    );
    confirmedStatus = String(remote.charge?.status ?? '');
    confirmedValue = Number(remote.charge?.value ?? 0);
  } catch (error) {
    console.error('[woovi-webhook] Falha ao revalidar cobrança na Woovi:', error);
    return jsonResponse({ error: 'REVALIDATION_FAILED' }, 502);
  }

  if (!isCompletedTenantCharge(remote.charge, correlationId, confirmedValue)) {
    console.warn('[woovi-webhook] Cobrança ainda não concluída — ignorando', { correlationId, confirmedStatus });
    return jsonResponse({ ok: true, ignored: true, reason: 'not_completed_at_source' });
  }

  const { data: chargeRow, error: lookupError } = await admin.from('woovi_charges')
    .select('value_centavos, metadata').eq('correlation_id', correlationId).maybeSingle();
  if (lookupError) return jsonResponse({ error: 'DB_ERROR' }, 500);
  if (!chargeRow) return jsonResponse({ error: 'UNKNOWN_CHARGE' }, 404);
  try { assertConfirmedAmount(chargeRow.value_centavos, confirmedValue, confirmedStatus); }
  catch { return jsonResponse({ error: 'VALUE_MISMATCH' }, 409); }

  if (chargeRow.metadata?.kind === 'tenant_plan') {
    const { data, error } = await admin.rpc('confirm_tenant_plan_payment', {
      p_correlation_id: correlationId,
      p_value_centavos: confirmedValue,
      p_remote_payload: remote,
      p_renewal: false,
    });
    if (error) {
      console.error('[woovi-webhook] Falha ao liberar plano por cobrança mensal:', error.message);
      return jsonResponse({ error: 'RECONCILIATION_REQUIRED', message: error.message }, 409);
    }
    return jsonResponse({ ok: true, result: data });
  }

  const { data, error } = await admin.rpc('confirm_woovi_payment', {
    p_correlation_id: correlationId,
    p_value_centavos: confirmedValue,
  });
  if (error) {
    console.error('[woovi-webhook] Reconciliação necessária:', error.message);
    return jsonResponse({ error: 'RECONCILIATION_REQUIRED', message: error.message }, 409);
  }
  return jsonResponse({ ok: true, result: data });
});
