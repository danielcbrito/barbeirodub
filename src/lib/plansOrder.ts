import { supabase } from "@/integrations/supabase/client";

export interface PlanoLike {
  id: string;
  nome: string;
  preco_mensal?: number;
  ordem?: number | null;
  [key: string]: any;
}

const LOCAL_STORAGE_KEY_PREFIX = "dub_ordem_planos_";

/**
 * Busca a lista ordenada de IDs dos planos para um tenant.
 * Prioridade:
 * 1. informacoes_empresa (chave: "ordem_planos") no Supabase
 * 2. localStorage local
 */
export async function fetchPlanOrder(tenantId?: string | null): Promise<string[]> {
  const tid = tenantId || null;
  const storageKey = `${LOCAL_STORAGE_KEY_PREFIX}${tid || "global"}`;

  try {
    let query = supabase
      .from("informacoes_empresa")
      .select("valor")
      .eq("chave", "ordem_planos");

    if (tid) {
      query = query.eq("tenant_id", tid);
    } else {
      query = query.is("tenant_id", null);
    }

    const { data, error } = await query.maybeSingle();

    if (!error && data?.valor) {
      const parsed = JSON.parse(data.valor);
      if (Array.isArray(parsed) && parsed.length > 0) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(parsed));
        } catch {}
        return parsed;
      }
    }
  } catch (err) {
    console.warn("[fetchPlanOrder] Erro ao buscar no Supabase:", err);
  }

  // Fallback cache local
  try {
    const cached = localStorage.getItem(storageKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}

  return [];
}

/**
 * Ordena um array de planos conforme a lista de IDs ou coluna ordem.
 */
export function sortPlansByCustomOrder<T extends PlanoLike>(
  plans: T[],
  orderList: string[] = []
): T[] {
  if (!plans || plans.length === 0) return [];

  return [...plans].sort((a, b) => {
    // 1. Se tem ordem nativa numérica na coluna planos.ordem
    if (typeof a.ordem === "number" && typeof b.ordem === "number") {
      if (a.ordem !== b.ordem) return a.ordem - b.ordem;
    }

    // 2. Se tem ordem na lista configurada
    if (orderList && orderList.length > 0) {
      const idxA = orderList.indexOf(a.id);
      const idxB = orderList.indexOf(b.id);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
    }

    // 3. Fallback: preco_mensal ou nome
    if (typeof a.preco_mensal === "number" && typeof b.preco_mensal === "number" && a.preco_mensal !== b.preco_mensal) {
      return a.preco_mensal - b.preco_mensal;
    }
    return (a.nome || "").localeCompare(b.nome || "");
  });
}

/**
 * Salva a nova ordem de planos no Supabase (informacoes_empresa e coluna planos.ordem) e no localStorage.
 */
export async function persistPlanOrder(
  orderedIds: string[],
  tenantId?: string | null
): Promise<void> {
  if (!orderedIds || orderedIds.length === 0) return;

  const tid = tenantId || null;
  const storageKey = `${LOCAL_STORAGE_KEY_PREFIX}${tid || "global"}`;

  // 1. Cache local instantâneo
  try {
    localStorage.setItem(storageKey, JSON.stringify(orderedIds));
  } catch {}

  // 2. Persistir em informacoes_empresa
  try {
    let existsQuery = supabase
      .from("informacoes_empresa")
      .select("id")
      .eq("chave", "ordem_planos");

    if (tid) {
      existsQuery = existsQuery.eq("tenant_id", tid);
    } else {
      existsQuery = existsQuery.is("tenant_id", null);
    }

    const { data: existing } = await existsQuery.maybeSingle();

    if (existing) {
      await supabase
        .from("informacoes_empresa")
        .update({
          valor: JSON.stringify(orderedIds),
          atualizado_em: new Date().toISOString(),
        } as any)
        .eq("id", existing.id);
    } else {
      await supabase
        .from("informacoes_empresa")
        .insert({
          chave: "ordem_planos",
          categoria: "configuracao",
          valor: JSON.stringify(orderedIds),
          tenant_id: tid,
        } as any);
    }
  } catch (err) {
    console.warn("[persistPlanOrder] informacoes_empresa:", err);
  }

  // 3. Tentar atualizar coluna 'ordem' na tabela planos caso a coluna exista
  try {
    await Promise.all(
      orderedIds.map((id, index) =>
        supabase
          .from("planos")
          .update({ ordem: index } as any)
          .eq("id", id)
      )
    );
  } catch (err) {
    // Silencioso se a coluna ainda não foi adicionada no banco
  }
}
