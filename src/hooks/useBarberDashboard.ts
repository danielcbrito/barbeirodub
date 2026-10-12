import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { readSyncCache, writeSyncCache } from "@/lib/syncQueryCache";


export interface DashboardData {
  todayCount: number;
  yesterdayCount: number;
  pendingCount: number;
  nextAppointment: { hora: string; clientName: string; serviceName: string } | null;
  monthRevenue: number;
  lastMonthRevenue: number;
  monthCuts: number;
  lastMonthCuts: number;
  recentAppointments: Array<{
    id: string;
    data: string;
    hora: string;
    status: string;
    clientName: string;
    serviceName: string;
  }>;
}

const emptyDashboardData: DashboardData = {
  todayCount: 0,
  yesterdayCount: 0,
  pendingCount: 0,
  nextAppointment: null,
  monthRevenue: 0,
  lastMonthRevenue: 0,
  monthCuts: 0,
  lastMonthCuts: 0,
  recentAppointments: [],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toStringValue = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const parseDashboardData = (value: unknown): DashboardData => {
  if (!isRecord(value)) return emptyDashboardData;

  const nextRaw = value.nextAppointment;
  const nextAppointment = isRecord(nextRaw)
    ? {
        hora: toStringValue(nextRaw.hora),
        clientName: toStringValue(nextRaw.clientName, "Cliente"),
        serviceName: toStringValue(nextRaw.serviceName, "Serviço"),
      }
    : null;

  const recentAppointments = Array.isArray(value.recentAppointments)
    ? value.recentAppointments.filter(isRecord).map((apt) => ({
        id: toStringValue(apt.id),
        data: toStringValue(apt.data),
        hora: toStringValue(apt.hora),
        status: toStringValue(apt.status, "pending"),
        clientName: toStringValue(apt.clientName, "Cliente"),
        serviceName: toStringValue(apt.serviceName, "Serviço"),
      }))
    : [];

  return {
    todayCount: toNumber(value.todayCount),
    yesterdayCount: toNumber(value.yesterdayCount),
    pendingCount: toNumber(value.pendingCount),
    nextAppointment,
    monthRevenue: toNumber(value.monthRevenue),
    lastMonthRevenue: toNumber(value.lastMonthRevenue),
    monthCuts: toNumber(value.monthCuts),
    lastMonthCuts: toNumber(value.lastMonthCuts),
    recentAppointments,
  };
};

const buildFallbackFromAgendaCache = (barbeiroId: string): { data: DashboardData; updatedAt: number } | null => {
  const today = new Date().toISOString().split("T")[0];
  const cachedAgenda = readSyncCache<Array<Record<string, unknown>>>(`barber-agenda:${barbeiroId}:${today}`);
  if (!cachedAgenda?.data) return null;

  const nowTime = new Date().toTimeString().slice(0, 5);
  const activeRows = cachedAgenda.data.filter((apt) => {
    const status = toStringValue(apt.status);
    return status !== "cancelled_by_admin" && status !== "cancelled_by_user" && status !== "no_show";
  });

  const sorted = [...activeRows].sort((a, b) => toStringValue(a.hora).localeCompare(toStringValue(b.hora)));
  const nextRaw = sorted.find((apt) => toStringValue(apt.hora).slice(0, 5) >= nowTime) || sorted[0];

  const getClientName = (apt: Record<string, unknown>) => {
    const profile = apt.profile;
    return isRecord(profile) ? toStringValue(profile.nome, "Cliente") : "Cliente";
  };

  const getServiceName = (apt: Record<string, unknown>) => {
    const servico = apt.servico;
    return isRecord(servico) ? toStringValue(servico.nome, "Serviço") : "Serviço";
  };

  return {
    updatedAt: cachedAgenda.updatedAt,
    data: {
      ...emptyDashboardData,
      todayCount: activeRows.length,
      pendingCount: activeRows.filter((apt) => toStringValue(apt.status) === "pending").length,
      nextAppointment: nextRaw
        ? {
            hora: toStringValue(nextRaw.hora).slice(0, 5),
            clientName: getClientName(nextRaw),
            serviceName: getServiceName(nextRaw),
          }
        : null,
      recentAppointments: sorted.slice(0, 5).map((apt) => ({
        id: toStringValue(apt.id),
        data: toStringValue(apt.data, today),
        hora: toStringValue(apt.hora).slice(0, 5),
        status: toStringValue(apt.status, "pending"),
        clientName: getClientName(apt),
        serviceName: getServiceName(apt),
      })),
    },
  };
};

/**
 * Hook do dashboard do barbeiro — agrega estatísticas do dia,
 * receita mensal, próximo atendimento e atividade recente.
 */
export async function fetchBarberDashboard(barbeiroId: string): Promise<DashboardData> {
  const { data, error } = await supabase.rpc("get_barber_dashboard_fast", {
    p_barbeiro_id: barbeiroId,
  });

  if (error) throw error;
  const parsed = parseDashboardData(data);
  writeSyncCache(`barber-dashboard:${barbeiroId}`, parsed);
  return parsed;
}

/**
 * Hook do dashboard — hidrata sincronamente via localStorage para
 * renderização instantânea (~0ms) em cold start; revalida em background.
 */
export function useBarberDashboard(barbeiroId: string) {
  const cached = barbeiroId ? readSyncCache<DashboardData>(`barber-dashboard:${barbeiroId}`) : null;
  const agendaFallback = barbeiroId && !cached ? buildFallbackFromAgendaCache(barbeiroId) : null;
  return useQuery({
    queryKey: QUERY_KEYS.barbeiro.dashboard(barbeiroId),
    queryFn: () => fetchBarberDashboard(barbeiroId),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    enabled: !!barbeiroId,
    initialData: cached?.data ?? agendaFallback?.data,
    initialDataUpdatedAt: cached?.updatedAt ?? agendaFallback?.updatedAt,
    placeholderData: emptyDashboardData,
    // Sem refetch em foco/reconnect — evita "flash de carregamento" ao voltar pra aba.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

