import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { readSyncCache, writeSyncCache } from "@/lib/syncQueryCache";

/**
 * Conta os agendamentos ativos na agenda no dia corrente.
 * Usado no badge da aba "Agenda" da bottom bar.
 * Suporta barbeiro individual, fallback por sessão e sincronização Realtime.
 */
export function useMonthAppointmentsCount(barbeiroId?: string | null) {
  const queryClient = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");
  const cacheKey = `day-appointments-count:${barbeiroId ?? "resolved"}:${today}`;
  const cached = readSyncCache<number>(cacheKey);

  // Ouve eventos de atualização de agenda no sistema para manter o badge sincronizado instantaneamente
  useEffect(() => {
    const handleRefresh = () => {
      queryClient.invalidateQueries({ queryKey: ["day-appointments-count"] });
    };

    window.addEventListener("agenda-refresh", handleRefresh);

    // Canal Realtime do Supabase na tabela de agendamentos para o dia de hoje
    const channel = supabase
      .channel(`rt-day-count-${today}-${barbeiroId || "global"}-${Math.random().toString(36).slice(2, 7)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agendamentos",
          filter: `data=eq.${today}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["day-appointments-count"] });
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener("agenda-refresh", handleRefresh);
      supabase.removeChannel(channel);
    };
  }, [queryClient, today, barbeiroId]);

  return useQuery({
    queryKey: ["day-appointments-count", barbeiroId ?? "resolved", today],
    staleTime: 5_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchInterval: 15_000,
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
              try {
                window.localStorage.setItem("barbeiroId", barb.id);
              } catch {}
            }
          }
        } catch {
          // ignore session retrieval error
        }
      }

      // Conta agendamentos da agenda de hoje (excluindo cancelados)
      // Usando valores válidos do enum appointment_status: cancelled_by_admin e cancelled_by_user
      let query = supabase
        .from("agendamentos")
        .select("id", { count: "exact", head: true })
        .eq("data", today)
        .not("status", "in", '("cancelled_by_admin","cancelled_by_user")');

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
