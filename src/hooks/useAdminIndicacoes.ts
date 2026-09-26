/**
 * useAdminIndicacoes — Queries do painel admin do Programa de Indicação.
 * Retorna resumo agregado, lista paginada, detalhe e heurísticas de fraude.
 * Todas as queries respeitam RLS (staff = admin/tenant_admin/ti/barber).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type IndicacaoStatus =
  | "pendente"
  | "agendado"
  | "confirmado"
  | "liberado"
  | "invalidado";

export type PeriodoFiltro = "7d" | "30d" | "all";

export interface IndicacaoRow {
  id: string;
  indicador_id: string;
  indicado_id: string;
  codigo_usado: string | null;
  status: IndicacaoStatus;
  agendamento_qualificador_id: string | null;
  motivo_invalidacao: string | null;
  criado_em: string;
  agendado_em: string | null;
  confirmado_em: string | null;
  liberado_em: string | null;
  indicador_nome?: string | null;
  indicado_nome?: string | null;
}

export interface CreditoIndicacao {
  id: string;
  user_id: string;
  indicacao_id: string;
  status: "disponivel" | "usado" | "expirado";
  criado_em: string;
  usado_em: string | null;
  usado_no_agendamento_id: string | null;
}

export interface IndicacaoResumo {
  total: number;
  liberados: number;
  pendentes: number;
  invalidados: number;
  taxaInvalidacao: number;
}

/* ────────── helpers ────────── */

function periodoParaData(p: PeriodoFiltro): string | null {
  if (p === "all") return null;
  const dias = p === "7d" ? 7 : 30;
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString();
}

/** Resolve o tenant_id do usuário logado (tenant_members → barbeiros). */
async function resolveCurrentTenantId(): Promise<string | null> {
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user?.id;
  if (!uid) return null;
  const { data: mem } = await supabase
    .from("tenant_members")
    .select("tenant_id, created_at")
    .eq("user_id", uid)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (mem?.tenant_id) return mem.tenant_id as string;
  const { data: barb } = await supabase
    .from("barbeiros")
    .select("tenant_id")
    .eq("user_id", uid)
    .eq("ativo", true)
    .is("deleted_at", null)
    .not("tenant_id", "is", null)
    .limit(1)
    .maybeSingle();
  return (barb?.tenant_id as string) ?? null;
}

/** IDs dos usuários (indicadores) que pertencem ao tenant atual. */
async function fetchTenantIndicadorIds(): Promise<Set<string>> {
  const tId = await resolveCurrentTenantId();
  if (!tId) return new Set();
  const { data } = await supabase
    .from("tenant_clientes")
    .select("user_id")
    .eq("tenant_id", tId);
  return new Set((data ?? []).map((c: any) => c.user_id).filter(Boolean));
}

async function attachProfiles(rows: IndicacaoRow[]): Promise<IndicacaoRow[]> {
  if (!rows.length) return rows;
  const ids = Array.from(
    new Set(rows.flatMap((r) => [r.indicador_id, r.indicado_id]).filter(Boolean)),
  );
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, nome")
    .in("id", ids);
  const map = new Map((profiles ?? []).map((p: any) => [p.id, p.nome as string]));
  return rows.map((r) => ({
    ...r,
    indicador_nome: map.get(r.indicador_id) ?? null,
    indicado_nome: map.get(r.indicado_id) ?? null,
  }));
}


/* ────────── resumo ────────── */

export function useIndicacoesResumo(periodo: PeriodoFiltro) {
  return useQuery<IndicacaoResumo>({
    queryKey: ["admin-indicacoes-resumo", periodo],
    queryFn: async () => {
      const desde = periodoParaData(periodo);
      const tenantIds = Array.from(await fetchTenantIndicadorIds());
      if (tenantIds.length === 0) {
        return { total: 0, liberados: 0, pendentes: 0, invalidados: 0, taxaInvalidacao: 0 };
      }
      let q = supabase
        .from("indicacoes")
        .select("status", { count: "exact" })
        .in("indicador_id", tenantIds);
      if (desde) q = q.gte("criado_em", desde);
      const { data, error, count } = await q;
      if (error) throw error;
      const rows = (data ?? []) as { status: IndicacaoStatus }[];
      const liberados = rows.filter((r) => r.status === "liberado").length;
      const pendentes = rows.filter(
        (r) => r.status === "pendente" || r.status === "agendado" || r.status === "confirmado",
      ).length;
      const invalidados = rows.filter((r) => r.status === "invalidado").length;
      const total = count ?? rows.length;
      return {
        total,
        liberados,
        pendentes,
        invalidados,
        taxaInvalidacao: total > 0 ? invalidados / total : 0,
      };
    },
    staleTime: 30_000,
  });
}


