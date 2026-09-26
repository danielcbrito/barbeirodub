/**
 * ═══════════════════════════════════════════════════════════
 * RESPONSE — Padrão de resposta para TODAS as Edge Functions
 * ═══════════════════════════════════════════════════════════
 *
 * REGRA: Toda Edge Function DEVE retornar:
 *   Sucesso → ok(data)
 *   Erro    → fail(code, message, status?)
 *
 * Isso garante que o frontend pode sempre esperar:
 *   { success: true, data: T }
 *   { success: false, error: { code, message } }
 */

/* ─── Types ────────────────────────────────────────────── */

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    /** Código identificador (ex: 'BARBER_NOT_FOUND', 'INVALID_SLOT') */
    code: string;
    /** Mensagem legível para o usuário ou dev */
    message: string;
    /** Contexto extra (opcional, para debugging) */
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

/* ─── CORS Headers ─────────────────────────────────────── */

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, " +
    "x-supabase-client-platform, x-supabase-client-platform-version, " +
    "x-supabase-client-runtime, x-supabase-client-runtime-version, " +
    "x-cron-secret, x-webhook-signature",
};

/* ─── Helpers ──────────────────────────────────────────── */

/**
 * Retorna Response de sucesso com { success: true, data }
 */
export function ok<T>(data: T, status = 200): Response {
  const body: ApiSuccess<T> = { success: true, data };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

/**
 * Retorna Response de erro com { success: false, error: { code, message } }
 */
export function fail(
  code: string,
  message: string,
  status = 400,
  details?: unknown
): Response {
  const body: ApiError = {
    success: false,
    error: { code, message, ...(details ? { details } : {}) },
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

/**
 * Handler para requisições OPTIONS (preflight CORS)
 */
export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}

/**
 * Parse seguro do body JSON. Retorna null se inválido.
 */
export async function parseBody<T = Record<string, unknown>>(
  req: Request
): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
