import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNotificationPermission } from "@/hooks/useNotificationPermission";
import { hasStoredSupabaseSession } from "@/lib/sessionGuard";

/**
 * Verifica se o próprio barbeiro concluiu uma conta para receber Pix.
 * Não herda a conta do proprietário da barbearia e não oferece a antiga subconta.
 */
export function useWalletActivationPrompt(barbeiroId: string | null) {
  const cached = barbeiroId ? readWalletCache(barbeiroId) : null;
  const [shouldShowModal, setShouldShowModal] = useState(false);
  const [walletActive, setWalletActive] = useState<boolean | null>(cached?.walletActive ?? null);
  const [isLoading, setIsLoading] = useState(!cached);
  const [barberName, setBarberName] = useState(cached?.barberName ?? "Profissional");
  const [resolvedBarbeiroId, setResolvedBarbeiroId] = useState<string | null>(cached?.resolvedBarbeiroId ?? null);
  const { sendBrowserNotification } = useNotificationPermission();

  useEffect(() => {
    if (!barbeiroId) {
      setShouldShowModal(false);
      setWalletActive(null);
      setBarberName("Profissional");
      setResolvedBarbeiroId(null);
      setIsLoading(false);
      return;
    }

    const sessionKey = `wallet_prompt_shown_${barbeiroId}`;
    const alreadyPrompted = !!sessionStorage.getItem(sessionKey);

    if (cached && Date.now() - cached.at < 5 * 60_000) {
      setWalletActive(cached.walletActive);
      setBarberName(cached.barberName);
      setResolvedBarbeiroId(cached.resolvedBarbeiroId);
      setIsLoading(false);
      return;
    }

    let alive = true;
    const check = async () => {
      setIsLoading(true);
      setShouldShowModal(false);
      setResolvedBarbeiroId(null);

      try {
        const [barberRes, availabilityRes] = await Promise.all([
          supabase.from("barbeiros").select("apelido").eq("id", barbeiroId).maybeSingle(),
          supabase.rpc("validate_barber_can_receive_pix", { p_barbeiro_id: barbeiroId }),
        ]);
        if (!alive) return;
        if (barberRes.error) throw barberRes.error;

        if (barberRes.data?.apelido) setBarberName(barberRes.data.apelido);
        const active = !availabilityRes.error && availabilityRes.data === true;
        setWalletActive(active);
        setResolvedBarbeiroId(barbeiroId);

        if (!active && !alreadyPrompted) {
          setShouldShowModal(true);
          sessionStorage.setItem(sessionKey, "1");
          sendBrowserNotification("Ative sua conta para receber Pix", {
            body: "Conecte seu Mercado Pago ou conclua sua conta Woovi em Finanças.",
            tag: "wallet-activation",
          });
        }
      } catch (err) {
        if (!alive) return;
        console.error("[useWalletActivationPrompt] Erro:", err);
        setWalletActive(false);
        setResolvedBarbeiroId(barbeiroId);
      } finally {
        if (alive) setIsLoading(false);
      }
    };

    check();
    return () => { alive = false; };
  }, [barbeiroId, sendBrowserNotification]);

  const dismissModal = useCallback(() => {
    setShouldShowModal(false);
  }, []);

  const onActivated = useCallback(() => {
    setShouldShowModal(false);
    setWalletActive(true);
  }, []);

  return {
    shouldShowModal,
    dismissModal,
    onActivated,
    walletActive,
    isLoading: isLoading || (!!barbeiroId && resolvedBarbeiroId !== barbeiroId),
    barberName,
    resolvedBarbeiroId,
  };
}

const WALLET_CACHE_PREFIX = "dub:barber-wallet:v2:";

type CachedWallet = {
  at: number;
  walletActive: boolean;
  barberName: string;
  resolvedBarbeiroId: string;
};

function readWalletCache(barbeiroId: string): CachedWallet | null {
  if (typeof window === "undefined" || !hasStoredSupabaseSession()) return null;
  try {
    const raw = localStorage.getItem(WALLET_CACHE_PREFIX + barbeiroId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedWallet;
    return typeof parsed?.at === "number" ? parsed : null;
  } catch {
    return null;
  }
}
