import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCallback } from "react";
import { STALE_TIMES } from "@/lib/queryConstants";

export interface TenantSubscriptionInfo {
  loading: boolean;
  status: string;
  trialStart: Date | null;
  trialEnd: Date | null;
  nextBillingDate: Date | null;
  daysRemaining: number;
  daysOverdue: number;
  isTrial: boolean;
  isActive: boolean;
  isExpired: boolean;
  isOverdue: boolean;
  isBlocked: boolean;
  isExempt: boolean;
  showTrialWarning: boolean;
  showOverdueWarning: boolean;
  planName: string | null;
  priceMonthly: number | null;
  barbersAllowed: number;
  refetch: () => void;
}

interface SubscriptionRow {
  status: string;
  trial_start: string | null;
  trial_end: string | null;
  next_billing_date: string | null;
  days_remaining: number;
  days_overdue: number;
  is_trial: boolean;
  is_active: boolean;
  is_expired: boolean;
  is_overdue: boolean;
  is_blocked: boolean;
  is_exempt: boolean;
  plano_nome: string | null;
  preco_mensal: number | null;
  qtd_barbeiros: number | null;
}

const DEFAULT_STATE: Omit<TenantSubscriptionInfo, "loading" | "refetch"> = {
  status: "loading",
  trialStart: null,
  trialEnd: null,
  nextBillingDate: null,
  daysRemaining: 0,
  daysOverdue: 0,
  isTrial: false,
  isActive: true,
  isExpired: false,
  isOverdue: false,
  isBlocked: false,
  isExempt: false,
  showTrialWarning: false,
  showOverdueWarning: false,
  planName: null,
  priceMonthly: null,
  barbersAllowed: 1,
};

/**
 * Hook que verifica o status da assinatura do tenant (trial, ativa, vencida, bloqueada).
 * Utiliza o RPC `get_tenant_subscription_v2` com regras para:
 * - 7 dias de trial para novas contas
 * - Bloqueio após o trial encerrar
 * - Atraso de 1 a 4 dias com aviso minimalista sem bloqueio
 * - Bloqueio após 4 a 5 dias de atraso na mensalidade
 * - Barbearia DUB isenta de mensalidade
 */
export function useTenantSubscription(tenantId: string | null): TenantSubscriptionInfo {
  const queryClient = useQueryClient();
  const queryKey = ["tenant-subscription-v2", tenantId];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<Omit<TenantSubscriptionInfo, "loading" | "refetch">> => {
      const { data, error } = await supabase.rpc("get_tenant_subscription_v2" as any, {
        p_tenant_id: tenantId!,
      });

      if (error) {
        console.warn("[useTenantSubscription] Erro ao buscar status:", error);
        throw error;
      }

      const row: SubscriptionRow | undefined = Array.isArray(data) ? data[0] : data;
      if (!row) {
        return {
          ...DEFAULT_STATE,
          status: "no_subscription",
          isActive: false,
          isExpired: true,
          isBlocked: true,
        };
      }

      const trialStart = row.trial_start ? new Date(row.trial_start) : null;
      const trialEnd = row.trial_end ? new Date(row.trial_end) : null;
      const nextBillingDate = row.next_billing_date ? new Date(row.next_billing_date) : null;
      const daysRemaining = Number(row.days_remaining ?? 0);
      const daysOverdue = Number(row.days_overdue ?? 0);
      const isTrial = Boolean(row.is_trial);
      const isOverdue = Boolean(row.is_overdue);
      const isBlocked = Boolean(row.is_blocked);
      const isExempt = Boolean(row.is_exempt);
      const isActive = Boolean(row.is_active);
      const isExpired = Boolean(row.is_expired);

      return {
        status: row.status,
        trialStart,
        trialEnd,
        nextBillingDate,
        daysRemaining,
        daysOverdue,
        isTrial,
        isActive,
        isExpired,
        isOverdue,
        isBlocked,
        isExempt,
        showTrialWarning: isTrial && daysRemaining <= 3,
        showOverdueWarning: isOverdue && !isBlocked,
        planName: row.plano_nome,
        priceMonthly: row.preco_mensal ? Number(row.preco_mensal) : null,
        barbersAllowed: row.qtd_barbeiros ? Number(row.qtd_barbeiros) : 1,
      };
    },
    enabled: !!tenantId,
    staleTime: STALE_TIMES.TENANT,
    refetchOnWindowFocus: true,
    retry: 1,
    placeholderData: DEFAULT_STATE,
  });

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  const resolved = data ?? DEFAULT_STATE;

  return {
    loading: isLoading,
    ...resolved,
    refetch,
  };
}