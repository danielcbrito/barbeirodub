import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { toast } from "sonner";
import { format } from "date-fns";
import type { TimelineAppointment } from "@/hooks/useBarberAgenda";

/**
 * ═══════════════════════════════════════════════════════════
 * AGENDA MUTATIONS — Updates otimistas + rollback automático
 * ═══════════════════════════════════════════════════════════
 *
 * Cada mutation segue o padrão:
 * 1. onMutate: cancela refetches, salva snapshot, aplica update otimista
 * 2. onSuccess: invalida apenas queries afetadas (cirúrgico)
 * 3. onError: reverte para snapshot e mostra toast de erro
 */

interface MutationContext {
  snapshot: TimelineAppointment[] | undefined;
}

/** Gera a query key da agenda para um barbeiro e data específicos */
function agendaKey(barbeiroId: string, date: Date) {
  return QUERY_KEYS.barbeiro.agenda(barbeiroId, format(date, "yyyy-MM-dd"));
}

// ─── CONFIRMAR AGENDAMENTO ────────────────────────────────
interface ConfirmParams {
  appointmentId: string;
  barbeiroId: string;
  date: Date;
}

export function useConfirmAppointment() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, ConfirmParams, MutationContext>({
    mutationFn: async ({ appointmentId }) => {
      const { error } = await supabase
        .from("agendamentos")
        .update({
          status: "confirmed" as any,
          barbeiro_confirmou: true,
        } as any)
        .eq("id", appointmentId);
      if (error) throw error;
    },

    onMutate: async ({ appointmentId, barbeiroId, date }) => {
      const key = agendaKey(barbeiroId, date);
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<TimelineAppointment[]>(key);

      queryClient.setQueryData<TimelineAppointment[]>(key, (old) =>
        (old || []).map((apt) =>
          apt.id === appointmentId
            ? { ...apt, status: "confirmed", barbeiro_confirmou: true }
            : apt
        )
      );

      return { snapshot };
    },

    onSuccess: (_data, { barbeiroId, date }) => {
      // Invalidação cirúrgica: apenas agenda do dia
      queryClient.invalidateQueries({ queryKey: agendaKey(barbeiroId, date) });
    },

    onError: (err, { barbeiroId, date }, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(agendaKey(barbeiroId, date), context.snapshot);
      }
      toast.error("Erro ao confirmar agendamento. Tente novamente.");
    },
  });
}

// ─── CONCLUIR ATENDIMENTO ─────────────────────────────────
interface CompleteParams {
  appointmentId: string;
  barbeiroId: string;
  date: Date;
  userId: string;
  serviceName: string;
  preco: number;
  paymentMethod?: string;
  isPrepaid?: boolean;
}

export function useCompleteAppointment() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, CompleteParams, MutationContext>({
    mutationFn: async ({ appointmentId, userId, serviceName, preco, paymentMethod, isPrepaid }) => {
      // 1. Atualizar status do agendamento
      const { error } = await supabase
        .from("agendamentos")
        .update({
          status: "completed" as any,
          barbeiro_confirmou: true,
        } as any)
        .eq("id", appointmentId);

      if (error) {
        if (error.message?.includes("COMPLETION_TOO_EARLY")) {
          throw new Error("Não é possível finalizar antes do horário agendado.");
        }
        throw error;
      }

      // 2. Garantir registro de pagamento (se não pré-pago)
      if (!isPrepaid) {
        const { data: existingPayment } = await supabase
          .from("pagamentos")
          .select("id")
          .eq("agendamento_id", appointmentId)
          .single();

        if (existingPayment) {
          await supabase
            .from("pagamentos")
            .update({
              status: "paid" as any,
              data_pagamento: new Date().toISOString(),
            })
            .eq("id", existingPayment.id);
        } else {
          await supabase.from("pagamentos").insert({
            user_id: userId,
            agendamento_id: appointmentId,
            valor: preco,
            metodo: (paymentMethod === "pix" || paymentMethod === "card" ? paymentMethod : "cash") as any,
            status: "paid" as any,
            data_pagamento: new Date().toISOString(),
          });
        }
      }

      // 3. Notificação ao cliente
      await supabase.from("notificacoes").insert({
        user_id: userId,
        agendamento_id: appointmentId,
        titulo: "Atendimento Concluído ✓",
        mensagem: `Seu atendimento de ${serviceName} foi finalizado. Obrigado pela preferência!`,
        tipo: "geral",
        lida: false,
      });
    },

    onMutate: async ({ appointmentId, barbeiroId, date }) => {
      const key = agendaKey(barbeiroId, date);
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<TimelineAppointment[]>(key);

      queryClient.setQueryData<TimelineAppointment[]>(key, (old) =>
        (old || []).map((apt) =>
          apt.id === appointmentId
            ? { ...apt, status: "completed", barbeiro_confirmou: true }
            : apt
        )
      );

      return { snapshot };
    },

    onSuccess: (_data, { barbeiroId, date }) => {
      // Concluir afeta: agenda, histórico, financeiro
      const dateStr = format(date, "yyyy-MM-dd");
      queryClient.invalidateQueries({ queryKey: agendaKey(barbeiroId, date) });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.barbeiro.historico(barbeiroId, 0),
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.barbeiro.financeiro.overview(barbeiroId),
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.barbeiro.dashboard(barbeiroId),
      });
    },

    onError: (err, { barbeiroId, date }, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(agendaKey(barbeiroId, date), context.snapshot);
      }
      toast.error(err.message || "Erro ao finalizar atendimento.");
    },
  });
}

