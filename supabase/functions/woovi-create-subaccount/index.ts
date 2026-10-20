// Cria (ou reutiliza) subconta Woovi para um barbeiro a partir da chave Pix informada.
// Salva woovi_pix_key + woovi_subaccount_name em `barbeiros`.

import { corsHeaders, errorResponse, jsonResponse, wooviFetch, WooviError } from '../_shared/woovi-client.ts';
import { requireUser } from '../_shared/woovi-auth.ts';

interface Body {
  barbeiro_id?: string;
  pix_key: string;
  pix_key_type?: 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'RANDOM';
  name?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const ctx = await requireUser(req);
  if (ctx instanceof Response) return ctx;
  const { userId, admin } = ctx;

  let body: Body;
  try { body = await req.json(); } catch { return errorResponse('BAD_JSON', 'JSON inválido'); }
  const pixKey = (body?.pix_key ?? '').trim();
  if (!pixKey) return errorResponse('MISSING_FIELDS', 'pix_key é obrigatório');

  // Carrega o barbeiro (pelo barbeiro_id ou pelo user_id do usuário logado).
  let query = admin
    .from('barbeiros')
    .select('id, nome, woovi_pix_key, woovi_subaccount_name');
  if (body?.barbeiro_id) {
    query = query.eq('id', body.barbeiro_id);
  } else {
    query = query.eq('user_id', userId);
  }

  const { data: barb, error: bErr } = await query.maybeSingle();
  if (bErr) return errorResponse('DB_ERROR', bErr.message, 500);
  if (!barb) return errorResponse('NOT_A_BARBER', 'Usuário não é barbeiro', 403);

  const subName = (body.name ?? barb.nome ?? `Barbeiro ${barb.id.slice(0, 8)}`).slice(0, 100);

  try {
    // Idempotência: se já tem chave, tenta buscar antes de criar.
    let subaccount: unknown = null;
    try {
      subaccount = await wooviFetch(`/api/v1/subaccount/${encodeURIComponent(pixKey)}`);
    } catch (e) {
      if (!(e instanceof WooviError) || e.status !== 404) throw e;
    }
    if (!subaccount) {
      subaccount = await wooviFetch('/api/v1/subaccount', {
        method: 'POST',
        body: { name: subName, pixKey },
      });
    }

    const { error: upErr } = await admin
      .from('barbeiros')
      .update({
        woovi_pix_key: pixKey,
        woovi_pix_key_type: body.pix_key_type ?? null,
        woovi_subaccount_name: subName,
      })
      .eq('id', barb.id);
    if (upErr) return errorResponse('DB_UPDATE', upErr.message, 500);

    return jsonResponse({ ok: true, subaccount });
  } catch (e) {
    if (e instanceof WooviError) return errorResponse('WOOVI_ERROR', e.message, 400, { woovi: e.body });
    return errorResponse('INTERNAL', (e as Error).message, 500);
  }
});
