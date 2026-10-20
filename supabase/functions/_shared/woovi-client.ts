// Cliente HTTP compartilhado da API Woovi (OpenPix).
// Uso: const data = await wooviFetch<T>('/api/v1/charge', { method:'POST', body:{...} })

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
  appId?: string;
}

export async function resolveWooviAppId(customAppId?: string): Promise<string> {
  const explicit = (customAppId ?? '').trim();
  if (explicit) return explicit;

  // 1. Tenta carregar do banco de dados (tabela system_config) para permitir atualização sem redeploy
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (supabaseUrl && serviceKey) {
      const admin = createClient(supabaseUrl, serviceKey);
      const { data } = await admin
        .from('system_config')
        .select('valor')
        .eq('chave', 'woovi_app_id')
        .maybeSingle();

      if (data?.valor && typeof data.valor === 'string' && data.valor.trim().length > 0) {
        return data.valor.trim();
      }
    }
  } catch (err) {
    console.warn('[woovi-client] Erro ao buscar woovi_app_id em system_config:', err);
  }

  // 2. Fallback para a variável de ambiente
  return (Deno.env.get('WOOVI_APP_ID') ?? '').trim();
}

export async function wooviFetch<T = unknown>(path: string, init: WooviFetchInit = {}): Promise<T> {
  const appId = await resolveWooviAppId(init.appId);
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
