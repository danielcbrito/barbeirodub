// Aviso do Mercado Pago: só gatilho. Revalida o pagamento com o token do barbeiro e confirma pela função atômica.
import { serviceClient } from './woovi-auth.ts';
import { jsonResponse } from './woovi-client.ts';
import { mpFetch, sellerToken } from './mercadopago-seller.ts';

export async function handleMpWebhook(req: Request): Promise<Response> {
  const u = new URL(req.url);
  let body: any = {};
  try { body = await req.json(); } catch { /* vazio */ }
  const kind = u.searchParams.get('type') ?? u.searchParams.get('topic') ?? body.type ?? body.topic;
  const id = String(u.searchParams.get('data.id') ?? u.searchParams.get('id') ?? body?.data?.id ?? '');
  const barbeiroId = u.searchParams.get('b') ?? '';
  if (kind !== 'payment' || !/^\d+$/.test(id) || !/^[0-9a-f-]{36}$/i.test(barbeiroId)) return jsonResponse({ ok: true, ignored: true });
  const admin = serviceClient();
  try {
    const token = await sellerToken(admin, barbeiroId);
    if (!token) return jsonResponse({ ok: true, ignored: true });
    const p = await mpFetch(token, `v1/payments/${id}`);
    if (p.status !== 'approved' || p.currency_id !== 'BRL') return jsonResponse({ ok: true, status: p.status });
    const { data: row } = await admin.from('woovi_charges').select('value_centavos, barbeiro_id').eq('correlation_id', p.external_reference).maybeSingle();
    const cents = Math.round(Number(p.transaction_amount) * 100);
    if (!row || row.barbeiro_id !== barbeiroId || row.value_centavos !== cents) return jsonResponse({ ok: true, ignored: true });
    const { data, error } = await admin.rpc('confirm_woovi_payment', { p_correlation_id: p.external_reference, p_value_centavos: cents });
    if (error) { console.error('[mercadopago-webhook]', error.message); return jsonResponse({ error: 'RECONCILIATION_REQUIRED' }, 500); }
    return jsonResponse({ ok: true, result: data });
  } catch (e) {
    console.error('[mercadopago-webhook]', e instanceof Error ? e.message : e);
    return jsonResponse({ error: 'FETCH_FAILED' }, 500);
  }
}