/* ────────── lista paginada ────────── */

export interface ListaFiltro {
  periodo: PeriodoFiltro;
  status: IndicacaoStatus | "all";
  busca: string;
  page: number;
  pageSize: number;
}

export function useIndicacoesLista(filtro: ListaFiltro) {
  return useQuery<{ rows: IndicacaoRow[]; total: number }>({
    queryKey: ["admin-indicacoes-lista", filtro],
    queryFn: async () => {
      const desde = periodoParaData(filtro.periodo);
      const tenantIds = Array.from(await fetchTenantIndicadorIds());
      if (tenantIds.length === 0) return { rows: [], total: 0 };
      let q = supabase
        .from("indicacoes")
        .select("*", { count: "exact" })
        .in("indicador_id", tenantIds)
        .order("criado_em", { ascending: false });
      if (desde) q = q.gte("criado_em", desde);
      if (filtro.status !== "all") q = q.eq("status", filtro.status);
      const from = filtro.page * filtro.pageSize;
      const to = from + filtro.pageSize - 1;
      q = q.range(from, to);
      const { data, error, count } = await q;
      if (error) throw error;
      let rows = await attachProfiles((data ?? []) as unknown as IndicacaoRow[]);
      const b = filtro.busca.trim().toLowerCase();
      if (b) {
        rows = rows.filter(
          (r) =>
            (r.indicador_nome ?? "").toLowerCase().includes(b) ||
            (r.indicado_nome ?? "").toLowerCase().includes(b),
        );
      }
      return { rows, total: count ?? rows.length };
    },
    staleTime: 15_000,
  });
}


/* ────────── detalhe: crédito associado ────────── */

export function useCreditoDaIndicacao(indicacaoId: string | null) {
  return useQuery<CreditoIndicacao | null>({
    queryKey: ["admin-credito-indicacao", indicacaoId],
    enabled: !!indicacaoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creditos_indicacao")
        .select("*")
        .eq("indicacao_id", indicacaoId!)
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as CreditoIndicacao) ?? null;
    },
  });
}

/* ────────── mutation: invalidar ────────── */

export function useInvalidarIndicacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      const { data, error } = await (supabase.rpc as any)(
        "admin_invalidar_indicacao",
        { p_indicacao_id: id, p_motivo: motivo },
      );
      if (error) throw error;
      return data as { success: boolean; credito_expirado: boolean };
    },
    onSuccess: (data) => {
      toast.success(
        data?.credito_expirado
          ? "Indicação invalidada e crédito expirado"
          : "Indicação invalidada",
      );
      qc.invalidateQueries({ queryKey: ["admin-indicacoes-resumo"] });
      qc.invalidateQueries({ queryKey: ["admin-indicacoes-lista"] });
      qc.invalidateQueries({ queryKey: ["admin-credito-indicacao"] });
      qc.invalidateQueries({ queryKey: ["admin-indicacoes-fraudes"] });
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Erro ao invalidar indicação");
    },
  });
}

/* ────────── heurísticas de fraude ────────── */

export interface FraudeIndicador {
  indicador_id: string;
  indicador_nome: string | null;
  total: number;
  invalidadas: number;
  taxa: number;
}

export interface FraudeSameDay {
  indicador_id: string;
  indicador_nome: string | null;
  dia: string;
  qtd: number;
}

