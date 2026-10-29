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
  planId: string | null;
  priceMonthly: number | null;
  barbersAllowed: number;
  maxBarbers: number;
  maxUnits: number;
  canAddBarber: (currentBarbersCount: number) => boolean;
  canAddUnit: (currentUnitsCount: number) => boolean;
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
  plano_id: string | null;
  preco_mensal: number | null;
  qtd_barbeiros: number | null;
  max_barbeiros: number | null;
  max_unidades: number | null;
}

const DEFAULT_STATE: Omit<TenantSubscriptionInfo, "loading" | "refetch" | "canAddBarber" | "canAddUnit"> = {
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
  planId: null,
  priceMonthly: null,
  barbersAllowed: 1,
  maxBarbers: 1,
  maxUnits: 1,
};

/**
 * Hook que verifica o status da assinatura do tenant (trial, ativa, vencida, bloqueada)
 * e fornece as regras e limites do plano (maxBarbers, maxUnits, canAddBarber, canAddUnit).
 * Utiliza o RPC `get_tenant_subscription_v3`.
 */
export function useTenantSubscription(tenantId: string | null): TenantSubscriptionInfo {
  const queryClient = useQueryClient();
  const queryKey = ["tenant-subscription-v3", tenantId];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<Omit<TenantSubscriptionInfo, "loading" | "refetch" | "canAddBarber" | "canAddUnit">> => {
      const { data, error } = await supabase.rpc("get_tenant_subscription_v3" as any, {
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
      const maxBarbers = isExempt ? 999999 : Number(row.max_barbeiros ?? 1);
      const maxUnits = isExempt ? 999999 : Number(row.max_unidades ?? 1);

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
        planId: row.plano_id,
        priceMonthly: row.preco_mensal ? Number(row.preco_mensal) : null,
        barbersAllowed: maxBarbers,
        maxBarbers,
        maxUnits,
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

  const canAddBarber = useCallback(
    (currentBarbersCount: number): boolean => {
      // Barbearia DUB e tenants isentos: ilimitado
      if (resolved.isExempt) return true;
      if (resolved.isBlocked) return false;
      return currentBarbersCount < resolved.maxBarbers;
    },
    [resolved.isExempt, resolved.isBlocked, resolved.maxBarbers]
  );

  const canAddUnit = useCallback(
    (currentUnitsCount: number): boolean => {
      // Barbearia DUB e tenants isentos: ilimitado
      if (resolved.isExempt) return true;
      if (resolved.isBlocked) return false;
      return currentUnitsCount < resolved.maxUnits;
    },
    [resolved.isExempt, resolved.isBlocked, resolved.maxUnits]
  );

  return {
    loading: isLoading,
    ...resolved,
    canAddBarber,
    canAddUnit,
    refetch,
  };
}