import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { readSyncCache, writeSyncCache } from "@/lib/syncQueryCache";
import { resolveClienteDisplayName } from "@/lib/walkInName";
import { NextAppointmentData } from "@/components/shared/NextAppointmentCard";

export interface DashboardData {
  todayCount: number;
  yesterdayCount: number;
  pendingCount: number;
  todayRevenue: number;
  todayCompletedCount: number;
  todayWaitingCount: number;
  nextAppointment: NextAppointmentData | null;
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
  todayRevenue: 0,
  todayCompletedCount: 0,
  todayWaitingCount: 0,
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
  const nextAppointment: NextAppointmentData | null = isRecord(nextRaw)
    ? {
        id: nextRaw.id ? toStringValue(nextRaw.id) : undefined,
        hora: toStringValue(nextRaw.hora),
        clientName: toStringValue(nextRaw.clientName, "Cliente"),
        serviceName: toStringValue(nextRaw.serviceName, "Serviço"),
        status: toStringValue(nextRaw.status, "confirmed"),
        duracao: typeof nextRaw.duracao === "number" ? nextRaw.duracao : 30,
        preco: typeof nextRaw.preco === "number" ? nextRaw.preco : 0,
        payment_method: nextRaw.payment_method ? toStringValue(nextRaw.payment_method) : null,
        tipo_agendamento: nextRaw.tipo_agendamento ? toStringValue(nextRaw.tipo_agendamento) : null,
        is_free: typeof nextRaw.is_free === "boolean" ? nextRaw.is_free : false,
        barbeiro_confirmou: typeof nextRaw.barbeiro_confirmou === "boolean" ? nextRaw.barbeiro_confirmou : null,
        observacoes: nextRaw.observacoes ? toStringValue(nextRaw.observacoes) : null,
        avatarUrl: nextRaw.avatarUrl ? toStringValue(nextRaw.avatarUrl) : null,
        planUsage: isRecord(nextRaw.planUsage)
          ? {
              used: toNumber((nextRaw.planUsage as any).used),
              limit: toNumber((nextRaw.planUsage as any).limit),
            }
          : null,
        isBlinking: (() => {
          const [h, m] = toStringValue(nextRaw.hora).split(":").map(Number);
          const sMin = (h || 0) * 60 + (m || 0);
          const dur = typeof nextRaw.duracao === "number" ? nextRaw.duracao : 30;
          const now = new Date();
          const nowMin = now.getHours() * 60 + now.getMinutes();
          return nowMin >= sMin && nowMin < (sMin + dur);
        })(),
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
    todayRevenue: toNumber(value.todayRevenue),
    todayCompletedCount: toNumber(value.todayCompletedCount),
    todayWaitingCount: toNumber(value.todayWaitingCount),
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

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const activeRows = cachedAgenda.data.filter((apt) => {
    const status = toStringValue(apt.status);
    return status !== "cancelled_by_admin" && status !== "cancelled_by_user";
  });

  const completedToday = activeRows.filter((apt) => toStringValue(apt.status) === "completed");
  const waitingToday = activeRows.filter((apt) => {
    const st = toStringValue(apt.status);
    return st === "pending" || st === "confirmed";
  });

  const todayRevenue = completedToday.reduce((acc, apt) => {
    if (Boolean(apt.is_free)) return acc;
    return acc + (toNumber(apt.preco) || 0);
  }, 0);

  const sorted = [...activeRows].sort((a, b) => toStringValue(a.hora).localeCompare(toStringValue(b.hora)));
  const nextRaw = sorted.find((apt) => {
    const st = toStringValue(apt.status);
    if (st === "completed" || st === "no_show") return false;
    const [h, m] = toStringValue(apt.hora).split(":").map(Number);
    const startMin = (h || 0) * 60 + (m || 0);
    const dur = toNumber(apt.duracao) || 30;
    return (startMin + dur) > nowMinutes;
  }) || sorted.find((apt) => toStringValue(apt.status) !== "completed") || sorted[0];

  const getClientName = (apt: Record<string, unknown>) => {
    const profile = apt.profile;
    const profileNome = isRecord(profile) ? toStringValue(profile.nome) : null;
    return resolveClienteDisplayName(toStringValue(apt.observacoes), profileNome, "Cliente");
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
      todayCompletedCount: completedToday.length,
      todayWaitingCount: waitingToday.length,
      todayRevenue,
      pendingCount: waitingToday.length,
      nextAppointment: nextRaw
        ? {
            id: toStringValue(nextRaw.id),
            hora: toStringValue(nextRaw.hora).slice(0, 5),
            clientName: getClientName(nextRaw),
            serviceName: getServiceName(nextRaw),
            status: toStringValue(nextRaw.status, "confirmed"),
            duracao: toNumber(nextRaw.duracao) || 30,
            preco: toNumber(nextRaw.preco) || 0,
            payment_method: nextRaw.payment_method ? toStringValue(nextRaw.payment_method) : null,
            tipo_agendamento: nextRaw.tipo_agendamento ? toStringValue(nextRaw.tipo_agendamento) : null,
            is_free: Boolean(nextRaw.is_free),
            barbeiro_confirmou: typeof nextRaw.barbeiro_confirmou === "boolean" ? nextRaw.barbeiro_confirmou : null,
            observacoes: nextRaw.observacoes ? toStringValue(nextRaw.observacoes) : null,
            isBlinking: (() => {
              const [h, m] = toStringValue(nextRaw.hora).split(":").map(Number);
              const sMin = (h || 0) * 60 + (m || 0);
              const dur = toNumber(nextRaw.duracao) || 30;
              return nowMinutes >= sMin && nowMinutes < (sMin + dur);
            })(),
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

  // Busca todos os agendamentos de hoje para extrair métricas do dia e próximo corte
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const { data: todayApts } = await supabase
    .from("agendamentos")
    .select("id, hora, status, observacoes, preco, duracao, payment_method, tipo_agendamento, is_free, barbeiro_confirmou, servico_id, servicos(nome, duracao_minutos, preco), profiles(nome, avatar_url)")
    .eq("barbeiro_id", barbeiroId)
    .eq("data", today)
    .not("status", "in", '("cancelled_by_admin","cancelled_by_user")')
    .order("hora", { ascending: true });

  const activeTodayApts = todayApts || [];
  const completedToday = activeTodayApts.filter((apt: any) => apt.status === "completed");
  const waitingToday = activeTodayApts.filter((apt: any) => apt.status === "pending" || apt.status === "confirmed");

  parsed.todayCount = activeTodayApts.length;
  parsed.todayCompletedCount = completedToday.length;
  parsed.todayWaitingCount = waitingToday.length;
  parsed.todayRevenue = completedToday.reduce((acc: number, apt: any) => {
    if (apt.is_free) return acc;
    const p = apt.preco ?? (apt.servicos as any)?.preco ?? 0;
    return acc + (typeof p === "number" ? p : 0);
  }, 0);

  if (activeTodayApts.length > 0) {
    const upcoming = activeTodayApts.find((apt: any) => {
      if (apt.status === "completed" || apt.status === "no_show") return false;
      const [h, m] = (apt.hora || "00:00").split(":").map(Number);
      const startMin = (h || 0) * 60 + (m || 0);
      const dur = apt.duracao || (apt.servicos as any)?.duracao_minutos || 30;
      return (startMin + dur) > nowMinutes;
    }) || activeTodayApts.find((apt: any) => apt.status !== "completed") || activeTodayApts[0];

    if (upcoming) {
      const realClientName = resolveClienteDisplayName(
        upcoming.observacoes,
        (upcoming.profiles as any)?.nome,
        "Cliente"
      );
      const [uh, um] = (upcoming.hora || "00:00").split(":").map(Number);
      const uStartMin = (uh || 0) * 60 + (um || 0);
      const uDur = upcoming.duracao || (upcoming.servicos as any)?.duracao_minutos || 30;
      const isBlinkingNow = nowMinutes >= uStartMin && nowMinutes < (uStartMin + uDur);

      parsed.nextAppointment = {
        id: upcoming.id,
        hora: (upcoming.hora || "").slice(0, 5),
        clientName: realClientName,
        serviceName: (upcoming.servicos as any)?.nome || "Atendimento",
        status: upcoming.status || "confirmed",
        duracao: upcoming.duracao || (upcoming.servicos as any)?.duracao_minutos || 30,
        preco: upcoming.preco ?? (upcoming.servicos as any)?.preco ?? 0,
        payment_method: upcoming.payment_method || null,
        tipo_agendamento: upcoming.tipo_agendamento || null,
        is_free: Boolean(upcoming.is_free),
        barbeiro_confirmou: upcoming.barbeiro_confirmou,
        observacoes: upcoming.observacoes,
        avatarUrl: (upcoming.profiles as any)?.avatar_url || null,
        isBlinking: isBlinkingNow,
      };
    }
  }

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

