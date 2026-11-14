import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { STALE_TIMES } from "@/lib/queryConstants";

export interface HorarioConfig {
  id: string;
  dia_semana: number;
  aberto: boolean | null;
  hora_abertura: string | null;
  hora_fechamento: string | null;
  hora_almoco_inicio: string | null;
  hora_almoco_fim: string | null;
  delay_entre_servicos: number | null;
  slot_interval_minutes: number | null;
}

/**
 * Hook de configuração de horários do barbeiro.
 * Se não existir configuração, inicializa via RPC automaticamente.
 */
export function useBarberHorarioConfig(barbeiroId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.barbeiro.horarios(barbeiroId),
    queryFn: async (): Promise<HorarioConfig[]> => {
      const { data, error } = await supabase
        .from("configuracoes_horario_barbeiro")
        .select("id, dia_semana, aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, delay_entre_servicos, slot_interval_minutes")
        .eq("barbeiro_id", barbeiroId)
        .order("dia_semana");

      if (error) throw error;

      const ensureSeven = (rows: any[]): HorarioConfig[] => {
        const defaults = Array.from({ length: 7 }, (_, i) => ({
          id: `default-${i}`,
          dia_semana: i,
          aberto: true,
          hora_abertura: '09:00',
          hora_fechamento: '18:00',
          hora_almoco_inicio: null,
          hora_almoco_fim: null,
          delay_entre_servicos: 0,
          slot_interval_minutes: null,
        }));
        const byDay = new Map<number, any>();
        rows.forEach((r) => {
          if (r && typeof r.dia_semana === 'number') byDay.set(r.dia_semana, r);
        });
        return defaults.map((d) => {
          const existing = byDay.get(d.dia_semana);
          return existing ? { ...d, ...existing, dia_semana: d.dia_semana } : d;
        });
      };

      /* Se não houver configuração, inicializar e buscar de novo */
      if (!data || data.length === 0) {
        await supabase.rpc("initialize_barber_hours", {
          p_barbeiro_id: barbeiroId,
        });
        const { data: retryData, error: retryError } = await supabase
          .from("configuracoes_horario_barbeiro")
          .select("id, dia_semana, aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, delay_entre_servicos, slot_interval_minutes")
          .eq("barbeiro_id", barbeiroId)
          .order("dia_semana");
        if (retryError) throw retryError;
        return ensureSeven(retryData || []);
      }

      return ensureSeven(data || []);
    },
    staleTime: STALE_TIMES.HORARIOS,
    enabled: !!barbeiroId,
  });
}
