import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNotificationPermission } from "@/hooks/useNotificationPermission";
import { hasStoredSupabaseSession } from "@/lib/sessionGuard";

/**
 * Hook que verifica se o barbeiro precisa ativar a carteira digital.
 * Se sim, dispara:
 * 1. Auto-open do WalletActivationModal (1x por sessão)
 * 2. Notificação push do navegador
 * 
 * Usa sessionStorage para evitar re-prompt na mesma sessão.
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

    // Já mostrou nesta sessão — ainda assim verifica o status real
    const alreadyPrompted = !!sessionStorage.getItem(sessionKey);

    if (cached && Date.now() - cached.at < 5 * 60_000) {
      setWalletActive(cached.walletActive);
      setBarberName(cached.barberName);
      setResolvedBarbeiroId(cached.resolvedBarbeiroId);
      setIsLoading(false);
      return;
    }

    const check = async () => {
      setIsLoading(true);
      setShouldShowModal(false);
      setResolvedBarbeiroId(null);

      try {
        const { data: barber } = await supabase
          .from("barbeiros")
          .select("woovi_pix_key, conta_configurada, conta_financeira_id, apelido, user_id, tenant_id")
          .eq("id", barbeiroId)
          .maybeSingle();

        if (!barber) {
          setWalletActive(false);
          setResolvedBarbeiroId(barbeiroId);
          return;
        }

        if (barber.apelido) setBarberName(barber.apelido);

        const hasConfiguredWallet =
          !!barber.woovi_pix_key ||
          (!!barber.conta_configurada && !!barber.conta_financeira_id);

        if (hasConfiguredWallet) {
          setWalletActive(true);
          setResolvedBarbeiroId(barbeiroId);
          return;
        }

        // Barbeiro de tenant (não-owner) usa carteira compartilhada do dono
        if (barber.tenant_id && barber.user_id) {
          const { data: tenantData } = await supabase
            .from("tenants")
            .select("owner_user_id")
            .eq("id", barber.tenant_id)
            .maybeSingle();

          if (tenantData?.owner_user_id && tenantData.owner_user_id !== barber.user_id) {
            setWalletActive(true);
            setResolvedBarbeiroId(barbeiroId);
            return;
          }
        }

        // Verificar role global do barbeiro
        if (barber.user_id) {
          const { data: roles } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", barber.user_id);

          const userRoles = (roles || []).map((r) => String(r.role));

          if (userRoles.includes("admin")) {
            setWalletActive(true);
            setResolvedBarbeiroId(barbeiroId);
            return;
          }

          const hasBarberRole = userRoles.includes("barber") || userRoles.includes("barbeiro");
          const isEmployee = hasBarberRole && !userRoles.includes("admin") && !userRoles.includes("tenant_admin");
          if (isEmployee) {
            setWalletActive(true);
            setResolvedBarbeiroId(barbeiroId);
            return;
          }
        }

        const { data: priv } = await supabase
          .from("barbeiros_private")
          .select("cpf, email")
          .eq("barbeiro_id", barbeiroId)
          .maybeSingle();

        const cpf = priv?.cpf?.replace(/\D/g, "");
        const email = priv?.email?.trim();

        if (!cpf || !email) {
          setWalletActive(false);
          setResolvedBarbeiroId(barbeiroId);
          return;
        }

        // Pronto para ativar
        setWalletActive(false);
        setResolvedBarbeiroId(barbeiroId);

        // Só mostra modal se não mostrou nesta sessão
        if (!alreadyPrompted) {
          setShouldShowModal(true);
          sessionStorage.setItem(sessionKey, "1");

          sendBrowserNotification("💳 Ative sua Carteira Digital", {
            body: "Aceite PIX e cartão dos seus clientes. Ative agora em poucos segundos!",
            tag: "wallet-activation",
          });
        }
      } catch (err) {
        console.error("[useWalletActivationPrompt] Erro:", err);
        setResolvedBarbeiroId(barbeiroId);
      } finally {
        setIsLoading(false);
      }
    };

    check();
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

const WALLET_CACHE_PREFIX = "dub:barber-wallet:v1:";

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
