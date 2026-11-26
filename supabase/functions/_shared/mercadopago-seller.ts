// Mercado Pago Connect: cada barbeiro conecta a própria conta (OAuth) e o Pix sai no nome dele.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const API = 'https://api.mercadopago.com';
export const APP_ORIGINS = ['https://barbeirodub.lovable.app', 'https://id-preview--bb9e9713-76ad-4c43-b625-e789cde8ffbc.lovable.app'];
export const callbackUrl = () => `${Deno.env.get('SUPABASE_URL')}/functions/v1/mercadopago-oauth`;

const enc = new TextEncoder();
async function hmac(data: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(Deno.env.get('MP_OAUTH_STATE_SECRET')!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
  return btoa(String.fromCharCode(...sig)).replace(/[+/=]/g, (c) => (c === '+' ? '-' : c === '/' ? '_' : ''));
}
export async function signState(p: { b: string; o: string }) {
  const body = btoa(JSON.stringify({ ...p, t: Date.now() })).replace(/=+$/, '');
  return `${body}.${await hmac(body)}`;
}
export async function readState(state: string): Promise<{ b: string; o: string } | null> {
  const [body, sig] = state.split('.');
  if (!body || !sig || (await hmac(body)) !== sig) return null;
  const p = JSON.parse(atob(body));
  if (Date.now() - p.t > 30 * 60 * 1000) return null;
  return { b: p.b, o: APP_ORIGINS.includes(p.o) ? p.o : APP_ORIGINS[0] };
}

async function tokenRequest(body: Record<string, string>) {
  const r = await fetch(`${API}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: Deno.env.get('MP_CLIENT_ID'), client_secret: Deno.env.get('MP_CLIENT_SECRET'), ...body }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Mercado Pago OAuth [${r.status}]: ${j.message ?? 'falha'}`);
  return j as { access_token: string; refresh_token: string; expires_in: number; user_id: number };
}
export const exchangeCode = (code: string) => tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: callbackUrl() });

/** Token válido do barbeiro (renova sozinho perto de expirar) ou null se não conectou. */
export async function sellerToken(admin: SupabaseClient<any>, barbeiroId: string): Promise<string | null> {
  const { data } = await admin.from('barber_mp_credentials').select('*').eq('barbeiro_id', barbeiroId).maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() > Date.now() + 86400000) return data.access_token;
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: data.refresh_token });
  await admin.from('barber_mp_credentials').update({ access_token: t.access_token, refresh_token: t.refresh_token,
    expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString() }).eq('barbeiro_id', barbeiroId);
  return t.access_token;
}

export async function mpFetch<T = any>(token: string, path: string, init: { method?: string; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  const r = await fetch(`${API}/${path}`, { method: init.method ?? 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
    ...(init.idempotencyKey ? { 'X-Idempotency-Key': init.idempotencyKey } : {}) }, ...(init.body ? { body: JSON.stringify(init.body) } : {}) });
  if (!r.ok) throw new Error(`Mercado Pago ${path} [${r.status}]: ${await r.text()}`);
  return r.json();
}
