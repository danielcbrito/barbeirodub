// POST {action:'start'} (logado) -> URL de autorização. GET ?code&state -> callback do Mercado Pago.
import { requireUser, serviceClient } from '../_shared/woovi-auth.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/woovi-client.ts';
import { handleMpWebhook } from '../_shared/mercadopago-webhook-handler.ts';
import { APP_ORIGINS, callbackUrl, exchangeCode, readState, signState } from '../_shared/mercadopago-seller.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (new URL(req.url).searchParams.has('b')) return handleMpWebhook(req); // aviso de pagamento
  if (req.method === 'GET') {
    const u = new URL(req.url);
    const state = await readState(u.searchParams.get('state') ?? '').catch(() => null);
    const back = (o: string, s: string) => Response.redirect(`${o}/admin/carteira?mp=${s}`, 302);
    if (!state) return back(APP_ORIGINS[0], 'erro');
    const code = u.searchParams.get('code');
    if (!code) return back(state.o, 'cancelado');
    try {
      const t = await exchangeCode(code);
      const admin = serviceClient();
      const { data: b } = await admin.from('barbeiros').select('id, user_id, tenant_id').eq('id', state.b).maybeSingle();
      if (!b) return back(state.o, 'erro');
      const { error: e1 } = await admin.from('barber_mp_credentials').upsert({ barbeiro_id: b.id, mp_user_id: String(t.user_id),
        access_token: t.access_token, refresh_token: t.refresh_token, expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString() });
      if (e1) throw e1;
      const { error: e2 } = await admin.from('barber_payment_accounts').upsert({ barbeiro_id: b.id, user_id: b.user_id, tenant_id: b.tenant_id,
        provider: 'mercadopago', status: 'approved', status_message: null }, { onConflict: 'barbeiro_id' });
      if (e2) throw e2;
      return back(state.o, 'ok');
    } catch (e) {
      console.error('[mercadopago-oauth]', e instanceof Error ? e.message : e);
      return back(state.o, 'erro');
    }
  }
  const ctx = await requireUser(req);
  if (ctx instanceof Response) return ctx;
  if (!Deno.env.get('MP_CLIENT_ID') || !Deno.env.get('MP_CLIENT_SECRET')) return errorResponse('NOT_CONFIGURED', 'Mercado Pago ainda não configurado', 503);
  const body = await req.json().catch(() => ({}));
  const { data: b } = await ctx.admin.from('barbeiros').select('id').eq('user_id', ctx.userId).eq('ativo', true).limit(1).maybeSingle();
  if (!b) return errorResponse('NOT_FOUND', 'Barbeiro não encontrado', 404);
  const origin = APP_ORIGINS.includes(body.origin) ? body.origin : APP_ORIGINS[0];
  const url = new URL('https://auth.mercadopago.com.br/authorization');
  url.search = new URLSearchParams({ client_id: Deno.env.get('MP_CLIENT_ID')!, response_type: 'code', platform_id: 'mp',
    redirect_uri: callbackUrl(), state: await signState({ b: b.id, o: origin }) }).toString();
  return jsonResponse({ url: url.toString() });
});
