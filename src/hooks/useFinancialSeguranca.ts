import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { STALE_TIMES } from "@/lib/queryConstants";

export interface SecurityData {
  hasPin: boolean;
  devices: any[];
}

/**
 * Hook de segurança financeira — verifica PIN e lista dispositivos conectados.
 */
export function useFinancialSeguranca(userId: string | undefined) {
  return useQuery({
    queryKey: QUERY_KEYS.financeiro.seguranca(userId ?? ""),
    queryFn: async (): Promise<SecurityData> => {
      const [pinRes, devicesRes] = await Promise.all([
        supabase.rpc("has_financial_pin"),
        supabase.from("dispositivos_conectados").select("id, device_name, device_type, browser, os, last_activity, is_active, ip_address").eq("user_id", userId!).order("last_activity", { ascending: false }).limit(10),
      ]);

      return {
        hasPin: !!pinRes.data,
        devices: devicesRes.data || [],
      };
    },
    staleTime: STALE_TIMES.PIN,
    enabled: !!userId,
  });
}
