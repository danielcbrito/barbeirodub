import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { STALE_TIMES } from "@/lib/queryConstants";

export type ExcecaoOrigem = "barbeiro" | "unidade" | "global";

export interface HorarioExcepcional {
  id: string;
  data: string;
  aberto: boolean | null;
  hora_abertura: string | null;
  hora_fechamento: string | null;
  hora_almoco_inicio: string | null;
  hora_almoco_fim: string | null;
  motivo: string | null;
  /** De onde veio a exceção (barbeiro pessoal / unidade / global) */
  origem: ExcecaoOrigem;
  /** Nome da unidade (quando origem = 'unidade') ou da barbearia (quando 'global') */
  origem_label?: string | null;
  /** Apenas exceções pessoais do barbeiro podem ser removidas pelo próprio */
  can_delete: boolean;
}

/**
 * Hook unificado de horários excepcionais que afetam o barbeiro:
 * 1. Exceções pessoais do barbeiro (horarios_excepcionais_barbeiro)
 * 2. Exceções da unidade dele (horarios_excepcionais com unidade_id = sua unidade)
 * 3. Exceções globais (horarios_excepcionais com unidade_id NULL)
 */
export function useBarberHorariosExcepcionais(barbeiroId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.barbeiro.horariosExcepcionais(barbeiroId),
    queryFn: async (): Promise<HorarioExcepcional[]> => {
      // Resolve a unidade + tenant do barbeiro
      const { data: barberRow } = await supabase
        .from("barbeiros")
        .select("unidade_id, tenant_id")
        .eq("id", barbeiroId)
        .maybeSingle();

      const unidadeId = barberRow?.unidade_id ?? null;
      const tenantId = barberRow?.tenant_id ?? null;

      // 1. Exceções pessoais
      const personalPromise = supabase
        .from("horarios_excepcionais_barbeiro")
        .select("id, data, aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, motivo")
        .eq("barbeiro_id", barbeiroId);

      // 2. Exceções do tenant (unidade específica OU globais dentro do próprio tenant)
      let unitOrGlobalQuery = supabase
        .from("horarios_excepcionais")
        .select("id, data, aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, motivo, unidade_id, tenant_id");

      if (tenantId) {
        // ESCOPO POR TENANT: apenas exceções da própria barbearia (evita vazamento entre tenants)
        unitOrGlobalQuery = unitOrGlobalQuery.eq("tenant_id", tenantId);
        if (unidadeId) {
          unitOrGlobalQuery = unitOrGlobalQuery.or(`unidade_id.eq.${unidadeId},unidade_id.is.null`);
        } else {
          unitOrGlobalQuery = unitOrGlobalQuery.is("unidade_id", null);
        }
      } else {
        // Sem tenant identificado: não retorna nada global, para evitar leak
        unitOrGlobalQuery = unitOrGlobalQuery.eq("id", "00000000-0000-0000-0000-000000000000");
      }

      const [personalRes, unitGlobalRes] = await Promise.all([personalPromise, unitOrGlobalQuery]);

      if (personalRes.error) throw personalRes.error;
      if (unitGlobalRes.error) throw unitGlobalRes.error;

      // Resolve nomes da unidade e da barbearia
      const [unidadeRes, tenantRes] = await Promise.all([
        unidadeId
          ? supabase.from("tenant_unidades").select("nome").eq("id", unidadeId).maybeSingle()
          : Promise.resolve({ data: null }),
        tenantId
          ? supabase.from("tenants").select("nome").eq("id", tenantId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const unidadeNome = (unidadeRes.data as { nome?: string } | null)?.nome ?? null;
      const tenantNome = (tenantRes.data as { nome?: string } | null)?.nome ?? null;

      const personal: HorarioExcepcional[] = (personalRes.data || []).map((e: any) => ({
        ...e,
        origem: "barbeiro" as const,
        origem_label: null,
        can_delete: true,
      }));

      const unitGlobal: HorarioExcepcional[] = (unitGlobalRes.data || []).map((e: any) => {
        const isUnit = !!e.unidade_id;
        return {
          id: e.id,
          data: e.data,
          aberto: e.aberto,
          hora_abertura: e.hora_abertura,
          hora_fechamento: e.hora_fechamento,
          hora_almoco_inicio: e.hora_almoco_inicio,
          hora_almoco_fim: e.hora_almoco_fim,
          motivo: e.motivo,
          origem: (isUnit ? "unidade" : "global") as ExcecaoOrigem,
          origem_label: isUnit ? (unidadeNome ?? "Unidade") : (tenantNome ?? "Barbearia"),
          can_delete: false,
        };
      });

      return [...personal, ...unitGlobal].sort((a, b) => a.data.localeCompare(b.data));
    },
    staleTime: STALE_TIMES.HORARIOS,
    enabled: !!barbeiroId,
  });
}
