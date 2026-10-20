import { supabase } from "@/integrations/supabase/client";

export interface BarberCancellationFeeConfig {
  habilitado: boolean;
  tipo: "porcentagem" | "fixo";
  valor: number; // Porcentagem (ex: 20 = 20%) ou Valor Fixo em Reais (ex: 15 = R$ 15,00)
  horas_antecedencia: number; // Sempre 2 horas (regra de sistema fixa)
}

export interface ClienteDebitoItem {
  id: string;
  agendamento_id?: string | null;
  barbeiro_id: string;
  barbeiro_nome?: string;
  motivo: "cancelamento_tardio" | "falta" | string;
  valor_taxa: number;
  tipo_taxa: "porcentagem" | "fixo";
  porcentagem_aplicada?: number | null;
  valor_servico_original?: number | null;
  status: "pendente" | "pago" | "dispensado" | "liberado_manual";
  created_at: string;
  dispensado_em?: string | null;
}

export interface ClienteDebitoCancelamento {
  id: string;
  cliente_id: string;
  cliente_nome?: string;
  cliente_telefone?: string;
  cliente_avatar?: string | null;
  barbeiro_id: string;
  barbeiro_nome?: string;
  tenant_id?: string | null;
  agendamento_id?: string | null;
  valor_taxa: number; // Para compatibilidade
  total_pendente?: number;
  tipo_taxa: "porcentagem" | "fixo";
  porcentagem_aplicada?: number | null;
  valor_servico_original?: number | null;
  motivo?: string | null;
  status: "pendente" | "pago" | "dispensado" | "liberado_manual";
  itens?: ClienteDebitoItem[];
  created_at: string;
  pix_payload?: string | null;
}

export interface AppointmentDebtBreakdown {
  hasDebt: boolean;
  debtAmount: number;
  servicePrice: number;
  totalToCollect: number;
  debtReason?: string;
}

const DEFAULT_FEE_CONFIG: BarberCancellationFeeConfig = {
  habilitado: false,
  tipo: "porcentagem",
  valor: 20, // 20% padrão quando ativado
  horas_antecedencia: 2, // Cancelamento gratuito até 2 horas antes do horário (regra fixa do sistema)
};

const MEM_CACHE = new Map<string, { data: BarberCancellationFeeConfig; timestamp: number }>();
const CACHE_TTL_MS = 60 * 1000;

/**
 * Busca a configuração de taxa de cancelamento de um barbeiro específico.
 * Totalmente isolado por barbeiro.
 */
