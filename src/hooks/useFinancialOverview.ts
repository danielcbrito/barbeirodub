import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { STALE_TIMES } from "@/lib/queryConstants";

export interface RecentTransaction {
  id: string;
  descricao: string;
  valor: number;
  tipo: "entrada" | "saida";
  data: string;
  status: string;
  categoria: string;
}

export interface PixKeyInfo {
  id: string;
  tipo: string;
  chave: string;
  apelido: string | null;
  is_default: boolean;
  nome_titular: string | null;
  instituicao: string | null;
}

export interface FinancialOverviewData {
  stats: {
    saldoDisponivel: number;
    saldoProcessando: number;
    totalEntradas: number;
    totalSaques: number;
    totalDepositos: number;
  };
  recentTxns: RecentTransaction[];
  defaultPixKey: PixKeyInfo | null;
}

/**
 * Hook do overview financeiro — modelo Efí Bank (B1).
 * O dinheiro é repassado direto ao banco do barbeiro, então a "carteira"
 * é apenas um extrato visual (não há saldo interno na DUB).
 *
 * - totalEntradas = soma de cobranças PAGAS
 * - saldoDisponivel = soma de repasses CONCLUIDO (já caiu no banco do barbeiro)
 * - saldoProcessando = soma de cobranças PAGAS com payout PENDENTE/PROCESSANDO
 */
export function useFinancialOverview(
  userId: string | undefined,
  barbeiroId: string | null | undefined
) {
  return useQuery({
    queryKey: QUERY_KEYS.financeiro.overview(userId ?? "", barbeiroId),
    queryFn: async (): Promise<FinancialOverviewData> => {
      /* ── 1. Chave PIX padrão ── */
      const { data: pixKeys } = await supabase
        .from("chaves_pix")
        .select("id, tipo, chave, apelido, is_default, nome_titular, instituicao")
        .eq("user_id", userId!)
        .order("is_default", { ascending: false })
        .limit(1);
      const defaultPixKey = (pixKeys?.[0] as PixKeyInfo) || null;

      let stats = { saldoDisponivel: 0, saldoProcessando: 0, totalEntradas: 0, totalSaques: 0, totalDepositos: 0 };
      let recentTxns: RecentTransaction[] = [];

      if (!barbeiroId) {
        return { stats, recentTxns, defaultPixKey };
      }

      /* ── 2. Cobranças e repasses Efí ── */
      const [chargesRes, payoutsRes] = await Promise.all([
        supabase
          .from("efi_pix_charges")
          .select("id, txid, valor, status, descricao, created_at, paid_at")
          .eq("barbeiro_id", barbeiroId)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("efi_pix_payouts")
          .select("id, charge_id, valor, status, completed_at, created_at")
          .eq("barbeiro_id", barbeiroId),
      ]);

      const charges = chargesRes.data || [];
      const payouts = payoutsRes.data || [];

      const totalRecebido = charges
        .filter((c) => c.status === "PAGO")
        .reduce((s, c) => s + Number(c.valor), 0);

      // Soma de tudo já sacado/em saque (exceto falhas) — debita do saldo individual
      const totalSacadoOuEmSaque = payouts
        .filter((p) => p.status !== "FALHOU")
        .reduce((s, p) => s + Number(p.valor), 0);

      const processando = payouts
        .filter((p) => p.status === "PROCESSANDO" || p.status === "PENDENTE")
        .reduce((s, p) => s + Number(p.valor), 0);

      const totalRepassado = payouts
        .filter((p) => p.status === "CONCLUIDO")
        .reduce((s, p) => s + Number(p.valor), 0);

      // Saldo individual do barbeiro = recebido - tudo que já saiu/está saindo
      // Isso garante isolamento mesmo quando 2+ barbeiros compartilham a mesma conta bancária
      stats = {
        saldoDisponivel: Math.max(0, totalRecebido - totalSacadoOuEmSaque),
        saldoProcessando: processando,
        totalEntradas: totalRecebido,
        totalSaques: totalRepassado,
        totalDepositos: 0,
      };

      recentTxns = charges.slice(0, 6).map((c) => ({
        id: c.id,
        descricao: c.descricao || "Recebimento PIX",
        valor: Number(c.valor),
        tipo: "entrada" as const,
        data: c.paid_at || c.created_at,
        status: c.status === "PAGO" ? "Concluído" : c.status === "PENDENTE" ? "Pendente" : "Expirado",
        categoria: "pix",
      }));

      return { stats, recentTxns, defaultPixKey };
    },
    staleTime: STALE_TIMES.FINANCEIRO,
    enabled: !!userId,
  });
}
