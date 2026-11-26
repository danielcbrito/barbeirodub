/**
 * Verifica se o próprio barbeiro pode receber Pix.
 * A disponibilidade é calculada no banco a partir da conta aprovada e da credencial,
 * sem herdar a conta do dono da barbearia nem expor dados bancários ao cliente.
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

const unavailable: WalletStatusData = {
  hasWallet: false,
  wooviPixKey: null,
  contaConfigurada: false,
  contaFinanceiraId: null,
};

export function useWalletStatus(barbeiroId: string | null) {
  return useQuery<WalletStatusData>({
    queryKey: QUERY_KEYS.shared.walletStatus(barbeiroId!),
    enabled: !!barbeiroId,
    queryFn: async () => {
      if (!barbeiroId) return unavailable;
      const { data, error } = await supabase.rpc("validate_barber_can_receive_pix", {
        p_barbeiro_id: barbeiroId,
      });
      if (error) return unavailable;
      return { ...unavailable, hasWallet: data === true };
    },
    staleTime: STALE_TIMES.WALLET,
  });
}
