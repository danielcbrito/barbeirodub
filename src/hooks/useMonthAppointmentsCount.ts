import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { readSyncCache, writeSyncCache } from "@/lib/syncQueryCache";

/**
 * Conta os agendamentos ativos do barbeiro no dia corrente.
 * Usado no badge da aba "Agenda" da bottom bar.
 */
export function useMonthAppointmentsCount(barbeiroId: string | null) {
  const today = format(new Date(), "yyyy-MM-dd");
  const cacheKey = `day-appointments-count:${barbeiroId ?? "all-visible"}:${today}`;
  const cached = readSyncCache<number>(cacheKey);

  return useQuery({
    queryKey: ["day-appointments-count", barbeiroId ?? "all-visible", today],
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchInterval: 60_000,
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.updatedAt,
    queryFn: async () => {
      // Conta apenas agendamentos pendentes/confirmados (ainda não concluídos)
      let query = supabase
        .from("agendamentos")
        .select("id", { count: "exact", head: true })
        .eq("data", today)
        .in("status", ["pending", "confirmed"]);

      if (barbeiroId) {
        query = query.eq("barbeiro_id", barbeiroId);
      }

      const { count, error } = await query;

      if (error) {
        console.error("Erro ao contar agendamentos do dia:", error);
        return 0;
      }

      const nextCount = count ?? 0;
      writeSyncCache(cacheKey, nextCount);
      return nextCount;
    },
  });
}

