import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { STALE_TIMES } from "@/lib/queryConstants";

export interface Transaction {
  id: string;
  data: string;
  descricao: string;
  tipo: "entrada" | "saida" | "taxa";
  valor: number;
  status: string;
  categoria: string;
}

export interface PaginatedExtrato {
  transacoes: Transaction[];
  total: number;
  totalPaginas: number;
}

/** Itens por página — paginação no banco */
const ITENS_POR_PAGINA = 30;
const PAID_WOOVI_STATUSES = ["PAID", "paid", "COMPLETED", "ACTIVE_PAID"];
const REFUNDED_WOOVI_STATUSES = ["REFUNDED", "refunded"];
const VISIBLE_WOOVI_STATUSES = [...PAID_WOOVI_STATUSES, ...REFUNDED_WOOVI_STATUSES];

/** Taxa fixa do banco por Pix recebido (R$ 0,40). */
const PIX_FEE_CENTAVOS = 40;

type WooviExtratoCharge = {
  id: string;
  value_centavos: number | null;
  status: string | null;
  created_at: string | null;
  paid_at: string | null;
  released_at: string | null;
  refunded_at: string | null;
};

const mapWooviChargeToExtrato = (charge: WooviExtratoCharge): Transaction[] => {
  const status = charge.status ?? "";
  const isRefunded = REFUNDED_WOOVI_STATUSES.includes(status);
  const isPaid = PAID_WOOVI_STATUSES.includes(status);
  if (!isPaid && !isRefunded) return [];

  const data = charge.refunded_at ?? charge.paid_at ?? charge.created_at ?? "";
  const bruto = Number(charge.value_centavos || 0);

  if (isRefunded) {
    return [{
      id: `woovi-${charge.id}`,
      data,
      descricao: "Cancelamento — estornado ao cliente",
      tipo: "saida",
      valor: bruto / 100,
      status: "Estornado",
      categoria: "estorno",
    }];
  }

  const isBlocked = !charge.released_at;
  // A taxa acontece depois do recebimento -> aparece acima no extrato (mais recente)
  const dataTaxa = data ? new Date(new Date(data).getTime() + 1000).toISOString() : data;
  return [
    {
      id: `woovi-fee-${charge.id}`,
      data: dataTaxa,
      descricao: "Taxa do banco · Pix recebido",
      tipo: "taxa",
      valor: PIX_FEE_CENTAVOS / 100,
      status: isBlocked ? "Aguardando" : "Concluído",
      categoria: "taxa",
    },
    {
      id: `woovi-${charge.id}`,
      data,
      descricao: isBlocked
        ? "Pix recebido · aguardando finalização do corte"
        : "Pagamento recebido · Pix",
      tipo: "entrada",
      valor: bruto / 100,
      status: isBlocked ? "Aguardando" : "Concluído",
      categoria: "comissao",
    },
  ];

};

async function fetchWooviExtratoEntries(barbeiroId: string): Promise<Transaction[]> {
  const { data } = await supabase
    .from("woovi_charges")
    .select("id, value_centavos, status, created_at, paid_at, released_at, refunded_at")
    .eq("barbeiro_id", barbeiroId)
    .in("status", VISIBLE_WOOVI_STATUSES)
    .order("created_at", { ascending: false })
    .limit(50);

  return ((data ?? []) as WooviExtratoCharge[]).flatMap(mapWooviChargeToExtrato);
}


/**
 * Hook de extrato financeiro — busca transações com paginação
 * server-side via .range() para evitar trazer todo o histórico.
 */