export async function fetchBarberCancellationFee(
  barbeiroId: string,
  tenantId?: string | null
): Promise<BarberCancellationFeeConfig> {
  if (!barbeiroId) return { ...DEFAULT_FEE_CONFIG };

  const cached = MEM_CACHE.get(barbeiroId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  let result: BarberCancellationFeeConfig = { ...DEFAULT_FEE_CONFIG };
  let found = false;

  // 1. Tentar ler da tabela informacoes_empresa (chave única por barbeiro)
  try {
    const { data, error } = await supabase
      .from("informacoes_empresa")
      .select("valor")
      .eq("chave", `taxa_cancelamento_${barbeiroId}`)
      .maybeSingle();

    if (!error && data?.valor) {
      const parsed = JSON.parse(data.valor);
      if (typeof parsed === "object" && parsed !== null) {
        result = {
          habilitado: Boolean(parsed.habilitado),
          tipo: parsed.tipo === "fixo" ? "fixo" : "porcentagem",
          valor: typeof parsed.valor === "number" ? parsed.valor : (parsed.tipo === "fixo" ? 15 : 20),
          horas_antecedencia: 2, // Estritamente fixado em 2 horas pelo sistema
        };
        found = true;
      }
    }
  } catch {}

  // 2. Tentar tabela dedicada barbeiro_taxa_cancelamento se existir
  if (!found) {
    try {
      const { data, error } = await (supabase as any)
        .from("barbeiro_taxa_cancelamento")
        .select("habilitado, tipo, valor")
        .eq("barbeiro_id", barbeiroId)
        .maybeSingle();

      if (!error && data) {
        result = {
          habilitado: Boolean(data.habilitado),
          tipo: data.tipo === "fixo" ? "fixo" : "porcentagem",
          valor: Number(data.valor) || 20,
          horas_antecedencia: 2,
        };
        found = true;
      }
    } catch {}
  }

  MEM_CACHE.set(barbeiroId, { data: result, timestamp: Date.now() });
  return result;
}

/**
 * Salva a configuração de taxa de cancelamento do barbeiro no Supabase.
 * Armazena em informacoes_empresa com chave: `taxa_cancelamento_${barbeiroId}`
 * e categoria: `configuracoes_gerais`.
 */
export async function saveBarberCancellationFee({
  barbeiroId,
  tenantId,
  config,
}: {
  barbeiroId: string;
  tenantId?: string | null;
  config: BarberCancellationFeeConfig;
}): Promise<BarberCancellationFeeConfig> {
  if (!barbeiroId) throw new Error("ID do barbeiro não fornecido");

  // Garante regra de sistema: 2 horas
  const normalizedConfig: BarberCancellationFeeConfig = {
    habilitado: Boolean(config.habilitado),
    tipo: config.tipo === "fixo" ? "fixo" : "porcentagem",
    valor: Number(config.valor) || (config.tipo === "fixo" ? 15 : 20),
    horas_antecedencia: 2,
  };

  // Atualiza cache em memória imediatamente
  MEM_CACHE.set(barbeiroId, { data: normalizedConfig, timestamp: Date.now() });

  const chave = `taxa_cancelamento_${barbeiroId}`;
  // Estrutura solicitada no prompt
  const valorObj = {
    habilitado: normalizedConfig.habilitado,
    tipo: normalizedConfig.tipo,
    valor: normalizedConfig.valor,
  };
  const valorJson = JSON.stringify(valorObj);

  let saved = false;
  let lastErr: any = null;

  // 1. Persistir em informacoes_empresa (categoria: configuracoes_gerais)
  try {
    const { data: existing } = await supabase
      .from("informacoes_empresa")
      .select("id")
      .eq("chave", chave)
      .maybeSingle();

    if (existing?.id) {
      const { error: upErr } = await supabase
        .from("informacoes_empresa")
        .update({
          valor: valorJson,
          categoria: "configuracoes_gerais",
          ativo: true,
          atualizado_em: new Date().toISOString(),
        } as any)
        .eq("id", existing.id);

      if (!upErr) saved = true;
      else lastErr = upErr;
    } else {
      const { error: insErr } = await supabase
        .from("informacoes_empresa")
        .insert({
          chave,
          categoria: "configuracoes_gerais",
          valor: valorJson,
          tenant_id: tenantId || null,
          ativo: true,
        } as any);

      if (!insErr) saved = true;
      else lastErr = insErr;
    }
  } catch (err) {
    lastErr = err;
  }

  // 2. Salvar na tabela dedicada se já existir
  try {
    await (supabase as any)
      .from("barbeiro_taxa_cancelamento")
      .upsert({
        barbeiro_id: barbeiroId,
        tenant_id: tenantId || null,
        habilitado: normalizedConfig.habilitado,
        tipo: normalizedConfig.tipo,
        valor: normalizedConfig.valor,
        horas_antecedencia: 2,
        updated_at: new Date().toISOString(),
      }, { onConflict: "barbeiro_id" });
  } catch {}

  if (!saved && lastErr) {
    console.error("[saveBarberCancellationFee] Erro ao salvar:", lastErr);
    throw new Error(lastErr.message || "Erro ao salvar taxa de cancelamento");
  }

  return normalizedConfig;
}

/**
 * Assina alterações em tempo real na taxa de cancelamento de um barbeiro.
 */
export function subscribeToBarberCancellationFee(
  barbeiroId: string,
  onUpdate: (config: BarberCancellationFeeConfig) => void
): () => void {
  if (!barbeiroId) return () => {};

  const channel = supabase
    .channel(`taxa-cancelamento-${barbeiroId}-${Date.now()}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "informacoes_empresa",
        filter: `chave=eq.taxa_cancelamento_${barbeiroId}`,
      },
      (payload) => {
        const row = payload.new as any;
        if (row?.valor) {
          try {
            const parsed = JSON.parse(row.valor);
            const config: BarberCancellationFeeConfig = {
              habilitado: Boolean(parsed.habilitado),
              tipo: parsed.tipo === "fixo" ? "fixo" : "porcentagem",
              valor: typeof parsed.valor === "number" ? parsed.valor : 20,
              horas_antecedencia: 2,
            };
            MEM_CACHE.set(barbeiroId, { data: config, timestamp: Date.now() });
            onUpdate(config);
          } catch {}
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Verifica se um cliente possui débitos de cancelamento pendentes.
 */
export async function checkClientPendingCancellationDebt(
  clienteId: string
): Promise<ClienteDebitoCancelamento | null> {
  if (!clienteId) return null;

  try {
    const { data: fallbackData } = await supabase
      .from("informacoes_empresa")
      .select("id, chave, valor, tenant_id")
      .eq("chave", `debito_cancelamento_${clienteId}`)
      .maybeSingle();

    if (fallbackData?.valor) {
      const parsed = JSON.parse(fallbackData.valor);
      const totalPendente = Number(parsed.total_pendente ?? parsed.valor_taxa ?? 0);
      if (parsed?.status === "pendente" || totalPendente > 0) {
        return {
          id: parsed.id || fallbackData.id,
          cliente_id: clienteId,
          cliente_nome: parsed.cliente_nome,
          cliente_telefone: parsed.cliente_telefone,
          barbeiro_id: parsed.barbeiro_id || (parsed.itens?.[0]?.barbeiro_id ?? ""),
          barbeiro_nome: parsed.barbeiro_nome || (parsed.itens?.[0]?.barbeiro_nome ?? "Barbeiro"),
          tenant_id: fallbackData.tenant_id,
          agendamento_id: parsed.agendamento_id || (parsed.itens?.[0]?.agendamento_id ?? null),
          valor_taxa: totalPendente,
          total_pendente: totalPendente,
          tipo_taxa: parsed.tipo_taxa || "porcentagem",
          porcentagem_aplicada: parsed.porcentagem_aplicada ? Number(parsed.porcentagem_aplicada) : null,
          valor_servico_original: parsed.valor_servico_original ? Number(parsed.valor_servico_original) : null,
          motivo: parsed.motivo || (parsed.itens?.[0]?.motivo ?? "Taxa de cancelamento/falta"),
          status: "pendente",
          itens: parsed.itens || [],
          created_at: parsed.created_at || new Date().toISOString(),
        };
      }
    }
  } catch {}

  return null;
}

/**
 * Libera/dispensa manualmente a taxa de cancelamento do cliente.
 * Atualiza o banco para desbloquear o aplicativo do cliente instantaneamente.
 */
export async function dispenseCancellationDebt({
  debitoId,
  clienteId,
  barbeiroId,
  tenantId,
}: {
  debitoId?: string;
  clienteId: string;
  barbeiroId?: string;
  tenantId?: string | null;
}): Promise<boolean> {
  if (!clienteId) return false;

  // 1. Tentar chamar a RPC dedicada no banco
  try {
    const { data, error } = await (supabase as any).rpc("dispensar_debito_cliente", {
      p_cliente_id: clienteId,
      p_item_id: debitoId && debitoId !== clienteId ? debitoId : null,
      p_motivo: "liberado_manual",
    });

    if (!error && data?.success) {
      return true;
    }
  } catch {}

  // 2. Fallback direto em informacoes_empresa
  try {
    const chave = `debito_cancelamento_${clienteId}`;
    const { data: existing } = await supabase
      .from("informacoes_empresa")
      .select("id, valor")
      .eq("chave", chave)
      .maybeSingle();

    if (existing?.id) {
      let parsed: any = {};
      try {
        parsed = JSON.parse(existing.valor);
      } catch {}

      parsed.status = "liberado_manual";
      parsed.total_pendente = 0;
      parsed.valor_taxa = 0;
      parsed.dispensado_em = new Date().toISOString();

      if (Array.isArray(parsed.itens)) {
        parsed.itens = parsed.itens.map((it: any) => ({
          ...it,
          status: "liberado_manual",
          dispensado_em: new Date().toISOString(),
        }));
      }

      await supabase
        .from("informacoes_empresa")
        .update({
          valor: JSON.stringify(parsed),
          ativo: false,
          atualizado_em: new Date().toISOString(),
        } as any)
        .eq("id", existing.id);
    }
  } catch (err) {
    console.error("[dispenseCancellationDebt] Erro ao atualizar informacoes_empresa:", err);
    return false;
  }

  // 3. Fallback: atualizar tabela cliente_debitos_cancelamento se existir
  try {
    await (supabase as any)
      .from("cliente_debitos_cancelamento")
      .update({
        status: "dispensado",
        dispensado_em: new Date().toISOString(),
      })
      .eq("cliente_id", clienteId);
  } catch {}

  return true;
}

/**
 * Busca todos os clientes com taxas de cancelamento pendentes para um barbeiro específico.
 */
export async function fetchBarberPendingCancellationDebts(
  barbeiroId: string,
  tenantId?: string | null
): Promise<ClienteDebitoCancelamento[]> {
  if (!barbeiroId) return [];

  const mapById = new Map<string, ClienteDebitoCancelamento>();

  // 1. Tentar via RPC `get_barber_pending_debts`
  try {
    const { data: rpcData, error: rpcErr } = await (supabase as any).rpc("get_barber_pending_debts", {
      p_barbeiro_id: barbeiroId,
    });

    if (!rpcErr && Array.isArray(rpcData)) {
      for (const item of rpcData) {
        if (item && item.cliente_id) {
          const deb: ClienteDebitoCancelamento = {
            id: item.itens?.[0]?.id || item.row_id || item.cliente_id,
            cliente_id: item.cliente_id,
            cliente_nome: item.cliente_nome,
            cliente_telefone: item.cliente_telefone,
            cliente_avatar: item.cliente_avatar,
            barbeiro_id: barbeiroId,
            tenant_id: item.tenant_id,
            valor_taxa: Number(item.total_pendente) || 0,
            total_pendente: Number(item.total_pendente) || 0,
            tipo_taxa: item.itens?.[0]?.tipo_taxa || "porcentagem",
            motivo: formatItemReason(item.itens?.[0]),
            status: "pendente",
            itens: item.itens || [],
            created_at: item.itens?.[0]?.created_at || item.updated_at || new Date().toISOString(),
          };
          mapById.set(deb.cliente_id, deb);
        }
      }
    }
  } catch {}

  // 2. Fallback: buscar débitos em informacoes_empresa
  if (mapById.size === 0) {
    try {
      const { data: rows } = await supabase
        .from("informacoes_empresa")
        .select("id, chave, valor, tenant_id")
        .eq("categoria", "debitos_cliente");

      if (Array.isArray(rows)) {
        for (const row of rows) {
          if (!row.valor) continue;
          try {
            const parsed = JSON.parse(row.valor);
            const total = Number(parsed.total_pendente ?? parsed.valor_taxa ?? 0);
            if (total <= 0 && parsed.status !== "pendente") continue;

            // Checa se algum item pertence ao barbeiro
            let hasBarberItem = false;
            let matchingItens: ClienteDebitoItem[] = [];

            if (Array.isArray(parsed.itens)) {
              matchingItens = parsed.itens.filter(
                (it: any) => it.status === "pendente" && (!barbeiroId || it.barbeiro_id === barbeiroId)
              );
              hasBarberItem = matchingItens.length > 0;
            } else if (parsed.status === "pendente" && (!barbeiroId || parsed.barbeiro_id === barbeiroId)) {
              hasBarberItem = true;
            }

            if (hasBarberItem) {
              const cId = parsed.cliente_id || row.chave.replace("debito_cancelamento_", "");
              const deb: ClienteDebitoCancelamento = {
                id: parsed.id || row.id,
                cliente_id: cId,
                cliente_nome: parsed.cliente_nome,
                cliente_telefone: parsed.cliente_telefone,
                barbeiro_id: barbeiroId,
                tenant_id: row.tenant_id,
                valor_taxa: total,
                total_pendente: total,
                tipo_taxa: parsed.tipo_taxa || "porcentagem",
                motivo: formatItemReason(matchingItens[0] || parsed),
                status: "pendente",
                itens: matchingItens.length > 0 ? matchingItens : parsed.itens,
                created_at: parsed.created_at || new Date().toISOString(),
              };
              mapById.set(cId, deb);
            }
          } catch {}
        }
      }
    } catch {}
  }

  const results = Array.from(mapById.values());

  // Enriquecer nomes faltantes via profiles
  const missingNameUserIds = results
    .filter((d) => (!d.cliente_nome || d.cliente_nome === "Cliente") && d.cliente_id)
    .map((d) => d.cliente_id);

  if (missingNameUserIds.length > 0) {
    try {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, nome, telefone, avatar_url")
        .in("id", missingNameUserIds);

      if (Array.isArray(profiles)) {
        const profMap = new Map(profiles.map((p) => [p.id, p]));
        for (const res of results) {
          if (res.cliente_id && profMap.has(res.cliente_id)) {
            const p = profMap.get(res.cliente_id)!;
            if (p.nome) res.cliente_nome = p.nome;
            if (p.telefone) res.cliente_telefone = p.telefone;
            if (p.avatar_url) res.cliente_avatar = p.avatar_url;
          }
        }
      }
    } catch {}
  }

  // Ordenar decrescente por data
  results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return results;
}

/** Formata o motivo legível de um item de taxa */
export function formatItemReason(item?: any): string {
  if (!item) return "Taxa de cancelamento/falta pendente";
  const motivoRaw = item.motivo || "";
  const valor = Number(item.valor_taxa || 0);
  const valorFmt = `R$ ${valor.toFixed(2).replace(".", ",")}`;

  let dataStr = "";
  if (item.created_at) {
    try {
      const d = new Date(item.created_at);
      dataStr = ` em ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    } catch {}
  }

  if (motivoRaw === "falta" || motivoRaw.toLowerCase().includes("falta") || motivoRaw.includes("no_show")) {
    return `Falta${dataStr} - ${valorFmt}`;
  }
  if (motivoRaw === "cancelamento_tardio" || motivoRaw.toLowerCase().includes("cancel")) {
    return `Cancelamento com menos de 2h${dataStr} - ${valorFmt}`;
  }

  return `${motivoRaw || "Taxa pendente"} - ${valorFmt}`;
}

