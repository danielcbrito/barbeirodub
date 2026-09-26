import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { STALE_TIMES } from "@/lib/queryConstants";

export interface PixKey {
  id: string;
  tipo: string;
  chave: string;
  apelido: string | null;
  is_default: boolean;
  nome_titular: string | null;
  instituicao: string | null;
}

export interface Saque {
  id: string;
  valor: number;
  status: string;
  created_at: string;
  processado_em: string | null;
}

export interface SaqueData {
  pixKeys: PixKey[];
  selectedPixKey: PixKey | null;
  saques: Saque[];          // mantido para compat — agora vem de efi_pix_payouts
  hasPin: boolean;
  saldoDisponivel: number;
}

/**
 * Hook do módulo de "Saque" — adaptado para Efí Bank (B1).
 *
 * Fonte de dados do módulo de saque Efí.
 *
 * Retorna:
 * - Chaves PIX cadastradas para destino do saque
 * - Histórico de saques Efí (efi_pix_payouts)
 * - PIN financeiro
 * - Saldo disponível calculado por barbeiro
 */
export function useFinancialSaqueData(
  userId: string | undefined,
  barbeiroId: string | null | undefined
) {
  return useQuery({
    queryKey: QUERY_KEYS.financeiro.saque(userId ?? ""),
    queryFn: async (): Promise<SaqueData> => {
      const [pixRes, walletRes, saqueTxRes, pinRes] = await Promise.all([
        supabase
          .from("chaves_pix")
          .select("id, tipo, chave, apelido, is_default, nome_titular, instituicao")
          .eq("user_id", userId!)
          .order("is_default", { ascending: false }),
        barbeiroId
          ? supabase
              .from("carteiras")
              .select("saldo_disponivel")
              .eq("barbeiro_id", barbeiroId)
              .maybeSingle()
          : Promise.resolve({ data: null as any }),
        barbeiroId
          ? supabase
              .from("transacoes_financeiras")
              .select("id, valor, status, created_at, completed_at, tipo")
              .eq("barbeiro_id", barbeiroId)
              .in("tipo", ["saque_manual", "saque_automatico"])
              .order("created_at", { ascending: false })
              .limit(20)
          : Promise.resolve({ data: [] as any[] }),
        // Validação server-side: retorna apenas boolean, nunca expõe hash ao cliente
        supabase.rpc("has_financial_pin"),
      ]);

      const keys = (pixRes.data as PixKey[]) || [];
      const saldoCarteira = Number((walletRes.data as { saldo_disponivel?: number } | null)?.saldo_disponivel ?? 0);
      const saquesTx = (saqueTxRes.data as any[]) || [];
      const selectedPixKey = keys.find((k) => k.is_default) || keys[0] || null;
      const hasPin = !!pinRes.data;

      const saques: Saque[] = saquesTx.map((p) => ({
        id: p.id,
        valor: Number(p.valor),
        status: p.status === "concluida" ? "concluido"
              : p.status === "processando" ? "processando"
              : p.status === "falhou" ? "falhou" : "pendente",
        created_at: p.created_at,
        processado_em: p.completed_at,
      }));

      return {
        pixKeys: keys,
        selectedPixKey,
        saques,
        hasPin,
        saldoDisponivel: saldoCarteira,
      };
    },
    staleTime: STALE_TIMES.FINANCEIRO,
    enabled: !!userId,
  });
}
