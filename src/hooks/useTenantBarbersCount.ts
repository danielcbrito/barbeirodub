import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Retorna a quantidade de barbeiros ativos (não deletados) de um tenant.
 * Atualiza automaticamente via Realtime caso novos barbeiros sejam adicionados ou removidos.
 */
export function useTenantBarbersCount(tenantId: string | null | undefined) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['tenant-barbers-count', tenantId ?? 'no-tenant'],
    enabled: !!tenantId,
    staleTime: 1000 * 30, // 30s
    queryFn: async () => {
      if (!tenantId) return { count: 0, singleBarbeiroId: null };
      const { data: barbers, error, count } = await supabase
        .from("barbeiros")
        .select("id", { count: "exact" })
        .eq("tenant_id", tenantId)
        .eq("ativo", true)
        .is("deleted_at", null);

      if (error) {
        console.error("Erro ao consultar quantidade de barbeiros:", error);
        return { count: 0, singleBarbeiroId: null };
      }
      const c = count ?? barbers?.length ?? 0;
      const singleId = c === 1 && barbers?.[0]?.id ? barbers[0].id : null;
      return { count: c, singleBarbeiroId: singleId };
    },
  });

  // Escuta Realtime para inserções, exclusões ou alterações de status em barbeiros do tenant
  useEffect(() => {
    if (!tenantId) return;

    const channel = supabase
      .channel(`rt-barbers-count-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'barbeiros',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['tenant-barbers-count', tenantId] });
          queryClient.invalidateQueries({ queryKey: ['admin', 'barbeiros', tenantId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, queryClient]);

  const count = data?.count ?? 0;
  return {
    count,
    loading: isLoading,
    hasMultiple: count > 1,
    isSingleBarber: count <= 1,
    singleBarbeiroId: data?.singleBarbeiroId ?? null,
  };
}
