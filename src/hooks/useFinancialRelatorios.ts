import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { STALE_TIMES } from "@/lib/queryConstants";
import { format, subMonths, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface MonthlyData {
  month: string;
  label: string;
  receitaPessoal: number;
  receitaBarbearia: number;
  assinantesCount: number;
  isCurrent: boolean;
}

/**
 * Hook de relatórios financeiros — agrega receita de 12 meses
 * (serviços + planos cash + planos PIX) para gráficos.
 */
export function useFinancialRelatorios(
  userId: string | undefined,
  barbeiroId: string | null | undefined
) {
  return useQuery({
    queryKey: QUERY_KEYS.financeiro.relatorios(userId ?? "", barbeiroId),
    queryFn: async (): Promise<MonthlyData[]> => {
      const now = new Date();
      const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const twelveMonthsAgo = format(startOfMonth(subMonths(now, 12)), "yyyy-MM-dd");

      /* ── Queries em paralelo ── */
      // Filtramos TUDO pelo barbeiroId se ele existir para garantir isolamento total
      // Se não houver barbeiroId, o usuário é provavelmente um admin puro que deve ver a barbearia/tenant (se configurado)
      const [allAptsRes, personalAptsRes, allPlanCashRes, personalPlanCashRes, allPlanPixRes] = await Promise.all([
        barbeiroId 
          ? supabase.from("agendamentos").select("data, preco").eq("status", "completed").eq("barbeiro_id", barbeiroId).gte("data", twelveMonthsAgo).limit(2000)
          : supabase.from("agendamentos").select("data, preco").eq("status", "completed").gte("data", twelveMonthsAgo).limit(2000),
        barbeiroId
          ? supabase.from("agendamentos").select("data, preco").eq("status", "completed").eq("barbeiro_id", barbeiroId).gte("data", twelveMonthsAgo).limit(2000)
          : supabase.from("agendamentos").select("data, preco").eq("status", "completed").gte("data", twelveMonthsAgo).limit(2000),
        barbeiroId
          ? supabase.from("pagamentos_plano_barbearia").select("valor, created_at, barbeiro_id").eq("barbeiro_id", barbeiroId).gte("created_at", `${twelveMonthsAgo}T00:00:00`).limit(1000)
          : supabase.from("pagamentos_plano_barbearia").select("valor, created_at, barbeiro_id").gte("created_at", `${twelveMonthsAgo}T00:00:00`).limit(1000),
        barbeiroId
          ? supabase.from("pagamentos_plano_barbearia").select("valor, created_at").eq("barbeiro_id", barbeiroId).gte("created_at", `${twelveMonthsAgo}T00:00:00`).limit(1000)
          : supabase.from("pagamentos_plano_barbearia").select("valor, created_at").gte("created_at", `${twelveMonthsAgo}T00:00:00`).limit(1000),
        supabase.from("pagamentos").select("valor, created_at, assinatura_id").not("assinatura_id", "is", null).is("agendamento_id", null).eq("status", "paid").gte("created_at", `${twelveMonthsAgo}T00:00:00`).limit(1000),
      ]);


      /* ── Assinaturas para filtro PIX e contagem ── */
      let barberSubsData: any[] = [];
      if (barbeiroId) {
        const { data } = await supabase.from("assinaturas").select("id, created_at, user_id").eq("barbeiro_id", barbeiroId);
        barberSubsData = data || [];
      } else {
        const { data } = await supabase.from("assinaturas").select("id, created_at, user_id").gte("created_at", `${twelveMonthsAgo}T00:00:00`).limit(1000);
        barberSubsData = data || [];
      }

      const subIds = new Set(barberSubsData.map((s: any) => s.id));
      const personalPlanPixData = barbeiroId
        ? (allPlanPixRes.data || []).filter((p: any) => subIds.has(p.assinatura_id))
        : allPlanPixRes.data || [];

      /* ── Contagem de assinantes por mês ── */
      const assinantesPorMes = new Map<string, Set<string>>();
      for (const s of barberSubsData) {
        const mesKey = s.created_at?.substring(0, 7);
        if (!mesKey) continue;
        if (!assinantesPorMes.has(mesKey)) assinantesPorMes.set(mesKey, new Set());
        assinantesPorMes.get(mesKey)!.add(s.user_id);
      }

      /* ── Agrupar por mês ── */
      const aggregate = (items: any[], dateField: string, valueField: string) => {
        const map = new Map<string, number>();
        for (const item of items || []) {
          const mesKey = (item[dateField] || "").substring(0, 7);
          if (mesKey) map.set(mesKey, (map.get(mesKey) || 0) + Number(item[valueField] || 0));
        }
        return map;
      };

      const receitaGlobal = aggregate(allAptsRes.data || [], "data", "preco");
      const receitaPessoal = aggregate(personalAptsRes.data || [], "data", "preco");

      /* Somar planos no global */
      for (const p of allPlanCashRes.data || []) {
        const k = p.created_at.substring(0, 7);
        receitaGlobal.set(k, (receitaGlobal.get(k) || 0) + Number(p.valor || 0));
      }
      // Se tiver barbeiroId, o "global" dele é o pessoal dele para isolamento
      const pixForGlobal = barbeiroId ? personalPlanPixData : (allPlanPixRes.data || []);
      for (const p of pixForGlobal) {
        const k = (p as any).created_at.substring(0, 7);
        receitaGlobal.set(k, (receitaGlobal.get(k) || 0) + Number((p as any).valor || 0));
      }


      /* Somar planos no pessoal */
      for (const p of personalPlanCashRes.data || []) {
        const k = p.created_at.substring(0, 7);
        receitaPessoal.set(k, (receitaPessoal.get(k) || 0) + Number(p.valor || 0));
      }
      for (const p of personalPlanPixData) {
        const k = (p as any).created_at.substring(0, 7);
        receitaPessoal.set(k, (receitaPessoal.get(k) || 0) + Number((p as any).valor || 0));
      }

      const allMonths = new Set([...receitaGlobal.keys(), ...receitaPessoal.keys(), ...assinantesPorMes.keys()]);

      return Array.from(allMonths).sort().map((mesKey) => ({
        month: `${mesKey}-01`,
        label: format(new Date(`${mesKey}-15`), "MMM/yy", { locale: ptBR }),
        receitaPessoal: receitaPessoal.get(mesKey) || 0,
        receitaBarbearia: receitaGlobal.get(mesKey) || 0,
        assinantesCount: assinantesPorMes.get(mesKey)?.size || 0,
        isCurrent: mesKey === currentMonthKey,
      }));
    },
    staleTime: STALE_TIMES.RELATORIOS,
    enabled: !!userId,
  });
}
