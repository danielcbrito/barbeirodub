// Cliente HTTP compartilhado da API Woovi (OpenPix).
// Uso: const data = await wooviFetch<T>('/api/v1/charge', { method:'POST', body:{...} })

const WOOVI_BASE = 'https://api.woovi.com';

export class WooviError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
    this.name = 'WooviError';
  }
}

export interface WooviFetchInit {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

export async function wooviFetch<T = unknown>(path: string, init: WooviFetchInit = {}): Promise<T> {
  const appId = (Deno.env.get('WOOVI_APP_ID') ?? '').trim();
  if (!appId) throw new WooviError(500, null, 'WOOVI_APP_ID não configurado');

  const url = path.startsWith('http') ? path : `${WOOVI_BASE}${path}`;
  const res = await fetch(url, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: appId,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    const msg = (parsed && typeof parsed === 'object' && 'message' in (parsed as Record<string, unknown>))
      ? String((parsed as Record<string, unknown>).message)
      : `Woovi HTTP ${res.status}`;
    throw new WooviError(res.status, parsed, msg);
  }

  return parsed as T;
}

// Helpers de resposta padronizada para as edge functions.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-woovi-signature',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function errorResponse(code: string, message: string, status = 400, extra: Record<string, unknown> = {}): Response {
  return jsonResponse({ error: code, message, ...extra }, status);
}
