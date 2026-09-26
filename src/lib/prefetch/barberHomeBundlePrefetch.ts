import { supabase } from "@/integrations/supabase/client";
import { writeSyncCache } from "@/lib/syncQueryCache";
import type { QueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { hydrateGlobalConfig, type GlobalConfigSnapshot } from "@/lib/globalConfigCache";

/**
 * Pré-aquece o app do barbeiro em UMA única chamada ao banco
 * (RPC get_barber_boot_bundle): contexto, início, perfil, setup,
 * WhatsApp, carteira e manutenção. É o caminho direto do banco para a UI.
 */
const PROFILE_CACHE_PREFIX = "dub:barber-profile:v1:";
const WALLET_CACHE_PREFIX = "dub:barber-wallet:v1:";
const WHATSAPP_CACHE_PREFIX = "dub:barber-whatsapp:v1:";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const s = (v: unknown, fb = ""): string => (typeof v === "string" ? v : fb);

const b = (v: unknown, fb = false): boolean => (typeof v === "boolean" ? v : fb);

const n = (v: unknown, fb = 0): number => {
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : fb;
};

export function applyBarberBootBundle(
  raw: unknown,
  queryClient?: QueryClient,
): { appContext: unknown | null; barbeiroId: string | null } {
  if (!isRecord(raw)) return { appContext: null, barbeiroId: null };

  const appContext = isRecord(raw.appContext) ? raw.appContext : null;
  const barber = appContext && isRecord(appContext.barbeiro) ? appContext.barbeiro : null;
  const barbeiroId = barber ? s(barber.id) : null;
  if (!barbeiroId) return { appContext, barbeiroId: null };

  const dashboard = isRecord(raw.dashboard) ? raw.dashboard : null;
  if (dashboard) {
    writeSyncCache(`barber-dashboard:${barbeiroId}`, dashboard);
    queryClient?.setQueryData(QUERY_KEYS.barbeiro.dashboard(barbeiroId), dashboard);
    try {
      localStorage.setItem(`dub:barber-pending-count:v1:${barbeiroId}`, String(n(dashboard.pendingCount)));
    } catch {}
  }

  const profile = isRecord(raw.profile) ? raw.profile : null;
  if (profile) {
    try {
      localStorage.setItem(
        PROFILE_CACHE_PREFIX + barbeiroId,
        JSON.stringify({
          email: s(profile.email),
          avatarUrl: s(profile.avatarUrl) || null,
          bannerUrl: s(profile.bannerUrl) || null,
          tenantLogo: s(profile.tenantLogo) || null,
          tenantName: s(profile.tenantName),
          tenantSlug: s(profile.tenantSlug) || null,
          updatedAt: Date.now(),
        }),
      );
    } catch {}
  }

  const setup = isRecord(raw.setup) ? raw.setup : null;
  if (setup && Array.isArray(setup.steps)) {
    writeSyncCache(`setup-completion:${barbeiroId}:whatsapp,carteira`, {
      steps: setup.steps,
      percentage: n(setup.percentage),
    });
  }

  const wallet = isRecord(raw.wallet) ? raw.wallet : null;
  if (wallet) {
    try {
      localStorage.setItem(
        WALLET_CACHE_PREFIX + barbeiroId,
        JSON.stringify({
          at: Date.now(),
          walletActive: b(wallet.walletActive),
          barberName: s(wallet.barberName, "Profissional"),
          resolvedBarbeiroId: s(wallet.resolvedBarbeiroId, barbeiroId),
        }),
      );
    } catch {}
  }

  const whatsapp = isRecord(raw.whatsapp) ? raw.whatsapp : null;
  if (whatsapp) {
    try {
      localStorage.setItem(
        WHATSAPP_CACHE_PREFIX + barbeiroId,
        JSON.stringify({
          at: Date.now(),
          isConnected: b(whatsapp.isConnected),
          instanceName: s(whatsapp.instanceName) || null,
          resolvedBarbeiroId: s(whatsapp.resolvedBarbeiroId, barbeiroId),
        }),
      );
    } catch {}
  }

  const maintenance = isRecord(raw.maintenance) ? raw.maintenance : null;
  if (maintenance) {
    hydrateGlobalConfig(maintenance as unknown as GlobalConfigSnapshot);
  }

  return { appContext, barbeiroId };
}

export async function prefetchBarberHomeBundle(
  barbeiroId: string,
  userEmail: string,
  queryClient?: QueryClient,
): Promise<void> {
  if (!barbeiroId) return;
  try {
    const { data, error } = await supabase.rpc("get_barber_boot_bundle");
    if (error || !isRecord(data)) return;

    const applied = applyBarberBootBundle(data, queryClient);
    if (applied.barbeiroId !== barbeiroId && isRecord(data.profile)) {
      try {
        localStorage.setItem(
          PROFILE_CACHE_PREFIX + barbeiroId,
          JSON.stringify({
            email: userEmail,
            avatarUrl: s(data.profile.avatarUrl) || null,
            bannerUrl: s(data.profile.bannerUrl) || null,
            tenantLogo: s(data.profile.tenantLogo) || null,
            tenantName: s(data.profile.tenantName),
            tenantSlug: s(data.profile.tenantSlug) || null,
            updatedAt: Date.now(),
          }),
        );
      } catch {}
    }
  } catch (err) {
    console.debug("[prefetchBarberHomeBundle] skipped:", err);
  }
}
