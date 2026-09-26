/**
 * Captura e resgate do código de indicação ("Convide e Ganhe").
 *
 * Fluxo:
 *  1. O cliente compartilha o link da barbearia com ?ref=CODIGO.
 *  2. Ao abrir o link, registramos o clique (registrar_click_indicacao) e
 *     guardamos o código localmente.
 *  3. Quando o visitante cria conta / entra, vinculamos a indicação
 *     (registrar_indicacao). O restante do ciclo (agendou → cortou → crédito)
 *     já é tratado por triggers no banco.
 */
import { supabase } from "@/integrations/supabase/client";

const REF_KEY = "dub:referral-code";
const SESSION_KEY = "dub:referral-session";
const REDEEMED_KEY = "dub:referral-redeemed";

function getSessionId(): string {
  let sid = localStorage.getItem(SESSION_KEY);
  if (!sid || sid.length < 8) {
    sid = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    localStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}

export function getStoredReferralCode(): string | null {
  const code = localStorage.getItem(REF_KEY);
  return code && code.length > 0 ? code : null;
}

/** Lê ?ref= da URL atual, guarda e registra o clique. Idempotente. */
export async function captureReferralFromUrl(): Promise<void> {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("ref") || params.get("indicacao");
    if (!raw) return;
    const code = raw.trim().toUpperCase();
    if (code.length < 4) return;

    const already = localStorage.getItem(REF_KEY);
    localStorage.setItem(REF_KEY, code);
    if (already === code) return;

    await (supabase.rpc as any)("registrar_click_indicacao", {
      p_codigo: code,
      p_session_id: getSessionId(),
    });
  } catch (err) {
    console.warn("[referral] captura falhou", err);
  }
}

/** Vincula a indicação ao usuário recém-logado/cadastrado. Idempotente. */
export async function redeemPendingReferral(userId: string): Promise<void> {
  try {
    const code = getStoredReferralCode();
    if (!code) return;
    if (localStorage.getItem(REDEEMED_KEY) === `${userId}:${code}`) return;

    await (supabase.rpc as any)("registrar_indicacao", {
      p_indicado_id: userId,
      p_codigo: code,
      p_session_id: getSessionId(),
    });
    localStorage.setItem(REDEEMED_KEY, `${userId}:${code}`);
  } catch (err) {
    console.warn("[referral] vínculo falhou", err);
  }
}

/** Monta o link de convite do cliente. */
export function buildReferralLink(code: string, tenantSlug?: string | null): string {
  const base = window.location.origin;
  const path = tenantSlug ? `/${tenantSlug}` : "/";
  return `${base}${path}?ref=${code}`;
}
