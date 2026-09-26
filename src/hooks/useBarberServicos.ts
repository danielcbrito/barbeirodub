import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { STALE_TIMES } from "@/lib/queryConstants";

export interface BarberServico {
  id: string;
  nome: string;
  descricao: string | null;
  preco: number;
  duracao_minutos: number;
  ativo: boolean;
}

export interface BarberServicosResult {
  servicos: BarberServico[];
  duracaoMap: Map<string, number>;
}

/**
 * Hook de serviços do barbeiro — busca serviços do tenant
 * e durações personalizadas do barbeiro em paralelo.
 */
export function useBarberServicos(
  barbeiroId: string,
  tenantId: string | null
) {
  return useQuery({
    queryKey: QUERY_KEYS.barbeiro.servicos(barbeiroId, tenantId),
    queryFn: async (): Promise<BarberServicosResult> => {
      let servicesQuery = supabase
        .from("servicos")
        .select("id, nome, descricao, duracao_minutos, preco, ativo")
        .order("nome");

      servicesQuery = tenantId
        ? servicesQuery.eq("tenant_id", tenantId)
        : servicesQuery.is("tenant_id", null);

      const [servicesRes, duracaoRes] = await Promise.all([
        servicesQuery,
        supabase
          .from("barbeiro_servico_duracao")
          .select("servico_id, duracao_personalizada")
          .eq("barbeiro_id", barbeiroId),
      ]);

      if (servicesRes.error) throw servicesRes.error;
      if (duracaoRes.error) throw duracaoRes.error;

      return {
        servicos: servicesRes.data || [],
        duracaoMap: new Map(
          (duracaoRes.data || []).map((d) => [d.servico_id, d.duracao_personalizada])
        ),
      };
    },
    staleTime: STALE_TIMES.SERVICOS,
    enabled: !!barbeiroId,
  });
}
