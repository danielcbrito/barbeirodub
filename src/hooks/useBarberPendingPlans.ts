import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { STALE_TIMES } from "@/lib/queryConstants";

export interface PendingPlanSub {
  id: string;
  status: string;
  payment_method: string;
  created_at: string;
  user_id: string;
  next_billing_date: string | null;
  plano: { nome: string; preco_mensal: number } | null;
  cliente: { nome: string; telefone?: string | null } | null;
}

/**
 * Hook de planos pendentes de confirmação de pagamento
 * (assinaturas cash com status suspended/pending_cash).
 */
export function useBarberPendingPlans(barbeiroId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.barbeiro.pendingPlanPayments(barbeiroId),
    queryFn: async (): Promise<PendingPlanSub[]> => {
      const { data, error } = await supabase
        .from("assinaturas")
        .select(`
          id, status, payment_method, created_at, user_id, next_billing_date,
          plano:planos(nome, preco_mensal)
        `)
        .eq("barbeiro_id", barbeiroId)
        .eq("payment_method", "cash")
        .or("status.in.(suspended,pending_cash),and(status.eq.active,cash_payment_confirmed.eq.false)")
        .order("created_at", { ascending: false });

      if (error) throw error;

      /* Batch fetch nomes dos clientes */
      const userIds = (data || []).map((s) => s.user_id);
      let profilesMap: Record<string, { nome: string; telefone: string | null }> = {};

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, nome, telefone")
          .in("id", userIds);

        for (const p of profiles || []) {
          profilesMap[p.id] = { nome: p.nome || "Sem nome", telefone: p.telefone || null };
        }
      }

      return (data || []).map((s) => ({
        ...s,
        plano: s.plano as any,
        cliente: profilesMap[s.user_id] || null,
      }));
    },
    staleTime: STALE_TIMES.AGENDA_DIA,
    enabled: !!barbeiroId,
  });
}
