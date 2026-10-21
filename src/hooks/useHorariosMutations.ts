import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
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
export interface SaveHorariosConfigItem {
  dia_semana: number;
  aberto: boolean | null;
  hora_abertura: string | null;
  hora_fechamento: string | null;
  hora_almoco_inicio: string | null;
  hora_almoco_fim: string | null;
  delay_entre_servicos?: number | null;
  slot_interval_minutes?: number | null;
}

interface SaveHorariosParams {
  barbeiroId: string;
  configs: SaveHorariosConfigItem[];
}

export function useSaveHorarios() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, SaveHorariosParams>({
    mutationFn: async ({ barbeiroId, configs }) => {
      const sanitize = (val: string | null | undefined) => (val === "" || val === null || val === undefined ? null : val);

      for (const config of configs) {
        const payload: Database["public"]["Tables"]["configuracoes_horario_barbeiro"]["Update"] = {
          aberto: config.aberto ?? true,
          hora_abertura: config.hora_abertura || "09:00",
          hora_fechamento: config.hora_fechamento || "18:00",
          hora_almoco_inicio: sanitize(config.hora_almoco_inicio),
          hora_almoco_fim: sanitize(config.hora_almoco_fim),
          delay_entre_servicos: config.delay_entre_servicos ?? 10,
        };

        if (config.slot_interval_minutes !== undefined) {
          payload.slot_interval_minutes = config.slot_interval_minutes;
        }

        const res = await supabase
          .from("configuracoes_horario_barbeiro")
          .update(payload)
          .eq("barbeiro_id", barbeiroId)
          .eq("dia_semana", config.dia_semana)
          .select();

        if (res.error) throw res.error;

        if (!res.data || res.data.length === 0) {
          // Inserção caso a linha ainda não exista
          const ins = await supabase
            .from("configuracoes_horario_barbeiro")
            .insert({
              barbeiro_id: barbeiroId,
              dia_semana: config.dia_semana,
              ...payload,
            })
            .select();
          if (ins.error) throw ins.error;
        }
      }
    },

    onSuccess: (_data, { barbeiroId, configs }) => {
      // Atualização imediata do cache para evitar recarregamento com valores antigos
      queryClient.setQueryData(
        QUERY_KEYS.barbeiro.horarios(barbeiroId),
        (old: any) => {
          if (!Array.isArray(old)) return old;
          return old.map((existing) => {
            const updated = configs.find((c) => c.dia_semana === existing.dia_semana);
            if (!updated) return existing;
            return {
              ...existing,
              ...updated,
              slot_interval_minutes:
                updated.slot_interval_minutes !== undefined
                  ? updated.slot_interval_minutes
                  : existing.slot_interval_minutes,
            };
          });
        }
      );

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
  barbeiroId?: string;
  tenantId?: string;
  unidadeId?: string;
  minutos: number;
  dia_semana: number;
  aplicarTodosDias: boolean;
}

export function useSaveSlotInterval() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, SaveSlotIntervalParams>({
    mutationFn: async ({ barbeiroId, tenantId, unidadeId, minutos, dia_semana, aplicarTodosDias }) => {
      if (barbeiroId) {
        let query = supabase
          .from("configuracoes_horario_barbeiro")
          .update({ slot_interval_minutes: minutos })
          .eq("barbeiro_id", barbeiroId);

        if (!aplicarTodosDias) {
          query = query.eq("dia_semana", dia_semana);
        }

        const { error } = await query;
        if (error) throw error;
      }

      if (tenantId) {
        // Atualiza a tabela tenants
        await supabase
          .from("tenants")
          .update({ slot_interval_minutes: minutos })
          .eq("id", tenantId);

        // Atualiza configuracoes_horario_unidade
        let unitQuery = (supabase as any)
          .from("configuracoes_horario_unidade")
          .update({ slot_interval_minutes: minutos })
          .eq("tenant_id", tenantId);

        if (unidadeId) {
          unitQuery = unitQuery.eq("unidade_id", unidadeId);
        }
        if (!aplicarTodosDias) {
          unitQuery = unitQuery.eq("dia_semana", dia_semana);
        }

        const { error: unitErr } = await unitQuery;
        if (unitErr) console.warn("Erro ao salvar slot na unidade:", unitErr);
      }
    },

    onSuccess: (_data, { barbeiroId, tenantId, minutos, dia_semana, aplicarTodosDias }) => {
      if (barbeiroId) {
        // Atualiza imediatamente o cache de horários do barbeiro
        queryClient.setQueryData(
          QUERY_KEYS.barbeiro.horarios(barbeiroId),
          (old: any) => {
            if (!Array.isArray(old)) return old;
            return old.map((cfg) => {
              if (aplicarTodosDias || cfg.dia_semana === dia_semana) {
                return { ...cfg, slot_interval_minutes: minutos };
              }
              return cfg;
            });
          }
        );

        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.barbeiro.horarios(barbeiroId),
        });
      }

      if (tenantId) {
        queryClient.invalidateQueries({
          queryKey: ['tenant-slot-interval', tenantId],
        });
        queryClient.invalidateQueries({
          queryKey: ['company-hours-tenant', tenantId],
        });
      }

      toast.success(
        aplicarTodosDias
          ? "Intervalo de " + minutos + " min aplicado a todos os dias!"
          : "Intervalo de " + minutos + " min atualizado com sucesso!"
      );
    },

    onError: (err) => {
      toast.error(err.message || "Erro ao salvar intervalo");
    },
  });
}
