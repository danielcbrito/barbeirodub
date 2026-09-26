/**
 * ═══════════════════════════════════════════════════════════
 * usePinStatus — Verifica se o usuário tem PIN financeiro
 * ═══════════════════════════════════════════════════════════
 *
 * Retorna se existe PIN configurado (sem revelar o hash).
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STALE_TIMES } from "@/lib/queryConstants";
import { QUERY_KEYS } from "@/lib/queryKeys";

interface PinStatusData {
  hasPin: boolean;
}

export function usePinStatus(userId: string | null, refreshKey = 0) {
  return useQuery<PinStatusData>({
    queryKey: QUERY_KEYS.shared.pinStatus(userId!, refreshKey),
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return { hasPin: false };
      // Validado no servidor — nunca expõe o hash ao navegador.
      const { data, error } = await supabase.rpc("has_financial_pin");
      if (error) return { hasPin: false };
      return { hasPin: !!data };
    },
    staleTime: STALE_TIMES.PIN,
  });
}
