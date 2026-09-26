/**
 * ═══════════════════════════════════════════════════════════
 * useWalletStatus — Verifica se o barbeiro tem carteira ativa
 * ═══════════════════════════════════════════════════════════
 *
 * Woovi: hasWallet = tem chave Pix cadastrada (subconta) OU conta financeira configurada pela equipe.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STALE_TIMES } from "@/lib/queryConstants";
import { QUERY_KEYS } from "@/lib/queryKeys";

interface WalletStatusData {
  hasWallet: boolean;
  wooviPixKey: string | null;
  contaConfigurada: boolean;
  contaFinanceiraId: string | null;
}

export function useWalletStatus(barbeiroId: string | null) {
  return useQuery<WalletStatusData>({
    queryKey: QUERY_KEYS.shared.walletStatus(barbeiroId!),
    enabled: !!barbeiroId,
    queryFn: async () => {
      if (!barbeiroId) {
        return {
          hasWallet: false,
          wooviPixKey: null,
          contaConfigurada: false,
          contaFinanceiraId: null,
        };
      }

      const { data } = await supabase
        .from("barbeiros")
        .select("woovi_pix_key, conta_configurada, conta_financeira_id")
        .eq("id", barbeiroId)
        .maybeSingle();

      const wooviPixKey = (data as any)?.woovi_pix_key ?? null;
      const contaConfigurada = !!data?.conta_configurada;
      const contaFinanceiraId = data?.conta_financeira_id ?? null;

      return {
        hasWallet: !!wooviPixKey || (contaConfigurada && !!contaFinanceiraId),
        wooviPixKey,
        contaConfigurada,
        contaFinanceiraId,
      };
    },
    staleTime: STALE_TIMES.WALLET,
  });
}