/**
 * Extrai o desmembramento de dívida pendente de um agendamento.
 * Permite que o barbeiro visualize claramente:
 * Serviço: R$ 30,00 | Taxa anterior: + R$ 20,00 | Total no balcão: R$ 50,00
 */
export function extractDebtFromAppointment(appointment?: {
  preco?: number | null;
  observacoes?: string | null;
  servico?: { preco?: number | null } | null;
}): AppointmentDebtBreakdown {
  const totalPrice = Number(appointment?.preco || 0);
  const obs = appointment?.observacoes || "";

  // Procura padrão gerado pelo dubagenda: "Taxa pendente inclusa: R$ 20,00"
  const match = obs.match(/Taxa\s+pendente\s+inclusa:\s*R\$\s*([\d,.]+)/i);
  if (match && match[1]) {
    const rawVal = match[1].replace(".", "").replace(",", ".");
    const debtAmount = parseFloat(rawVal);
    if (!isNaN(debtAmount) && debtAmount > 0) {
      const servicePrice = Math.max(0, Math.round((totalPrice - debtAmount) * 100) / 100);
      return {
        hasDebt: true,
        debtAmount,
        servicePrice,
        totalToCollect: totalPrice,
        debtReason: `Taxa anterior somada: + R$ ${debtAmount.toFixed(2).replace(".", ",")}`,
      };
    }
  }

  // Se o serviço original tem preço conhecido menor que o preço cobrado
  const servicoPreco = Number(appointment?.servico?.preco || 0);
  if (servicoPreco > 0 && totalPrice > servicoPreco) {
    const diff = Math.round((totalPrice - servicoPreco) * 100) / 100;
    if (diff > 0 && obs.toLowerCase().includes("taxa")) {
      return {
        hasDebt: true,
        debtAmount: diff,
        servicePrice: servicoPreco,
        totalToCollect: totalPrice,
        debtReason: `Taxa anterior somada: + R$ ${diff.toFixed(2).replace(".", ",")}`,
      };
    }
  }

  return {
    hasDebt: false,
    debtAmount: 0,
    servicePrice: totalPrice,
    totalToCollect: totalPrice,
  };
}

