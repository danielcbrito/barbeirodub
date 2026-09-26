import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCallback } from "react";
import { STALE_TIMES } from "@/lib/queryConstants";

export interface TenantSubscriptionInfo {
  loading: boolean;
  status: string;
  trialEnd: Date | null;
  daysRemaining: number;
  isTrial: boolean;
  isActive: boolean;
  isExpired: boolean;
  showTrialWarning: boolean;
  planName: string | null;
  priceMonthly: number | null;
  refetch: () => void;
}

interface SubscriptionRow {
  status: string;
  trial_end: string | null;
  days_remaining: number;
  is_trial: boolean;
  is_active: boolean;
  is_expired: boolean;
  plano_nome: string | null;
  preco_mensal: number | null;
}

/**
 * Hook que verifica o status da assinatura do tenant (trial, ativa, expirada).
 * Migrado para useQuery — cache compartilhado, sem memory leak.
 */
export function useTenantSubscription(tenantId: string | null): TenantSubscriptionInfo {
  const queryClient = useQueryClient();
  const queryKey = ["tenant-subscription", tenantId];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_tenant_subscription_status", {
        p_tenant_id: tenantId!,
      });

      if (error) throw error;

      const row: SubscriptionRow | undefined = Array.isArray(data) ? data[0] : data;
      if (!row) {
        return {
          status: "no_subscription",
          trialEnd: null,
          daysRemaining: 0,
          isTrial: false,
          isActive: false,
          isExpired: true,
          showTrialWarning: false,
          planName: null,
          priceMonthly: null,
        };
      }

      const trialEnd = row.trial_end ? new Date(row.trial_end) : null;
      const daysRemaining = row.days_remaining ?? 0;

      return {
        status: row.status,
        trialEnd,
        daysRemaining,
        isTrial: row.is_trial,
        isActive: row.is_active,
        isExpired: row.is_expired,
        showTrialWarning: row.is_trial && daysRemaining <= 3,
        planName: row.plano_nome,
        priceMonthly: row.preco_mensal,
      };
    },
    enabled: !!tenantId,
    staleTime: STALE_TIMES.TENANT,
    refetchOnWindowFocus: false,
    // Fail-open: em caso de erro, manter dados anteriores (não bloquear acesso)
    retry: 1,
    // Placeholder enquanto carrega — permite acesso (fail-open)
    placeholderData: {
      status: "loading",
      trialEnd: null,
      daysRemaining: 0,
      isTrial: false,
      isActive: true,
      isExpired: false,
      showTrialWarning: false,
      planName: null,
      priceMonthly: null,
    },
  });

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey });
  }, [queryClient, tenantId]);

  const resolved = data ?? {
    status: "loading",
    trialEnd: null,
    daysRemaining: 0,
    isTrial: false,
    isActive: true,
    isExpired: false,
    showTrialWarning: false,
    planName: null,
    priceMonthly: null,
  };

  return {
    loading: isLoading,
    ...resolved,
    refetch,
  };
}