import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STALE_TIMES } from "@/lib/queryConstants";

export interface PlanPaymentInfo {
  loading: boolean;
  isPlanCash: boolean;
  isCashPending: boolean;
  planPaymentMethod: string | null;
  precoMensal: number;
  planName: string | null;
}

const DEFAULT_INFO: PlanPaymentInfo = {
  loading: false,
  isPlanCash: false,
  isCashPending: false,
  planPaymentMethod: null,
  precoMensal: 0,
  planName: null,
};

/**
 * Hook que busca informações de pagamento do plano do cliente
 * para agendamentos do tipo 'plano'.
 * Migrado para useQuery — cleanup automático, cache compartilhado.
 */
export function usePlanPaymentInfo(
  userId: string | undefined,
  isPlanAppointment: boolean
): PlanPaymentInfo {
  const { data, isLoading } = useQuery({
    queryKey: ["plan-payment-info", userId],
    queryFn: async (): Promise<Omit<PlanPaymentInfo, "loading">> => {
      const { data: sub } = await supabase
        .from("assinaturas")
        .select("payment_method, cash_payment_confirmed, plano_id, status")
        .eq("user_id", userId!)
        .in("status", ["active", "pending_cash", "suspended"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!sub) return { isPlanCash: false, isCashPending: false, planPaymentMethod: null, precoMensal: 0, planName: null };

      let precoMensal = 0;
      let planName: string | null = null;

      if (sub.plano_id) {
        const { data: plano } = await supabase
          .from("planos")
          .select("nome, preco_mensal")
          .eq("id", sub.plano_id)
          .maybeSingle();
        if (plano) {
          precoMensal = plano.preco_mensal || 0;
          planName = plano.nome || null;
        }
      }

      const isCash = sub.payment_method === "cash";
      const isCashPending = isCash && (sub.cash_payment_confirmed === false || sub.cash_payment_confirmed === null);

      return { isPlanCash: isCash, isCashPending, planPaymentMethod: sub.payment_method, precoMensal, planName };
    },
    enabled: !!userId && isPlanAppointment,
    staleTime: STALE_TIMES.FINANCEIRO,
    refetchOnWindowFocus: false,
  });

  if (!userId || !isPlanAppointment) return DEFAULT_INFO;

  return {
    loading: isLoading,
    ...(data ?? { isPlanCash: false, isCashPending: false, planPaymentMethod: null, precoMensal: 0, planName: null }),
  };
}