/**
 * Assina alterações em tempo real nos débitos de um cliente específico.
 * Utilizado por modais e telas para desbloquear a interface instantaneamente.
 */
export function subscribeToClientCancellationDebts(
  clienteId: string,
  onUpdate: (debito: ClienteDebitoCancelamento | null) => void
): () => void {
  if (!clienteId) return () => {};

  const channel = supabase
    .channel(`debito-cliente-${clienteId}-${Date.now()}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "informacoes_empresa",
        filter: `chave=eq.debito_cancelamento_${clienteId}`,
      },
      (payload) => {
        const row = payload.new as any;
        if (!row || !row.valor) {
          onUpdate(null);
          return;
        }

        try {
          const parsed = JSON.parse(row.valor);
          const total = Number(parsed.total_pendente ?? parsed.valor_taxa ?? 0);
          const deb: ClienteDebitoCancelamento = {
            id: parsed.id || row.id,
            cliente_id: clienteId,
            cliente_nome: parsed.cliente_nome,
            cliente_telefone: parsed.cliente_telefone,
            barbeiro_id: parsed.barbeiro_id || (parsed.itens?.[0]?.barbeiro_id ?? ""),
            barbeiro_nome: parsed.barbeiro_nome || (parsed.itens?.[0]?.barbeiro_nome ?? "Barbeiro"),
            tenant_id: row.tenant_id,
            agendamento_id: parsed.agendamento_id || (parsed.itens?.[0]?.agendamento_id ?? null),
            valor_taxa: total,
            total_pendente: total,
            tipo_taxa: parsed.tipo_taxa || "porcentagem",
            porcentagem_aplicada: parsed.porcentagem_aplicada ? Number(parsed.porcentagem_aplicada) : null,
            valor_servico_original: parsed.valor_servico_original ? Number(parsed.valor_servico_original) : null,
            motivo: parsed.motivo || (parsed.itens?.[0]?.motivo ?? "Taxa pendente"),
            status: parsed.status || (total > 0 ? "pendente" : "pago"),
            itens: parsed.itens || [],
            created_at: parsed.created_at || new Date().toISOString(),
            pix_payload: parsed.pix_payload || null,
          };
          onUpdate(deb);
        } catch {
          onUpdate(null);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Marca o débito de cancelamento de um cliente como pago (ex: após pagamento via Pix no app).
 */
export async function markCancellationDebtAsPaid(
  debitoId: string,
  clienteId: string
): Promise<boolean> {
  if (!clienteId) return false;

  try {
    const chave = `debito_cancelamento_${clienteId}`;
    const { data: existing } = await supabase
      .from("informacoes_empresa")
      .select("id, valor")
      .eq("chave", chave)
      .maybeSingle();

    if (existing?.id) {
      let parsed: any = {};
      try {
        parsed = JSON.parse(existing.valor);
      } catch {}

      parsed.status = "pago";
      parsed.total_pendente = 0;
      parsed.valor_taxa = 0;
      parsed.pago_em = new Date().toISOString();

      if (Array.isArray(parsed.itens)) {
        parsed.itens = parsed.itens.map((it: any) => ({
          ...it,
          status: "pago",
          pago_em: new Date().toISOString(),
        }));
      }

      await supabase
        .from("informacoes_empresa")
        .update({
          valor: JSON.stringify(parsed),
          ativo: false,
          atualizado_em: new Date().toISOString(),
        } as any)
        .eq("id", existing.id);
    }

    // Atualiza tabela dedicada se existir
    try {
      await (supabase as any)
        .from("cliente_debitos_cancelamento")
        .update({
          status: "pago",
          pago_em: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("cliente_id", clienteId);
    } catch {}

    return true;
  } catch (err) {
    console.error("[markCancellationDebtAsPaid] Erro ao marcar débito como pago:", err);
    return false;
  }
}

