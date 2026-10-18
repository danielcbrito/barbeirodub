// Solicita saque (withdraw) da subconta Woovi para a chave Pix do próprio barbeiro.
// Requer sessão de PIN financeira válida (financeiro_auth_sessions).

import { corsHeaders, errorResponse, jsonResponse, wooviFetch, WooviError } from '../_shared/woovi-client.ts';
import { requireUser } from '../_shared/woovi-auth.ts';

interface Body { value_centavos: number; pin?: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const ctx = await requireUser(req);
  if (ctx instanceof Response) return ctx;
  const { userId, admin } = ctx;

  let body: Body;
  try { body = await req.json(); } catch { return errorResponse('BAD_JSON', 'JSON inválido'); }
  const cents = Number(body?.value_centavos ?? 0);
  if (!Number.isFinite(cents) || cents < 100) return errorResponse('INVALID_VALUE', 'Valor mínimo R$1,00');

  // Se veio PIN no corpo, valida diretamente no banco e renova sessão
  if (body?.pin && typeof body.pin === "string") {
    const { data: pinOk } = await admin.rpc("verify_financial_pin", {
      p_pin: body.pin,
    });
    if (pinOk) {
      await admin.from("financeiro_auth_sessions").insert({
        user_id: userId,
        token_hash: btoa(`${userId}:${Date.now()}:${crypto.randomUUID()}`),
        expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      });
    }
  }

  // Sessão de PIN válida?
  const { data: pinSess } = await admin
    .from('financeiro_auth_sessions')
    .select('id, expires_at')
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!pinSess) return errorResponse('PIN_REQUIRED', 'Sessão de PIN expirada', 401);

  const { data: barb } = await admin
    .from('barbeiros')
    .select('id, woovi_pix_key')
    .eq('user_id', userId)
    .maybeSingle();
  if (!barb?.woovi_pix_key) return errorResponse('NO_SUBACCOUNT', 'Cadastre uma chave Pix primeiro', 400);

  try {
    const resp = await wooviFetch(`/api/v1/subaccount/${encodeURIComponent(barb.woovi_pix_key)}/withdraw`, {
      method: 'POST',
      body: { value: cents },
    });

    const { data: saque, error: sErr } = await admin.from('saques').insert({
      user_id: userId,
      barbeiro_id: barb.id,
      valor: cents / 100,
      chave_pix_valor: barb.woovi_pix_key,
      chave_pix_tipo: 'PIX',
      status: 'processando',
    }).select('id').single();
    if (sErr) console.warn('[woovi-withdraw] falha ao registrar saque', sErr.message);

    return jsonResponse({ ok: true, saque_id: saque?.id, woovi: resp });
  } catch (e) {
    if (e instanceof WooviError) return errorResponse('WOOVI_ERROR', e.message, 400, { woovi: e.body });
    return errorResponse('INTERNAL', (e as Error).message, 500);
  }
});
