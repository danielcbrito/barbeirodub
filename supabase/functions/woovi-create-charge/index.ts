// Charge an owned appointment using its persisted price, never a caller-supplied amount.
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/woovi-client.ts';
import { requireUser } from '../_shared/woovi-auth.ts';
import { createWooviCharge } from '../_shared/woovi-charge.ts';

interface Body { agendamento_id: string }

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
    .select('id, user_id, barbeiro_id, preco, preco_final, status')
    .eq('id', body.agendamento_id)
    .maybeSingle();
  if (error) return errorResponse('DB_ERROR', error.message, 500);
  if (!ag) return errorResponse('NOT_FOUND', 'Agendamento não encontrado', 404);
  if (ag.user_id !== userId) return errorResponse('FORBIDDEN', 'Sem permissão', 403);
  if (!ag.barbeiro_id || !['pending', 'confirmed'].includes(ag.status)) return errorResponse('INVALID_APPOINTMENT', 'Agendamento não aceita pagamento');

  try {
    const amount = Number(ag.preco_final ?? ag.preco);
    const charge = await createWooviCharge(admin, { correlationID: ag.id, userId, barberId: ag.barbeiro_id,
      amount, comment: `Agendamento ${ag.id.slice(0, 8)}`, target: { agendamento_id: ag.id } });
    return jsonResponse({
      ok: true,
      correlation_id: charge.id,
      br_code: charge.pixQrCode.payload,
      qr_code_image: charge.pixQrCode.encodedImage,
      value_centavos: Math.round(amount * 100),
    });
  } catch (e) {
    return errorResponse('WOOVI_ERROR', e instanceof Error ? e.message : 'Erro ao criar cobrança', 400);
  }
});
