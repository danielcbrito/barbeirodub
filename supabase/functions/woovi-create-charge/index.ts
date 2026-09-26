// Cria cobrança Pix Woovi para um agendamento, com split para a subconta do barbeiro.
// Idempotente por correlation_id (= agendamento_id).

import { corsHeaders, errorResponse, jsonResponse, wooviFetch, WooviError } from '../_shared/woovi-client.ts';
import { requireUser } from '../_shared/woovi-auth.ts';

interface Body { agendamento_id: string; value_centavos?: number }
interface WooviCharge {
  charge?: {
    correlationID?: string;
    identifier?: string;
    brCode?: string;
    qrCodeImage?: string;
    value?: number;
    status?: string;
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const ctx = await requireUser(req);
  if (ctx instanceof Response) return ctx;
  const { userId, admin } = ctx;

  let body: Body;
  try { body = await req.json(); } catch { return errorResponse('BAD_JSON', 'JSON inválido'); }
  if (!body?.agendamento_id) return errorResponse('MISSING_FIELDS', 'agendamento_id obrigatório');

  const { data: ag, error } = await admin
    .from('agendamentos')
    .select('id, cliente_id, barbeiro_id, valor_total, valor, status')
    .eq('id', body.agendamento_id)
    .maybeSingle();
  if (error) return errorResponse('DB_ERROR', error.message, 500);
  if (!ag) return errorResponse('NOT_FOUND', 'Agendamento não encontrado', 404);
  if (ag.cliente_id !== userId) return errorResponse('FORBIDDEN', 'Sem permissão', 403);

  const valor = Number(ag.valor_total ?? ag.valor ?? 0);
  const cents = body.value_centavos ?? Math.round(valor * 100);
  if (!cents || cents < 100) return errorResponse('INVALID_VALUE', 'Valor mínimo R$1,00');

  const { data: barb } = await admin
    .from('barbeiros')
    .select('woovi_pix_key')
    .eq('id', ag.barbeiro_id)
    .maybeSingle();

  const correlationID = ag.id;
  const chargeBody: Record<string, unknown> = {
    correlationID,
    value: cents,
    comment: `Agendamento ${ag.id.slice(0, 8)}`,
  };
  if (barb?.woovi_pix_key) {
    chargeBody.splits = [{ splitType: 'SPLIT_SUB_ACCOUNT', pixKey: barb.woovi_pix_key, value: cents }];
  }

  try {
    const resp = await wooviFetch<WooviCharge>('/api/v1/charge', { method: 'POST', body: chargeBody });
    const ch = resp.charge ?? {};

    await admin.from('woovi_charges').upsert({
      agendamento_id: ag.id,
      barbeiro_id: ag.barbeiro_id,
      user_id: ag.cliente_id,
      correlation_id: correlationID,
      charge_id: ch.identifier ?? null,
      br_code: ch.brCode ?? null,
      qr_code_image: ch.qrCodeImage ?? null,
      value_centavos: cents,
      status: ch.status ?? 'ACTIVE',
      raw_response: resp as unknown as Record<string, unknown>,
    }, { onConflict: 'correlation_id' });

    return jsonResponse({
      ok: true,
      correlation_id: correlationID,
      br_code: ch.brCode,
      qr_code_image: ch.qrCodeImage,
      value_centavos: cents,
    });
  } catch (e) {
    if (e instanceof WooviError) return errorResponse('WOOVI_ERROR', e.message, 400, { woovi: e.body });
    return errorResponse('INTERNAL', (e as Error).message, 500);
  }
});
