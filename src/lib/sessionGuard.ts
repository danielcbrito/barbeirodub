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

/** Remove todo cache síncrono (chaves com prefixo dub:) do localStorage. */
export function clearDeviceCaches(): void {
  if (typeof window === "undefined") return;
  try {
    const keys = Object.keys(window.localStorage);
    for (const key of keys) {
      if (key.startsWith("dub:") || key.startsWith("dub-")) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    /* ignora */
  }
}
