/**
 * ═══════════════════════════════════════════════════════════════
 * syncQueryCache — Cache localStorage síncrono para React Query
 * ═══════════════════════════════════════════════════════════════
 *
 * O PersistQueryClientProvider restaura o cache do react-query de
 * forma assíncrona, o que causa "flash de skeleton" no primeiro
 * paint após abrir o app frio (cenário típico: barbeiro volta ao
 * app depois de horas).
 *
 * Este utilitário oferece leitura/escrita SÍNCRONA em localStorage
 * para servir como `initialData` de useQuery. Resultado: mount →
 * renderiza dados antigos em ~0ms → revalida em background.
 *
 * Formato guardado: { t: <timestampMs>, d: <dados> }
 */
import { hasStoredSupabaseSession } from "./sessionGuard";

const PREFIX = "dub:qc:v1:";

interface Entry<T> {
  /** timestamp em ms de quando o dado foi salvo */
  t: number;
  /** payload */
  d: T;
}

export function readSyncCache<T>(key: string): { data: T; updatedAt: number } | null {
  if (typeof window === "undefined") return null;
  // Segurança: só expõe cache do dispositivo se há sessão Supabase válida
  // armazenada. Sem sessão (logout, expirada, outro usuário) → sem cache.
  if (!hasStoredSupabaseSession()) return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Entry<T>;
    if (!parsed || typeof parsed.t !== "number") return null;
    return { data: parsed.d, updatedAt: parsed.t };
  } catch {
    return null;
  }
}

export function writeSyncCache<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  try {
    const entry: Entry<T> = { t: Date.now(), d: data };
    window.localStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    /* quota exceeded — ignora silenciosamente */
  }
}

/**
 * Envolve um fetcher para escrever no cache síncrono após sucesso.
 * Uso: queryFn: withSyncCacheWrite(key, () => fetchX(id))
 */
export function withSyncCacheWrite<T>(key: string, fn: () => Promise<T>): () => Promise<T> {
  return async () => {
    const data = await fn();
    writeSyncCache(key, data);
    return data;
  };
}
