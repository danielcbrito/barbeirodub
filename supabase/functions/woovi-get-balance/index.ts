// Retorna saldo da subconta Woovi do barbeiro autenticado.

import { corsHeaders, errorResponse, jsonResponse, wooviFetch, WooviError } from '../_shared/woovi-client.ts';
import { requireUser } from '../_shared/woovi-auth.ts';

interface WooviSubaccount {
  SubAccount?: { name?: string; pixKey?: string; balance?: number };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const ctx = await requireUser(req);
  if (ctx instanceof Response) return ctx;
  const { userId, admin } = ctx;

  const { data: barb } = await admin
    .from('barbeiros')
    .select('id, woovi_pix_key')
    .eq('user_id', userId)
    .maybeSingle();

  if (!barb?.woovi_pix_key) return jsonResponse({ balance_centavos: 0, has_subaccount: false });

  try {
    const resp = await wooviFetch<WooviSubaccount>(`/api/v1/subaccount/${encodeURIComponent(barb.woovi_pix_key)}`);
    const balance = resp.SubAccount?.balance ?? 0;
    return jsonResponse({ balance_centavos: balance, has_subaccount: true, pix_key: barb.woovi_pix_key });
  } catch (e) {
    if (e instanceof WooviError) return errorResponse('WOOVI_ERROR', e.message, 400, { woovi: e.body });
    return errorResponse('INTERNAL', (e as Error).message, 500);
  }
});
