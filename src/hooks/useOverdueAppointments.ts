import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { resolveClienteDisplayName } from "@/lib/walkInName";
import { toast } from "sonner";

export interface OverdueAppointment {
  id: string;
  data: string;
  hora: string;
  duracao: number;
  status: string;
  preco: number;
  observacoes: string | null;
  payment_method: string | null;
  tipo_agendamento: string | null;
  is_free: boolean | null;
  user_id: string;
  servico_id: string;
  barbeiro_id: string | null;
  clientName: string;
  serviceName: string;
  isPastDay: boolean;
  isPastTimeToday: boolean;
  displayDateLabel: string;
}

interface UseOverdueAppointmentsOptions {
  enabled?: boolean;
}

export function useOverdueAppointments(
  barbeiroId?: string | null,
  options?: UseOverdueAppointmentsOptions
) {
  const queryClient = useQueryClient();
  const [isCompleting, setIsCompleting] = useState(false);
  const [resolvedBarbeiroId, setResolvedBarbeiroId] = useState<string | null>(barbeiroId || null);

  // Auto-resolução do barbeiro caso não seja fornecido nas props
  useEffect(() => {
    if (barbeiroId) {
      setResolvedBarbeiroId(barbeiroId);
      return;
    }

    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("dub-barber-context-v1");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.barberContext?.barbeiroId) {
            setResolvedBarbeiroId(parsed.barberContext.barbeiroId);
            return;
          }
        }
      } catch {}
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.id) {
        supabase
          .from("barbeiros")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle()
          .then(({ data: b }) => {
            if (b?.id) setResolvedBarbeiroId(b.id);
          });
      }
    });
  }, [barbeiroId]);

  const targetBarbeiroId = barbeiroId || resolvedBarbeiroId;
  const isEnabled = Boolean(targetBarbeiroId && (options?.enabled ?? true));
  const queryKey = useMemo(() => ["overdue-appointments", targetBarbeiroId], [targetBarbeiroId]);

  const {
    data: overdueAppointments = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey,
    enabled: isEnabled,
    refetchInterval: 60000, // Revalida a cada minuto para capturar horários que venceram
    queryFn: async (): Promise<OverdueAppointment[]> => {
      if (!targetBarbeiroId) return [];

      const now = new Date();
      const todayStr = format(now, "yyyy-MM-dd");
      const yesterdayStr = format(subDays(now, 1), "yyyy-MM-dd");
      const fourteenDaysAgoStr = format(subDays(now, 14), "yyyy-MM-dd");
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      // Busca agendamentos em aberto dos últimos 14 dias até hoje de forma limpa (sem joins frágeis)
      const { data, error } = await supabase
        .from("agendamentos")
        .select(`
          id, data, hora, duracao, status, preco, observacoes,
          payment_method, tipo_agendamento, is_free, user_id, servico_id, barbeiro_id
        `)
        .eq("barbeiro_id", targetBarbeiroId)
        .or("status.in.(pending,confirmed),status.is.null")
        .gte("data", fourteenDaysAgoStr)
        .lte("data", todayStr)
        .order("data", { ascending: true })
        .order("hora", { ascending: true });

      if (error) {
        console.error("[useOverdueAppointments] Erro ao buscar agendamentos vencidos:", error);
        return [];
      }

      // 1. Buscar serviços em lote
      const servicoIds = [...new Set((data || []).map((a) => a.servico_id).filter(Boolean))];
      let servicosMap: Record<string, { nome: string; duracao_minutos: number }> = {};
      if (servicoIds.length > 0) {
        const { data: servs } = await supabase
          .from("servicos")
          .select("id, nome, duracao_minutos")
          .in("id", servicoIds);
        if (servs) {
          servicosMap = Object.fromEntries(servs.map((s) => [s.id, { nome: s.nome, duracao_minutos: s.duracao_minutos }]));
        }
      }

      // 2. Buscar nomes de clientes em lote para os que não são walk-in/WhatsApp
      const userIds = [...new Set((data || []).map((a) => a.user_id).filter(Boolean))];
      let profileMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, nome")
          .in("id", userIds);
        if (profs) {
          profileMap = Object.fromEntries(profs.map((p) => [p.id, p.nome]));
        }
      }

      const list: OverdueAppointment[] = [];

      for (const apt of data || []) {
        if (!apt) continue;
        const isPastDay = Boolean(apt.data && apt.data < todayStr);
        const srv = servicosMap[apt.servico_id];
        const dur = apt.duracao || srv?.duracao_minutos || 30;
        const [h, m] = (apt.hora || "00:00").split(":").map(Number);
        const endMinutes = (h || 0) * 60 + (m || 0) + dur;
        const isPastTimeToday = Boolean(apt.data && apt.data === todayStr && currentMinutes >= endMinutes);

        // É atrasado se for de dia anterior OU se for de hoje e o horário previsto já terminou
        if (isPastDay || isPastTimeToday) {
          const rawClientName = profileMap[apt.user_id] || "Cliente";
          const clientName = resolveClienteDisplayName(apt.observacoes, rawClientName, "Cliente");
          const serviceName = srv?.nome || "Serviço";

          let displayDateLabel = "Hoje";
          if (apt.data === yesterdayStr) {
            displayDateLabel = "Ontem";
          } else if (apt.data && apt.data < yesterdayStr) {
            const parts = (apt.data || "").split("-");
            if (parts.length === 3) {
              displayDateLabel = `${parts[2]}/${parts[1]}`;
            }
          }

          list.push({
            id: apt.id,
            data: apt.data || todayStr,
            hora: (apt.hora || "00:00").slice(0, 5),
            duracao: dur,
            status: apt.status || "pending",
            preco: typeof apt.preco === "number" && !isNaN(apt.preco) ? apt.preco : 0,
            observacoes: apt.observacoes,
            payment_method: apt.payment_method,
            tipo_agendamento: apt.tipo_agendamento,
            is_free: Boolean(apt.is_free),
            user_id: apt.user_id || "",
            servico_id: apt.servico_id,
            barbeiro_id: apt.barbeiro_id,
            clientName,
            serviceName,
            isPastDay,
            isPastTimeToday,
            displayDateLabel,
          });
        }
      }

      return list;
    },
  });

  // Escutar Realtime de agendamentos para manter atualizado instantaneamente
  useEffect(() => {
    if (!targetBarbeiroId || !isEnabled) return;

    const channelId = `overdue-watcher-${targetBarbeiroId}-${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agendamentos",
          filter: `barbeiro_id=eq.${targetBarbeiroId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [targetBarbeiroId, isEnabled, queryClient, queryKey]);

  /** Confirmação em lote de agendamentos */
  const completeBulk = useCallback(
    async (selectedIds: string[], noShowIds: string[] = []) => {
      if (!targetBarbeiroId) return;
      setIsCompleting(true);

      try {
        const nowIso = new Date().toISOString();

        // 1. Atualizar agendamentos concluídos
        if (selectedIds.length > 0) {
          const { error: completeErr } = await supabase
            .from("agendamentos")
            .update({
              status: "completed",
              barbeiro_confirmou: true,
              ponto_liberado: true,
            })
            .in("id", selectedIds);

          if (completeErr) throw completeErr;

          // 2. Garantir registro de pagamento para os concluídos
          const targetApts = overdueAppointments.filter((a) => selectedIds.includes(a.id));
          for (const apt of targetApts) {
            if (!apt.is_free && apt.tipo_agendamento !== "plano") {
              const { data: existingPay } = await supabase
                .from("pagamentos")
                .select("id")
                .eq("agendamento_id", apt.id)
                .maybeSingle();

              if (existingPay) {
                await supabase
                  .from("pagamentos")
                  .update({
                    status: "paid",
                    data_pagamento: nowIso,
                  })
                  .eq("id", existingPay.id);
              } else if (apt.preco > 0) {
                await supabase.from("pagamentos").insert({
                  user_id: apt.user_id,
                  agendamento_id: apt.id,
                  valor: apt.preco,
                  metodo: (apt.payment_method === "pix" || apt.payment_method === "card"
                    ? apt.payment_method
                    : "cash") as any,
                  status: "paid",
                  data_pagamento: nowIso,
                });
              }
            }
          }
        }

        // 3. Atualizar agendamentos que faltaram
        if (noShowIds.length > 0) {
          const { error: noShowErr } = await supabase
            .from("agendamentos")
            .update({
              status: "no_show",
              barbeiro_confirmou: false,
              ponto_liberado: false,
            })
            .in("id", noShowIds);

          if (noShowErr) throw noShowErr;
        }

        // 4. Invalidar todos os caches relevantes
        await Promise.all([
          queryClient.invalidateQueries({ queryKey }),
          queryClient.invalidateQueries({ queryKey: ["barbeiro-agenda"] }),
          queryClient.invalidateQueries({ queryKey: ["barber-agenda"] }),
          queryClient.invalidateQueries({ queryKey: ["barber-dashboard"] }),
          queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] }),
        ]);

        window.dispatchEvent(new CustomEvent("agenda-refresh"));

        toast.success(
          selectedIds.length === 1
            ? "1 atendimento concluído e faturamento atualizado!"
            : `${selectedIds.length} atendimentos concluídos com sucesso!`
        );
      } catch (err: any) {
        console.error("[useOverdueAppointments] Erro ao concluir em lote:", err);
        toast.error("Não foi possível confirmar todos os atendimentos.");
        throw err;
      } finally {
        setIsCompleting(false);
      }
    },
    [targetBarbeiroId, overdueAppointments, queryClient, queryKey]
  );

  /** Marcar um único agendamento como falta */
  const markSingleNoShow = useCallback(
    async (appointmentId: string) => {
      try {
        const { error } = await supabase
          .from("agendamentos")
          .update({
            status: "no_show",
            barbeiro_confirmou: false,
            ponto_liberado: false,
          })
          .eq("id", appointmentId);

        if (error) throw error;

        await Promise.all([
          queryClient.invalidateQueries({ queryKey }),
          queryClient.invalidateQueries({ queryKey: ["barbeiro-agenda"] }),
          queryClient.invalidateQueries({ queryKey: ["barber-agenda"] }),
          queryClient.invalidateQueries({ queryKey: ["barber-dashboard"] }),
        ]);

        window.dispatchEvent(new CustomEvent("agenda-refresh"));
        toast.info("Agendamento marcado como falta.");
      } catch (err: any) {
        console.error("[useOverdueAppointments] Erro ao marcar falta:", err);
        toast.error("Não foi possível atualizar o agendamento.");
      }
    },
    [queryClient, queryKey]
  );

  const hasOverduePastDays = useMemo(
    () => overdueAppointments.some((a) => a.isPastDay),
    [overdueAppointments]
  );

  const hasOverdueToday = useMemo(
    () => overdueAppointments.some((a) => a.isPastTimeToday),
    [overdueAppointments]
  );

  return {
    overdueAppointments,
    hasOverduePastDays,
    hasOverdueToday,
    count: overdueAppointments.length,
    isLoading,
    isCompleting,
    completeBulk,
    markSingleNoShow,
    refetch,
  };
}
