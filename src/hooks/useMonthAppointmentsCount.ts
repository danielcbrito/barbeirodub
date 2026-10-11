import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { readSyncCache, writeSyncCache } from "@/lib/syncQueryCache";

/**
 * Conta os agendamentos ativos na agenda no dia corrente.
 * Usado no badge da aba "Agenda" da bottom bar.
 */
export function useMonthAppointmentsCount(barbeiroId?: string | null) {
  const today = format(new Date(), "yyyy-MM-dd");
  const cacheKey = `day-appointments-count:${barbeiroId ?? "resolved"}:${today}`;
  const cached = readSyncCache<number>(cacheKey);

  return useQuery({
    queryKey: ["day-appointments-count", barbeiroId ?? "resolved", today],
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchInterval: 30_000,
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.updatedAt,
    queryFn: async () => {
      let targetBarberId = barbeiroId || null;

      if (!targetBarberId && typeof window !== "undefined") {
        targetBarberId = window.localStorage.getItem("barbeiroId");
      }

      if (!targetBarberId) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user?.id) {
            const { data: barb } = await supabase
              .from("barbeiros")
              .select("id")
              .eq("user_id", session.user.id)
              .maybeSingle();
            if (barb?.id) {
              targetBarberId = barb.id;
              window.localStorage.setItem("barbeiroId", barb.id);
            }
          }
        } catch {
          // ignore session retrieval error
        }
      }

      // Conta agendamentos da agenda de hoje (excluindo apenas os cancelados)
      let query = supabase
        .from("agendamentos")
        .select("id", { count: "exact", head: true })
        .eq("data", today)
        .not("status", "in", '("cancelled_by_admin","cancelled_by_user","cancelled")');

      if (targetBarberId) {
        query = query.eq("barbeiro_id", targetBarberId);
      }

      const { count, error } = await query;

      if (error) {
        console.error("Erro ao contar agendamentos da agenda:", error);
        return 0;
      }

      const nextCount = count ?? 0;
      writeSyncCache(cacheKey, nextCount);
      return nextCount;
    },
  });
}

