/**
 * useClientCampaigns — estado das campanhas da barbearia no app do cliente.
 * Fonte única: RPC public.get_client_campaigns.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ClientCampaigns {
  ok: boolean;
  tenantId: string | null;
  tenantSlug: string | null;
  referralCode: string | null;
  creditosDisponiveis: number;
  convide: {
    ativo: boolean;
    necessarias: number;
    validados: number;
    pendentes: number;
    faltam: number;
    premio: string | null;
  };
  clienteMes: {
    ativo: boolean;
    cicloInicio: string | null;
    cicloFim: string | null;
    meuTotal: number;
    ranking: { nome: string; total: number; eu: boolean }[];
    premio: string | null;
  };
}

export function useClientCampaigns(tenantId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ["client-campaigns", tenantId ?? "auto"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_client_campaigns", {
        p_tenant_id: tenantId ?? null,
      });
      if (error) throw error;
      return data as ClientCampaigns;
    },
    enabled,
    staleTime: 60_000,
  });
}