export function useFinancialExtrato(
  role: string,
  userId: string | undefined,
  barbeiroId: string | null | undefined,
  pagina: number = 0
) {
  return useQuery({
    queryKey: QUERY_KEYS.financeiro.extrato(userId ?? "", barbeiroId, pagina),
    queryFn: async (): Promise<PaginatedExtrato> => {
      const txns: Transaction[] = [];

      /* ── Verificar subconta Asaas ── */
      let hasSubaccount = false;
      if (barbeiroId) {
        const { data: bData } = await supabase
          .from("barbeiros")
          .select("asaas_account_id")
          .eq("id", barbeiroId)
          .maybeSingle();
        hasSubaccount = !!bData?.asaas_account_id;
      }

      /* ── Asaas: dados vêm da API externa (sem paginação local) ── */
      if (barbeiroId && hasSubaccount) {
        try {
          const { data: asaasData, error: asaasErr } = await supabase.functions.invoke(
            "get-barber-asaas-data",
            { body: { barbeiro_id: barbeiroId } }
          );
          if (!asaasErr && asaasData?.transactions) {
            for (const t of asaasData.transactions) {
              const isCredit = t.type === "PAYMENT_RECEIVED" || t.type === "DEPOSIT" || Number(t.value) > 0;
              txns.push({
                id: t.id, data: t.date || "",
                descricao: t.description || "Movimentação Asaas",
                tipo: isCredit ? "entrada" : t.type?.includes("FEE") ? "taxa" : "saida",
                valor: Math.abs(Number(t.netValue || t.value || 0)),
                status: t.status === "CONFIRMED" ? "Concluído" : "Pendente",
                categoria: t.type === "TRANSFER" ? "saque" : t.type === "PAYMENT_RECEIVED" ? "comissao" : t.type === "DEPOSIT" ? "deposito" : t.type?.includes("FEE") ? "taxa" : "comissao",
              });
            }
          }
        } catch {
          return await fetchLocalPaginated(txns, userId!, barbeiroId, pagina);
        }
        /* Paginação client-side para dados Asaas (API não suporta offset) */
        txns.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
        const total = txns.length;
        const start = pagina * ITENS_POR_PAGINA;
        return {
          transacoes: txns.slice(start, start + ITENS_POR_PAGINA),
          total,
          totalPaginas: Math.ceil(total / ITENS_POR_PAGINA),
        };
      }

      /* ── Barbeiro sem subconta: paginação no banco ── */
      if (barbeiroId && !hasSubaccount) {
        return await fetchLocalPaginatedWithTaxes(barbeiroId, userId!, pagina);
      }

      /* ── Admin: dados Asaas ou local ── */
      if (role === "admin") {
        try {
          const { data: asaasData, error: asaasErr } = await supabase.functions.invoke(
            "get-asaas-financial-data",
            { body: { dateFrom: null, dateTo: null } }
          );
          if (!asaasErr && asaasData?.transactions) {
            for (const t of asaasData.transactions) {
              txns.push({
                id: t.id, data: t.date || "",
                descricao: t.description || "Pagamento",
                tipo: t.status === "REFUNDED" ? "saida" : "entrada",
                valor: Math.abs(Number(t.netValue || t.value || 0)),
                status: t.status === "RECEIVED" || t.status === "CONFIRMED" ? "Concluído" : "Pendente",
                categoria: "pagamento",
              });
            }
          }
        } catch {
          return await fetchLocalPaginated(txns, userId!, barbeiroId, pagina);
        }
        txns.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
        const total = txns.length;
        const start = pagina * ITENS_POR_PAGINA;
        return {
          transacoes: txns.slice(start, start + ITENS_POR_PAGINA),
          total,
          totalPaginas: Math.ceil(total / ITENS_POR_PAGINA),
        };
      }

      /* ── Fallback local ── */
      return await fetchLocalPaginated(txns, userId!, barbeiroId, pagina);
    },
    staleTime: STALE_TIMES.FINANCEIRO,
    enabled: !!userId,
  });
}

