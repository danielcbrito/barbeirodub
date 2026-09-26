import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { toast } from "sonner";
import type { HorarioExcepcional } from "@/hooks/useBarberHorariosExcepcionais";

/**
 * ═══════════════════════════════════════════════════════════
 * HORÁRIOS MUTATIONS — Exceções e configurações
 * ═══════════════════════════════════════════════════════════
 */

// ─── ADICIONAR EXCEÇÃO DE HORÁRIO ─────────────────────────
interface AddExcecaoParams {
  barbeiroId: string;
  data: string;
  aberto: boolean;
  hora_abertura: string | null;
  hora_fechamento: string | null;
  hora_almoco_inicio: string | null;
  hora_almoco_fim: string | null;
  motivo: string | null;
}

export function useAddExcecaoHorario() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, AddExcecaoParams>({
    mutationFn: async (params) => {
      const { barbeiroId, ...insertData } = params;
      const { error } = await supabase
        .from("horarios_excepcionais_barbeiro")
        .insert({
          barbeiro_id: barbeiroId,
          data: insertData.data,
          aberto: insertData.aberto,
          hora_abertura: insertData.hora_abertura,
          hora_fechamento: insertData.hora_fechamento,
          hora_almoco_inicio: insertData.hora_almoco_inicio,
          hora_almoco_fim: insertData.hora_almoco_fim,
          motivo: insertData.motivo,
        });

      if (error) {
        if (error.code === "23505") {
          throw new Error("Já existe uma exceção para esta data");
        }
        throw error;
      }
    },

    onSuccess: (_data, { barbeiroId }) => {
      // Invalida exceções e agenda do mês (disponibilidade mudou)
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.barbeiro.horariosExcepcionais(barbeiroId),
      });
      toast.success("Exceção de horário adicionada!");
    },

    onError: (err) => {
      toast.error(err.message || "Erro ao adicionar exceção");
    },
  });
}

// ─── REMOVER EXCEÇÃO DE HORÁRIO ───────────────────────────
interface DeleteExcecaoParams {
  excecaoId: string;
  barbeiroId: string;
}

export function useDeleteExcecaoHorario() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, DeleteExcecaoParams, { snapshot: HorarioExcepcional[] | undefined }>({
    mutationFn: async ({ excecaoId }) => {
      const { error } = await supabase
        .from("horarios_excepcionais_barbeiro")
        .delete()
        .eq("id", excecaoId);
      if (error) throw error;
    },

    onMutate: async ({ excecaoId, barbeiroId }) => {
      const key = QUERY_KEYS.barbeiro.horariosExcepcionais(barbeiroId);
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<HorarioExcepcional[]>(key);

      // Remove otimisticamente
      queryClient.setQueryData<HorarioExcepcional[]>(key, (old) =>
        (old || []).filter((e) => e.id !== excecaoId)
      );

      return { snapshot };
    },

    onSuccess: (_data, { barbeiroId }) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.barbeiro.horariosExcepcionais(barbeiroId),
      });
      toast.success("Exceção removida");
    },

    onError: (err, { barbeiroId }, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(
          QUERY_KEYS.barbeiro.horariosExcepcionais(barbeiroId),
          context.snapshot
        );
      }
      toast.error("Erro ao remover exceção");
    },
  });
}

// ─── SALVAR CONFIGURAÇÃO DE HORÁRIOS ──────────────────────
interface SaveHorariosParams {
  barbeiroId: string;
  configs: Array<{
    dia_semana: number;
    aberto: boolean | null;
    hora_abertura: string | null;
    hora_fechamento: string | null;
    hora_almoco_inicio: string | null;
    hora_almoco_fim: string | null;
    delay_entre_servicos: number | null;
  }>;
}

export function useSaveHorarios() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, SaveHorariosParams>({
    mutationFn: async ({ barbeiroId, configs }) => {
      const sanitize = (val: string | null) => (val === "" || val === null ? null : val);

      const results = await Promise.all(
        configs.map((config) =>
          supabase
            .from("configuracoes_horario_barbeiro")
            .update({
              aberto: config.aberto,
              hora_abertura: config.hora_abertura || "09:00",
              hora_fechamento: config.hora_fechamento || "18:00",
              hora_almoco_inicio: sanitize(config.hora_almoco_inicio),
              hora_almoco_fim: sanitize(config.hora_almoco_fim),
              delay_entre_servicos: config.delay_entre_servicos,
            })
            .eq("barbeiro_id", barbeiroId)
            .eq("dia_semana", config.dia_semana)
            .select()
        )
      );

      for (const res of results) {
        if (res.error) throw res.error;
        if (!res.data || res.data.length === 0) {
          throw new Error("Falha ao salvar: nenhuma linha atualizada");
        }
      }
    },

    onSuccess: (_data, { barbeiroId }) => {
      // Horários afetam: config de horários e agenda do mês
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.barbeiro.horarios(barbeiroId),
      });
      toast.success("Horários salvos com sucesso!");
    },

    onError: (err) => {
      toast.error(err.message || "Erro ao salvar horários");
    },
  });
}

// ─── SALVAR INTERVALO DE HORÁRIOS (por dia ou semana toda) ──
interface SaveSlotIntervalParams {
  barbeiroId: string;
  minutos: number;
  dia_semana: number;
  aplicarTodosDias: boolean;
}

export function useSaveSlotInterval() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, SaveSlotIntervalParams>({
    mutationFn: async ({ barbeiroId, minutos, dia_semana, aplicarTodosDias }) => {
      let query = supabase
        .from("configuracoes_horario_barbeiro")
        .update({ slot_interval_minutes: minutos })
        .eq("barbeiro_id", barbeiroId);

      if (!aplicarTodosDias) {
        query = query.eq("dia_semana", dia_semana);
      }

      const { error } = await query;
      if (error) throw error;
    },

    onSuccess: (_data, { barbeiroId, aplicarTodosDias }) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.barbeiro.horarios(barbeiroId),
      });
      toast.success(
        aplicarTodosDias
          ? "Intervalo aplicado a todos os dias"
          : "Intervalo do dia atualizado"
      );
    },

    onError: (err) => {
      toast.error(err.message || "Erro ao salvar intervalo");
    },
  });
}
