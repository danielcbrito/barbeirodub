/**
 * ═══════════════════════════════════════════════════════════
 * useBusinessHours — Hook compartilhado para horário comercial
 * ═══════════════════════════════════════════════════════════
 *
 * Elimina a duplicação de fetch de `configuracoes_horario` e
 * `configuracoes_horario_barbeiro` que existia em 5+ componentes.
 *
 * Prioridade:
 *  1. Horário do barbeiro (configuracoes_horario_barbeiro)
 *  2. Horário global (configuracoes_horario)
 *  3. Fallback padrão
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULTS } from "@/lib/constants";
import { STALE_TIMES } from "@/lib/queryConstants";
import { QUERY_KEYS } from "@/lib/queryKeys";
import type { BusinessHoursConfig } from "@/components/agenda/types";

/** Fallback padrão para quando não há config no banco */
function getDefaultConfig(dayOfWeek: number): BusinessHoursConfig {
  return {
    aberto: dayOfWeek !== 0, // domingo fechado por padrão
    hora_abertura: DEFAULTS.OPENING_TIME,
    hora_fechamento: DEFAULTS.CLOSING_TIME,
    hora_almoco_inicio: "12:00",
    hora_almoco_fim: "13:00",
    delay_entre_servicos: DEFAULTS.SERVICE_BUFFER_MINUTES,
  };
}

interface UseBusinessHoursParams {
  /** Data selecionada (para determinar dia da semana) */
  date: Date;
  /** ID do barbeiro (opcional — se fornecido, busca horário personalizado) */
  barbeiroId?: string | null;
}

interface UseBusinessHoursReturn {
  config: BusinessHoursConfig | null;
  isLoading: boolean;
  error: Error | null;
}

export function useBusinessHours({
  date,
  barbeiroId,
}: UseBusinessHoursParams): UseBusinessHoursReturn {
  const dayOfWeek = date.getDay();

  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.shared.businessHours(dayOfWeek, barbeiroId ?? "global"),
    queryFn: async (): Promise<BusinessHoursConfig> => {
      // 1. Se tem barbeiroId, tentar horário personalizado primeiro
      if (barbeiroId) {
        const { data: barberConfig } = await supabase
          .from("configuracoes_horario_barbeiro")
          .select("aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, delay_entre_servicos")
          .eq("barbeiro_id", barbeiroId)
          .eq("dia_semana", dayOfWeek)
          .maybeSingle();

        if (barberConfig) {
          return {
            aberto: barberConfig.aberto ?? true,
            hora_abertura: barberConfig.hora_abertura ?? DEFAULTS.OPENING_TIME,
            hora_fechamento: barberConfig.hora_fechamento ?? DEFAULTS.CLOSING_TIME,
            hora_almoco_inicio: barberConfig.hora_almoco_inicio,
            hora_almoco_fim: barberConfig.hora_almoco_fim,
            delay_entre_servicos:
              barberConfig.delay_entre_servicos ?? DEFAULTS.SERVICE_BUFFER_MINUTES,
          };
        }

        // 1b. Horário da barbearia (unidade) — só quando o barbeiro não tem config própria
        const { data: barbRow } = await supabase
          .from("barbeiros")
          .select("tenant_id, unidade_id")
          .eq("id", barbeiroId)
          .maybeSingle();

        if (barbRow?.unidade_id) {
          const { data: unitCfg } = await (supabase as any).from("configuracoes_horario_unidade")
            .select("aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, delay_entre_servicos")
            .eq("unidade_id", barbRow.unidade_id)
            .eq("dia_semana", dayOfWeek)
            .maybeSingle();
          if (unitCfg) {
            return {
              aberto: unitCfg.aberto ?? true,
              hora_abertura: unitCfg.hora_abertura ?? DEFAULTS.OPENING_TIME,
              hora_fechamento: unitCfg.hora_fechamento ?? DEFAULTS.CLOSING_TIME,
              hora_almoco_inicio: unitCfg.hora_almoco_inicio,
              hora_almoco_fim: unitCfg.hora_almoco_fim,
              delay_entre_servicos:
                unitCfg.delay_entre_servicos ?? DEFAULTS.SERVICE_BUFFER_MINUTES,
            };
          }
        }
      }

      // 2. Fallback: horário global

      const { data: globalConfig } = await supabase
        .from("configuracoes_horario")
        .select("aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, delay_entre_servicos")
        .eq("dia_semana", dayOfWeek)
        .maybeSingle();

      if (globalConfig) {
        return {
          aberto: globalConfig.aberto,
          hora_abertura: globalConfig.hora_abertura,
          hora_fechamento: globalConfig.hora_fechamento,
          hora_almoco_inicio: globalConfig.hora_almoco_inicio,
          hora_almoco_fim: globalConfig.hora_almoco_fim,
          delay_entre_servicos:
            globalConfig.delay_entre_servicos || DEFAULTS.SERVICE_BUFFER_MINUTES,
        };
      }

      // 3. Fallback padrão
      return getDefaultConfig(dayOfWeek);
    },
    staleTime: STALE_TIMES.HORARIOS,
  });

  return {
    config: data ?? null,
    isLoading,
    error: error as Error | null,
  };
}