export function useFraudesIndicacao() {
  return useQuery({
    queryKey: ["admin-indicacoes-fraudes"],
    staleTime: 60_000,
    queryFn: async () => {
      const tenantIds = Array.from(await fetchTenantIndicadorIds());
      if (tenantIds.length === 0) {
        return { altaTaxa: [], sameDay: [], sequenciais: [] };
      }
      const { data, error } = await supabase
        .from("indicacoes")
        .select("id, indicador_id, indicado_id, status, motivo_invalidacao, criado_em")
        .in("indicador_id", tenantIds)
        .order("criado_em", { ascending: false })

        .limit(2000);
      if (error) throw error;
      const rows = (data ?? []) as any[];

      // Nomes dos indicadores/indicados
      const ids = Array.from(new Set(rows.flatMap((r) => [r.indicador_id, r.indicado_id])));
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, nome")
        .in("id", ids);
      const nameOf = new Map((profs ?? []).map((p: any) => [p.id, p.nome as string]));

      // (a) Alta taxa de invalidação (>50%, mínimo 3)
      const byIndicador = new Map<string, { total: number; invalidadas: number }>();
      for (const r of rows) {
        const acc = byIndicador.get(r.indicador_id) ?? { total: 0, invalidadas: 0 };
        acc.total += 1;
        if (r.status === "invalidado") acc.invalidadas += 1;
        byIndicador.set(r.indicador_id, acc);
      }
      const altaTaxa: FraudeIndicador[] = [];
      for (const [id, v] of byIndicador) {
        if (v.total >= 3 && v.invalidadas / v.total > 0.5) {
          altaTaxa.push({
            indicador_id: id,
            indicador_nome: nameOf.get(id) ?? null,
            total: v.total,
            invalidadas: v.invalidadas,
            taxa: v.invalidadas / v.total,
          });
        }
      }
      altaTaxa.sort((a, b) => b.taxa - a.taxa);

      // (b) Mesmo dia, mesmo indicador, todas invalidadas por identidade duplicada
      const IDENTIDADE_RX = /(identidade|duplicad|cpf|telefone)/i;
      const byDia = new Map<string, { indicador_id: string; dia: string; itens: any[] }>();
      for (const r of rows) {
        const dia = r.criado_em.slice(0, 10);
        const k = `${r.indicador_id}|${dia}`;
        const acc = byDia.get(k) ?? { indicador_id: r.indicador_id, dia, itens: [] };
        acc.itens.push(r);
        byDia.set(k, acc);
      }
      const sameDay: FraudeSameDay[] = [];
      for (const v of byDia.values()) {
        if (v.itens.length < 2) continue;
        const todasInvalidadas = v.itens.every(
          (i) => i.status === "invalidado" && IDENTIDADE_RX.test(i.motivo_invalidacao ?? ""),
        );
        if (todasInvalidadas) {
          sameDay.push({
            indicador_id: v.indicador_id,
            indicador_nome: nameOf.get(v.indicador_id) ?? null,
            dia: v.dia,
            qtd: v.itens.length,
          });
        }
      }
      sameDay.sort((a, b) => b.qtd - a.qtd);

      // (c) Cadastros em sequência (mesmo minuto) pelo mesmo indicador
      const sequenciais: {
        indicador_id: string;
        indicador_nome: string | null;
        indicado_ids: string[];
        indicados_nomes: string[];
        minuto: string;
      }[] = [];
      const identidades = await supabase
        .from("identidades_usadas")
        .select("primeiro_profile_id, criado_em");
      const idCriadoEm = new Map(
        (identidades.data ?? []).map((i: any) => [i.primeiro_profile_id, i.criado_em as string]),
      );
      const byMinuto = new Map<string, any[]>();
      for (const r of rows) {
        const criacaoIndicado = idCriadoEm.get(r.indicado_id);
        if (!criacaoIndicado) continue;
        const minuto = criacaoIndicado.slice(0, 16); // yyyy-MM-ddTHH:mm
        const k = `${r.indicador_id}|${minuto}`;
        const acc = byMinuto.get(k) ?? [];
        acc.push({ ...r, minuto });
        byMinuto.set(k, acc);
      }
      for (const [k, items] of byMinuto) {
        if (items.length < 2) continue;
        const [indicador_id, minuto] = k.split("|");
        sequenciais.push({
          indicador_id,
          indicador_nome: nameOf.get(indicador_id) ?? null,
          indicado_ids: items.map((i) => i.indicado_id),
          indicados_nomes: items.map((i) => nameOf.get(i.indicado_id) ?? "—"),
          minuto,
        });
      }

      return { altaTaxa, sameDay, sequenciais };
    },
  });
}

/* ────────── Ciclos de Indicação ────────── */

export interface CicloIndicacao {
  id: string;
  data_inicio: string;
  data_fim: string;
  status: "ativo" | "apurado" | "cancelado";
  vencedor_id: string | null;
  vencedor_nome?: string | null;
  quantidade_indicacoes_vencedor: number | null;
  apurado_em: string | null;
  criado_em: string;
  tipo?: "unico" | "fixo";
  dia_inicio_mes?: number | null;
  dia_fim_mes?: number | null;
}

export type CriarCicloInput =
  | { tipo: "unico"; data_inicio: string; data_fim: string }
  | { tipo: "fixo"; dia_inicio_mes: number; dia_fim_mes: number };

