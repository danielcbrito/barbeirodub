/**
 * useCampanhas — configuração das campanhas da barbearia
 * (Convide e Ganhe / Cliente do Mês) + ciclo mensal de indicação.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type CampanhaTipo = "convide_ganhe" | "cliente_do_mes";

export interface CampanhaConfig {
  id: string;
  tenant_id: string;
  tipo: CampanhaTipo;
  ativo: boolean;
  indicacoes_necessarias: number;
  premio_descricao: string | null;
}

export const CAMPANHAS_KEY = (tenantId?: string | null) => ["campanhas-config", tenantId ?? "none"];

export function useCampanhasConfig(tenantId?: string | null) {
  return useQuery({
    queryKey: CAMPANHAS_KEY(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campanhas_config")
        .select("id, tenant_id, tipo, ativo, indicacoes_necessarias, premio_descricao")
        .eq("tenant_id", tenantId as string);
      if (error) throw error;
      return (data ?? []) as CampanhaConfig[];
    },
    enabled: !!tenantId,
    staleTime: 60_000,
  });
}

export interface SaveCampanhaInput {
  tipo: CampanhaTipo;
  ativo?: boolean;
  indicacoes_necessarias?: number;
  premio_descricao?: string | null;
}

export function useSaveCampanha(tenantId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveCampanhaInput) => {
      if (!tenantId) throw new Error("Barbearia não identificada");
      const { data, error } = await supabase
        .from("campanhas_config")
        .upsert(
          {
            tenant_id: tenantId,
            tipo: input.tipo,
            ...(input.ativo !== undefined ? { ativo: input.ativo } : {}),
            ...(input.indicacoes_necessarias !== undefined
              ? { indicacoes_necessarias: input.indicacoes_necessarias }
              : {}),
            ...(input.premio_descricao !== undefined
              ? { premio_descricao: input.premio_descricao }
              : {}),
          },
          { onConflict: "tenant_id,tipo" },
        )
        .select("id, tenant_id, tipo, ativo, indicacoes_necessarias, premio_descricao")
        .single();
      if (error) throw error;
      return data as CampanhaConfig;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CAMPANHAS_KEY(tenantId) });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Erro ao salvar campanha";
      toast.error(msg);
    },
  });
}

/** Ciclo mensal ativo do "Cliente do Mês" para a barbearia. */
export function useCicloMensal(tenantId?: string | null) {
  return useQuery({
    queryKey: ["campanha-ciclo-mensal", tenantId ?? "none"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ciclos_indicacao")
        .select("id, data_inicio, data_fim, status, tipo, vencedor_id, quantidade_indicacoes_vencedor")
        .eq("tenant_id", tenantId as string)
        .eq("status", "ativo")
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
    staleTime: 60_000,
  });
}

/** Cria (se necessário) o ciclo mensal fixo do dia 1 ao 31. */
export function useGarantirCicloMensal(tenantId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>)("criar_ciclo_indicacao", {
        p_tipo: "fixo",
        p_data_inicio: null,
        p_data_fim: null,
        p_dia_inicio_mes: 1,
        p_dia_fim_mes: 31,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campanha-ciclo-mensal", tenantId ?? "none"] });
    },
  });
}

/** Ranking do ciclo ativo: quem mais indicou clientes que cortaram. */
export function useRankingMensal(cicloId?: string | null) {
  return useQuery({
    queryKey: ["campanha-ranking-mensal", cicloId ?? "none"],
    queryFn: async () => {
      const { data: ciclo } = await supabase
        .from("ciclos_indicacao")
        .select("data_inicio, data_fim")
        .eq("id", cicloId as string)
        .maybeSingle();
      if (!ciclo) return [] as { user_id: string; nome: string; total: number }[];

      const { data, error } = await supabase
        .from("indicacoes")
        .select("indicador_id, liberado_em")
        .eq("status", "liberado")
        .gte("liberado_em", `${ciclo.data_inicio}T00:00:00Z`)
        .lte("liberado_em", `${ciclo.data_fim}T23:59:59Z`);
      if (error) throw error;

      const counts = new Map<string, number>();
      (data ?? []).forEach((r) => {
        counts.set(r.indicador_id, (counts.get(r.indicador_id) ?? 0) + 1);
      });
      const ids = [...counts.keys()];
      if (ids.length === 0) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, nome")
        .in("id", ids);
      const nameById = new Map((profiles ?? []).map((p) => [p.id, p.nome]));

      return ids
        .map((id) => ({ user_id: id, nome: nameById.get(id) ?? "Cliente", total: counts.get(id) ?? 0 }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);
    },
    enabled: !!cicloId,
    staleTime: 60_000,
  });
}
