/**
 * ═══════════════════════════════════════════════════════════════
 * sessionGuard — Verifica presença de sessão Supabase antes de
 * expor dados cacheados no dispositivo.
 * ═══════════════════════════════════════════════════════════════
 *
 * Serve para gating dos caches síncronos: se não há token válido
 * no localStorage (sessão expirada, logout, outro usuário), os
 * dados anteriores NÃO devem ser reexibidos sem revalidação.
 */
export function hasStoredSupabaseSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const authKey = Object.keys(window.localStorage).find(
      (key) => key.startsWith("sb-") && key.endsWith("-auth-token"),
    );
    if (!authKey) return false;

    const raw = window.localStorage.getItem(authKey);
    if (!raw) return false;

    const parsed = JSON.parse(raw);
    const user = parsed?.user || parsed?.currentSession?.user;
    if (!user?.id) return false;

    // Se a sessão tiver expires_at (segundos UNIX), respeitar.
    const expiresAt =
      parsed?.expires_at ??
      parsed?.currentSession?.expires_at ??
      null;
    if (typeof expiresAt === "number" && expiresAt > 0) {
      // Considera válida se expira em >0s (o refresh cuida do resto).
      // Se já expirou há mais de 24h, invalida o cache.
      const nowSec = Math.floor(Date.now() / 1000);
      if (expiresAt + 60 * 60 * 24 < nowSec) return false;
    }

    return true;
  } catch {
    return false;
  }
}

/** Retorna o id do usuário armazenado no token, se houver. */
export function getStoredSupabaseUserId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const authKey = Object.keys(window.localStorage).find(
      (key) => key.startsWith("sb-") && key.endsWith("-auth-token"),
    );
    if (!authKey) return null;
    const raw = window.localStorage.getItem(authKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const user = parsed?.user || parsed?.currentSession?.user;
    return user?.id ?? null;
  } catch {
    return null;
  }
}

/** Remove todo cache de usuário e sincronização do localStorage e sessionStorage */
export function clearDeviceCaches(): void {
  if (typeof window === "undefined") return;
  try {
    const keys = Object.keys(window.localStorage);
    const exactKeysToRemove = new Set([
      "barbeiroId",
      "userRole",
      "barbeirodub_meta_mensal",
      "dub_pending_barber_tenant",
      "dub_pending_barber_invite",
      "emailParaLogin",
      "pendingVerificationEmail",
      "dub-rq-cache-v2-lite",
      "dub-rq-cache-v1",
      "barber_setup_dismissed",
    ]);

    for (const key of keys) {
      if (
        key.startsWith("dub:") ||
        key.startsWith("dub-") ||
        key.startsWith("dub_") ||
        key.startsWith("barbeiro_carteira_") ||
        key.startsWith("sync-cache:") ||
        exactKeysToRemove.has(key)
      ) {
        window.localStorage.removeItem(key);
      }
    }

    window.sessionStorage.clear();
  } catch {
    /* ignora */
  }
}

/** Encerra a sessão Supabase e remove de forma garantida todos os dados locais do dispositivo */
export async function signOutAndClearDevice(navigate?: (url: string) => void): Promise<void> {
  try {
    clearDeviceCaches();
  } catch {}

  try {
    const { supabase } = await import("@/integrations/supabase/client");
    await supabase.auth.signOut();
  } catch (err) {
    console.error("Erro ao encerrar sessão Supabase:", err);
  } finally {
    clearDeviceCaches();
    if (navigate) {
      navigate("/login");
    } else if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }
}