export interface RankingRow {
  indicador_id: string;
  indicador_nome: string | null;
  qtd: number;
}

export function useCicloAtivo() {
  return useQuery<CicloIndicacao | null>({
    queryKey: ["admin-ciclo-ativo"],
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ciclos_indicacao")
        .select("*")
        .eq("status", "ativo")
        .order("data_inicio", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as CicloIndicacao) ?? null;
    },
  });
}

export function useRankingCicloAtivo(ciclo: CicloIndicacao | null | undefined) {
  return useQuery<RankingRow[]>({
    queryKey: ["admin-ciclo-ranking", ciclo?.id],
    enabled: !!ciclo,
    staleTime: 15_000,
    queryFn: async () => {
      if (!ciclo) return [];
      const tenantIds = Array.from(await fetchTenantIndicadorIds());
      if (tenantIds.length === 0) return [];
      const inicio = ciclo.data_inicio;
      // data_fim é DATE — incluir dia inteiro
      const fimExclusivo = new Date(ciclo.data_fim);
      fimExclusivo.setDate(fimExclusivo.getDate() + 1);
      const fimIso = fimExclusivo.toISOString();

      const { data, error } = await supabase
        .from("indicacoes")
        .select("indicador_id")
        .eq("status", "liberado")
        .in("indicador_id", tenantIds)
        .gte("liberado_em", new Date(inicio).toISOString())
        .lt("liberado_em", fimIso);
      if (error) throw error;

      const counts = new Map<string, number>();
      for (const r of (data ?? []) as { indicador_id: string }[]) {
        counts.set(r.indicador_id, (counts.get(r.indicador_id) ?? 0) + 1);
      }
      const ids = Array.from(counts.keys());
      if (ids.length === 0) return [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, nome")
        .in("id", ids);
      const nameOf = new Map((profs ?? []).map((p: any) => [p.id, p.nome as string]));
      return ids
        .map((id) => ({
          indicador_id: id,
          indicador_nome: nameOf.get(id) ?? null,
          qtd: counts.get(id) ?? 0,
        }))
        .sort((a, b) => b.qtd - a.qtd);
    },
  });
}

export function useCiclosApurados() {
  return useQuery<CicloIndicacao[]>({
    queryKey: ["admin-ciclos-apurados"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ciclos_indicacao")
        .select("*")
        .eq("status", "apurado")
        .order("data_fim", { ascending: false })
        .limit(50);
      if (error) throw error;
      const rows = (data ?? []) as unknown as CicloIndicacao[];
      const ids = rows.map((r) => r.vencedor_id).filter(Boolean) as string[];
      if (ids.length === 0) return rows;
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, nome")
        .in("id", ids);
      const nameOf = new Map((profs ?? []).map((p: any) => [p.id, p.nome as string]));
      return rows.map((r) => ({
        ...r,
        vencedor_nome: r.vencedor_id ? nameOf.get(r.vencedor_id) ?? null : null,
      }));
    },
  });
}

export function useCriarCiclo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CriarCicloInput) => {
      const params: Record<string, unknown> =
        input.tipo === "unico"
          ? {
              p_tipo: "unico",
              p_data_inicio: input.data_inicio,
              p_data_fim: input.data_fim,
              p_dia_inicio_mes: null,
              p_dia_fim_mes: null,
            }
          : {
              p_tipo: "fixo",
              p_data_inicio: null,
              p_data_fim: null,
              p_dia_inicio_mes: input.dia_inicio_mes,
              p_dia_fim_mes: input.dia_fim_mes,
            };
      const { data, error } = await (supabase.rpc as any)("criar_ciclo_indicacao", params);
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      toast.success("Ciclo criado com sucesso");
      qc.invalidateQueries({ queryKey: ["admin-ciclo-ativo"] });
      qc.invalidateQueries({ queryKey: ["admin-ciclos-apurados"] });
    },
    onError: (err: any) => {
      const msg = err?.message ?? "Erro ao criar ciclo";
      if (/sobreposto|ativo/i.test(msg)) {
        toast.error("Já existe um ciclo ativo sobreposto ao intervalo informado");
      } else if (/data_fim/i.test(msg)) {
        toast.error("A data final deve ser posterior à data de início");
      } else if (/UNAUTHORIZED/i.test(msg)) {
        toast.error("Você não tem permissão para criar ciclos");
      } else {
        toast.error(msg);
      }
    },
  });
}
