/**
 * ═══════════════════════════════════════════════════════════
 * CACHE GLOBAL DE CONFIGURAÇÃO — webhook_config
 * ═══════════════════════════════════════════════════════════
 *
 * Antes: cada hook (useMaintenanceMode, useRefreshRequired,
 * banners, etc.) fazia sua própria query em `webhook_config`,
 * multiplicando chamadas repetidas — era o maior consumidor
 * de tempo total no banco.
 *
 * Agora: UMA leitura por sessão + cache síncrono em
 * localStorage + revalidação em background + Realtime
 * compartilhado. Todos os hooks assinam a mesma fonte.
 */
import { supabase } from '@/integrations/supabase/client';

export interface GlobalConfigSnapshot {
  manutencao_ativa: boolean;
  manutencao_mensagem: string | null;
  manutencao_inicio_programada: string | null;
  manutencao_fim_programada: string | null;
  manutencao_aviso_ativo: boolean;
  manutencao_aviso_mensagem: string | null;
  manutencao_aviso_publico: 'cliente' | 'barbeiro' | 'ambos' | null;
  refresh_barber_required_at: string | null;
}

const STORAGE_KEY = 'dub-global-config-v1';
const CACHE_TTL_MS = 5 * 60_000;

type Cached = { at: number; snapshot: GlobalConfigSnapshot | null };
type Listener = (snapshot: GlobalConfigSnapshot | null) => void;

let memoryCache: GlobalConfigSnapshot | null = null;
let fetchedAt = 0;
let inFlight: Promise<GlobalConfigSnapshot | null> | null = null;
let realtimeStarted = false;
const listeners = new Set<Listener>();

function readStored(): Cached | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    if (!parsed || typeof parsed.at !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(snapshot: GlobalConfigSnapshot | null) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ at: Date.now(), snapshot }));
  } catch {}
}

/** Leitura síncrona — 0ms, usada como initial state dos hooks. */
export function getGlobalConfigSync(): GlobalConfigSnapshot | null {
  if (memoryCache) return memoryCache;
  const stored = readStored();
  if (stored) {
    memoryCache = stored.snapshot;
    fetchedAt = stored.at;
    return stored.snapshot;
  }
  return null;
}

export function invalidateGlobalConfig() {
  fetchedAt = 0;
}

export function isGlobalConfigFresh(): boolean {
  return !!memoryCache && Date.now() - fetchedAt < CACHE_TTL_MS;
}

export function hydrateGlobalConfig(snapshot: GlobalConfigSnapshot | null): void {
  memoryCache = snapshot;
  fetchedAt = Date.now();
  writeStored(snapshot);
  listeners.forEach((listener) => listener(snapshot));
}

export async function fetchGlobalConfig(force = false): Promise<GlobalConfigSnapshot | null> {
  const now = Date.now();
  if (!force && memoryCache && now - fetchedAt < CACHE_TTL_MS) {
    return memoryCache;
  }
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const { data, error } = await supabase
        .from('webhook_config')
        .select(
          'manutencao_ativa, manutencao_mensagem, manutencao_inicio_programada, manutencao_fim_programada, manutencao_aviso_ativo, manutencao_aviso_mensagem, manutencao_aviso_publico, refresh_barber_required_at'
        )
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn('[globalConfig] fetch error:', error);
        return memoryCache;
      }

      memoryCache = (data as GlobalConfigSnapshot) ?? null;
      fetchedAt = Date.now();
      writeStored(memoryCache);
      listeners.forEach((l) => l(memoryCache));
      return memoryCache;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export function subscribeGlobalConfig(listener: Listener): () => void {
  listeners.add(listener);
  ensureRealtime();
  return () => {
    listeners.delete(listener);
  };
}

function ensureRealtime() {
  if (realtimeStarted || typeof window === 'undefined') return;
  realtimeStarted = true;
  const channel = supabase
    .channel('global-config-shared')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'webhook_config' },
      () => {
        invalidateGlobalConfig();
        void fetchGlobalConfig(true);
      }
    )
    .subscribe();

  window.addEventListener('beforeunload', () => {
    try {
      supabase.removeChannel(channel);
    } catch {}
  });
}