// ─── CANCELAR AGENDAMENTO (Admin/Barbeiro) ────────────────
interface CancelParams {
  appointmentId: string;
  barbeiroId: string;
  date: Date;
}

export function useCancelAppointment() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, CancelParams, MutationContext>({
    mutationFn: async ({ appointmentId }) => {
      const { error } = await supabase
        .from("agendamentos")
        .update({ status: "cancelled_by_admin" as any } as any)
        .eq("id", appointmentId);
      if (error) throw error;
    },

    onMutate: async ({ appointmentId, barbeiroId, date }) => {
      const key = agendaKey(barbeiroId, date);
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<TimelineAppointment[]>(key);

      // Remove da lista imediatamente
      queryClient.setQueryData<TimelineAppointment[]>(key, (old) =>
        (old || []).filter((apt) => apt.id !== appointmentId)
      );

      return { snapshot };
    },

    onSuccess: (_data, { barbeiroId, date }) => {
      queryClient.invalidateQueries({ queryKey: agendaKey(barbeiroId, date) });
    },

    onError: (err, { barbeiroId, date }, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(agendaKey(barbeiroId, date), context.snapshot);
      }
      toast.error("Erro ao cancelar agendamento.");
    },
  });
}

// ─── MARCAR NO-SHOW ────────────────────────────────────────
interface NoShowParams {
  appointmentId: string;
  barbeiroId: string;
  date: Date;
  userId: string;
  serviceName: string;
}

export function useNoShowAppointment() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, NoShowParams, MutationContext>({
    mutationFn: async ({ appointmentId, userId, serviceName }) => {
      const { error } = await supabase
        .from("agendamentos")
        .update({
          status: "no_show" as any,
          barbeiro_confirmou: false,
          ponto_liberado: false,
        } as any)
        .eq("id", appointmentId);
      if (error) throw error;

      // Notificação ao cliente
      await supabase.from("notificacoes").insert({
        user_id: userId,
        agendamento_id: appointmentId,
        titulo: "Falta registrada",
        mensagem: `Sua presença não foi registrada no atendimento de ${serviceName}. Entre em contato se houver algum engano.`,
        tipo: "geral",
        lida: false,
      });
    },

    onMutate: async ({ appointmentId, barbeiroId, date }) => {
      const key = agendaKey(barbeiroId, date);
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<TimelineAppointment[]>(key);

      // Remove da lista imediatamente
      queryClient.setQueryData<TimelineAppointment[]>(key, (old) =>
        (old || []).filter((apt) => apt.id !== appointmentId)
      );

      return { snapshot };
    },

    onSuccess: (_data, { barbeiroId, date }) => {
      queryClient.invalidateQueries({ queryKey: agendaKey(barbeiroId, date) });
    },

    onError: (err, { barbeiroId, date }, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(agendaKey(barbeiroId, date), context.snapshot);
      }
      toast.error("Erro ao registrar falta.");
    },
  });
}