/** Transações locais com taxas — paginação no banco */
async function fetchLocalPaginatedWithTaxes(
  barbeiroId: string,
  userId: string,
  pagina: number
): Promise<PaginatedExtrato> {
  const inicio = pagina * ITENS_POR_PAGINA;
  const fim = inicio + ITENS_POR_PAGINA - 1;

  /* ── Agendamentos pagos: concluídos + aguardando atendimento ── */
  const { data: agendamentos, count: aptCount } = await supabase
    .from("agendamentos")
    .select("id, preco, data, hora, payment_method, status, created_at", { count: "exact" })
    .eq("barbeiro_id", barbeiroId)
    .in("status", ["completed", "confirmed"])
    .in("payment_method", ["pix", "credit_card", "debit_card"])
    .order("created_at", { ascending: false })
    .range(inicio, fim);

  const { data: taxas } = await supabase
    .from("taxas_gateway")
    .select("metodo_pagamento, taxa_fixa, taxa_percentual")
    .eq("ativo", true);

  const taxaMap = new Map<string, { metodo_pagamento: string; taxa_fixa: number; taxa_percentual: number }>(
    (taxas || []).map((t) => [t.metodo_pagamento, t as { metodo_pagamento: string; taxa_fixa: number; taxa_percentual: number }])
  );

  const txns: Transaction[] = [];
  for (const a of agendamentos || []) {
    const taxa = taxaMap.get(a.payment_method || "");
    const fixo = Number(taxa?.taxa_fixa || 0);
    const pct = Number(taxa?.taxa_percentual || 0);
    const liquido = a.preco - fixo - Math.round((a.preco * pct) / 100 * 100) / 100;
    const metodoLabel = a.payment_method === "pix" ? "Pix" : a.payment_method === "credit_card" ? "Crédito" : "Débito";
    const isPending = a.status !== "completed";

    txns.push({
      id: a.id, data: a.data || a.created_at || "",
      descricao: isPending
        ? `Atendimento · ${metodoLabel} · Aguarda confirmação`
        : `Atendimento · ${metodoLabel}`,
      tipo: "entrada", valor: Math.max(0, liquido),
      status: isPending ? "Aguardando" : "Concluído",
      categoria: "comissao",
    });
  }

  /* Saques e depósitos — apenas na primeira página para simplificar */
  if (pagina === 0) {
    const [{ data: saques }, { data: depositos }, wooviEntries] = await Promise.all([
      supabase.from("saques").select("id, valor, created_at, status").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
      supabase.from("depositos").select("id, valor, created_at, status").eq("user_id", userId).eq("status", "confirmado").order("created_at", { ascending: false }).limit(10),
      fetchWooviExtratoEntries(barbeiroId),
    ]);

    txns.push(...wooviEntries);

    for (const s of saques || []) {
      txns.push({
        id: s.id, data: s.created_at || "",
        descricao: "Saque",
        tipo: "saida", valor: s.valor,
        status: s.status === "concluido" ? "Concluído" : s.status === "pendente" ? "Pendente" : s.status,
        categoria: "saque",
      });
    }

    for (const d of depositos || []) {
      txns.push({
        id: d.id, data: d.created_at || "",
        descricao: "Depósito PIX",
        tipo: "entrada", valor: d.valor,
        status: "Concluído", categoria: "deposito",
      });
    }

  }

  txns.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  const total = (aptCount || 0) + (pagina === 0 ? 20 : 0); // estimativa

  return {
    transacoes: txns,
    total,
    totalPaginas: Math.ceil((aptCount || 0) / ITENS_POR_PAGINA),
  };
}

/** Transações locais genéricas com paginação */
async function fetchLocalPaginated(
  existingTxns: Transaction[],
  userId: string,
  barbeiroId: string | null | undefined,
  pagina: number
): Promise<PaginatedExtrato> {
  const inicio = pagina * ITENS_POR_PAGINA;
  const fim = inicio + ITENS_POR_PAGINA - 1;

  let query = supabase
    .from("agendamentos")
    .select("id, preco, data, hora, payment_method, created_at", { count: "exact" })
    .eq("status", "completed")
    .in("payment_method", ["pix", "credit_card", "debit_card"])
    .order("created_at", { ascending: false })
    .range(inicio, fim);

  if (barbeiroId) {
    query = query.eq("barbeiro_id", barbeiroId);
  }

  const { data: agendamentos, count: aptCount } = await query;

  const txns: Transaction[] = [...existingTxns];
  for (const a of agendamentos || []) {
    txns.push({
      id: a.id, data: a.data || a.created_at || "",
      descricao: `Atendimento · ${a.payment_method === "pix" ? "Pix" : "Cartão"}`,
      tipo: "entrada", valor: a.preco,
      status: "Concluído", categoria: "comissao",
    });
  }

  if (pagina === 0) {
    const [{ data: saques }, wooviEntries] = await Promise.all([
      supabase
        .from("saques")
        .select("id, valor, created_at, status")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10),
      barbeiroId ? fetchWooviExtratoEntries(barbeiroId) : Promise.resolve([]),
    ]);

    txns.push(...wooviEntries);

    for (const s of saques || []) {
      txns.push({
        id: s.id, data: s.created_at || "",
        descricao: "Saque", tipo: "saida", valor: s.valor,
        status: s.status === "concluido" ? "Concluído" : "Pendente",
        categoria: "saque",
      });
    }
  }

  txns.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

  return {
    transacoes: txns,
    total: aptCount || 0,
    totalPaginas: Math.ceil((aptCount || 0) / ITENS_POR_PAGINA),
  };
}
