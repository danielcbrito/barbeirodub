// Edge Function: send-push-notification
// Envia notificações FCM HTTP v1 para todos os tokens do barbeiro especificado.
// Autenticação via Service Account JSON (OAuth2). Tokens inválidos são removidos.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { SignJWT, importPKCS8 } from 'https://esm.sh/jose@5.9.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-trigger-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SERVICE_ACCOUNT_RAW = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON') ?? '';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

let cachedToken: { token: string; exp: number } | null = null;
let cachedSA: ServiceAccount | null = null;

function getServiceAccount(): ServiceAccount {
  if (cachedSA) return cachedSA;
  if (!SERVICE_ACCOUNT_RAW) throw new Error('FCM_SERVICE_ACCOUNT_JSON not configured');
  const sa = JSON.parse(SERVICE_ACCOUNT_RAW) as ServiceAccount;
  if (!sa.client_email || !sa.private_key || !sa.project_id) {
    throw new Error('Invalid service account: missing fields');
  }
  // Suporte a \n escapado
  sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  cachedSA = sa;
  return sa;
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const sa = getServiceAccount();
  const key = await importPKCS8(sa.private_key, 'RS256');

  const assertion = await new SignJWT({
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`OAuth2 falhou: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  cachedToken = { token: data.access_token, exp: now + (data.expires_in ?? 3600) };
  return cachedToken.token;
}

interface SendInput {
  barber_id: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Autenticação obrigatória: exige x-trigger-secret válido OU JWT de usuário.
    const triggerSecret = req.headers.get('x-trigger-secret');
    const authHeader = req.headers.get('Authorization') ?? '';

    let authorized = false;

    if (triggerSecret) {
      const { data: secretRow } = await supabase
        .schema('vault' as unknown as 'public')
        .from('decrypted_secrets')
        .select('decrypted_secret')
        .eq('name', 'push_trigger_secret')
        .maybeSingle();
      const expected = (secretRow as { decrypted_secret?: string } | null)?.decrypted_secret;
      if (expected && expected === triggerSecret) {
        authorized = true;
      } else {
        return json({ success: false, error: 'invalid_trigger_secret' }, 401);
      }
    } else if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const anonClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!);
      const { data, error } = await anonClient.auth.getUser(token);
      if (!error && data?.user) {
        authorized = true;
      }
    }

    if (!authorized) {
      return json({ success: false, error: 'unauthorized' }, 401);
    }

    const input = (await req.json()) as SendInput;
    if (!input?.barber_id || !input?.title || !input?.body) {
      return json({ success: false, error: 'missing_fields' }, 400);
    }


    const { data: tokens, error } = await supabase
      .from('barber_fcm_tokens')
      .select('id, token')
      .eq('barbeiro_id', input.barber_id);

    if (error) return json({ success: false, error: error.message }, 500);
    if (!tokens || tokens.length === 0) {
      return json({ success: true, data: { sent: 0, removed: 0, reason: 'no_tokens' } });
    }

    const accessToken = await getAccessToken();
    const sa = getServiceAccount();
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

    let sent = 0;
    const toRemove: string[] = [];

    await Promise.all(
      tokens.map(async (t) => {
        const payload = {
          message: {
            token: t.token,
            notification: { title: input.title, body: input.body },
            webpush: {
              notification: {
                title: input.title,
                body: input.body,
                icon: '/favicon.ico',
                badge: '/favicon.ico',
                requireInteraction: false,
              },
              fcm_options: { link: input.data?.url ?? '/barbeiro' },
            },
            data: input.data
              ? Object.fromEntries(
                  Object.entries(input.data).map(([k, v]) => [k, String(v)]),
                )
              : {},
          },
        };

        const res = await fetch(fcmUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          sent += 1;
          await supabase
            .from('barber_fcm_tokens')
            .update({ last_seen_at: new Date().toISOString() })
            .eq('id', t.id);
          return;
        }

        const errBody = await res.text();
        const isInvalid =
          res.status === 404 ||
          res.status === 400 ||
          /UNREGISTERED|INVALID_ARGUMENT|registration-token-not-registered/i.test(errBody);
        if (isInvalid) {
          toRemove.push(t.id);
        }
        console.warn('FCM send failed', { status: res.status, errBody });
      }),
    );

    if (toRemove.length > 0) {
      await supabase.from('barber_fcm_tokens').delete().in('id', toRemove);
    }

    return json({ success: true, data: { sent, removed: toRemove.length } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('send-push-notification error', msg);
    return json({ success: false, error: msg }, 500);
  }
});
