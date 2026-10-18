import { supabase } from "@/integrations/supabase/client";

export interface BarberCancellationFeeConfig {
  habilitado: boolean;
  tipo: "porcentagem" | "fixo";
  valor: number; // Porcentagem (ex: 20 = 20%) ou Valor Fixo em Reais (ex: 15 = R$ 15,00)
  horas_antecedencia: number; // 0 = qualquer cancelamento; >0 = cancelamentos com menos de X horas
}

export interface ClienteDebitoCancelamento {
  id: string;
  cliente_id: string;
  barbeiro_id: string;
  barbeiro_nome?: string;
  tenant_id?: string | null;
  agendamento_id?: string | null;
  valor_taxa: number;
  tipo_taxa: "porcentagem" | "fixo";
  porcentagem_aplicada?: number | null;
  valor_servico_original?: number | null;
  motivo?: string | null;
  status: "pendente" | "pago" | "dispensado";
  pix_charge_id?: string | null;
  pix_payload?: string | null;
  pix_qrcode?: string | null;
  created_at: string;
}

const DEFAULT_FEE_CONFIG: BarberCancellationFeeConfig = {
  habilitado: false,
  tipo: "porcentagem",
  valor: 20, // 20% padrão quando ativado
  horas_antecedencia: 0, // qualquer cancelamento por padrão
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
          horas_antecedencia: typeof parsed.horas_antecedencia === "number" ? parsed.horas_antecedencia : 0,
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
        .select("habilitado, tipo, valor, horas_antecedencia")
        .eq("barbeiro_id", barbeiroId)
        .maybeSingle();

      if (!error && data) {
        result = {
          habilitado: Boolean(data.habilitado),
          tipo: data.tipo === "fixo" ? "fixo" : "porcentagem",
          valor: Number(data.valor) || 20,
          horas_antecedencia: Number(data.horas_antecedencia) || 0,
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

  // Atualiza cache em memória imediatamente
  MEM_CACHE.set(barbeiroId, { data: config, timestamp: Date.now() });

  const chave = `taxa_cancelamento_${barbeiroId}`;
  const valorJson = JSON.stringify(config);

  let saved = false;
  let lastErr: any = null;

  // 1. Persistir em informacoes_empresa (funciona imediatamente)
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
          categoria: "cancelamentos",
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
        habilitado: config.habilitado,
        tipo: config.tipo,
        valor: config.valor,
        horas_antecedencia: config.horas_antecedencia,
        updated_at: new Date().toISOString(),
      }, { onConflict: "barbeiro_id" });
  } catch {}

  if (!saved && lastErr) {
    console.error("[saveBarberCancellationFee] Erro ao salvar:", lastErr);
    throw new Error(lastErr.message || "Erro ao salvar taxa de cancelamento");
  }

  return config;
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
              horas_antecedencia: typeof parsed.horas_antecedencia === "number" ? parsed.horas_antecedencia : 0,
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
 * Se houver algum débito com status 'pendente', retorna o objeto para que o app seja travado.
 */
export async function checkClientPendingCancellationDebt(
  clienteId: string
): Promise<ClienteDebitoCancelamento | null> {
  if (!clienteId) return null;

  try {
    // 1. Consulta tabela cliente_debitos_cancelamento se existir
    const { data, error } = await (supabase as any)
      .from("cliente_debitos_cancelamento")
      .select("*, barbeiros(apelido)")
      .eq("cliente_id", clienteId)
      .eq("status", "pendente")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return {
        id: data.id,
        cliente_id: data.cliente_id,
        barbeiro_id: data.barbeiro_id,
        barbeiro_nome: data.barbeiros?.apelido || "Barbeiro",
        tenant_id: data.tenant_id,
        agendamento_id: data.agendamento_id,
        valor_taxa: Number(data.valor_taxa),
        tipo_taxa: data.tipo_taxa || "porcentagem",
        porcentagem_aplicada: data.porcentagem_aplicada ? Number(data.porcentagem_aplicada) : null,
        valor_servico_original: data.valor_servico_original ? Number(data.valor_servico_original) : null,
        motivo: data.motivo,
        status: data.status,
        pix_charge_id: data.pix_charge_id,
        pix_payload: data.pix_payload,
        pix_qrcode: data.pix_qrcode,
        created_at: data.created_at,
      };
    }
  } catch {}

  // 2. Consulta fallback em informacoes_empresa para debito_${clienteId}
  try {
    const { data: fallbackData } = await supabase
      .from("informacoes_empresa")
      .select("valor")
      .eq("chave", `debito_cancelamento_${clienteId}`)
      .maybeSingle();

    if (fallbackData?.valor) {
      const parsed = JSON.parse(fallbackData.valor);
      if (parsed?.status === "pendente") {
        return parsed as ClienteDebitoCancelamento;
      }
    }
  } catch {}

  return null;
}

/**
 * Registra um débito de cancelamento para o cliente quando um agendamento é cancelado.
 */
export async function registerCancellationDebt({
  clienteId,
  clienteNome,
  clienteTelefone,
  barbeiroId,
  barbeiroNome,
  tenantId,
  agendamentoId,
  servicoNome,
  valorServico,
  dataHoraAgendamento,
}: {
  clienteId: string;
  clienteNome?: string;
  clienteTelefone?: string;
  barbeiroId: string;
  barbeiroNome?: string;
  tenantId?: string | null;
  agendamentoId?: string;
  servicoNome?: string;
  valorServico: number;
  dataHoraAgendamento?: Date | string;
}): Promise<ClienteDebitoCancelamento | null> {
  if (!clienteId || !barbeiroId) return null;

  // 1. Obtém as configurações de taxa do barbeiro
  const config = await fetchBarberCancellationFee(barbeiroId, tenantId);
  if (!config.habilitado) return null;

  // 2. Verifica a regra de antecedência (se configurada)
  if (config.horas_antecedencia > 0 && dataHoraAgendamento) {
    const agendamentoDate = new Date(dataHoraAgendamento);
    const agora = new Date();
    const diffMs = agendamentoDate.getTime() - agora.getTime();
    const diffHoras = diffMs / (1000 * 60 * 60);

    // Se o cancelamento ocorreu com antecedência suficiente, não cobra taxa
    if (diffHoras >= config.horas_antecedencia) {
      return null;
    }
  }

  // 3. Calcula o valor da taxa
  let valorTaxa = 0;
  let porcentagemAplicada: number | null = null;

  if (config.tipo === "porcentagem") {
    porcentagemAplicada = config.valor;
    valorTaxa = Math.round((valorServico * (config.valor / 100)) * 100) / 100;
  } else {
    valorTaxa = config.valor;
  }

  // Se o valor for 0 ou negativo, não gera débito
  if (valorTaxa <= 0) return null;

  const novoDebito: ClienteDebitoCancelamento = {
    id: crypto.randomUUID(),
    cliente_id: clienteId,
    cliente_nome: clienteNome,
    cliente_telefone: clienteTelefone,
    barbeiro_id: barbeiroId,
    barbeiro_nome: barbeiroNome,
    tenant_id: tenantId || null,
    agendamento_id: agendamentoId || null,
    valor_taxa: valorTaxa,
    tipo_taxa: config.tipo,
    porcentagem_aplicada: porcentagemAplicada,
    valor_servico_original: valorServico,
    motivo: `Taxa de cancelamento (${config.tipo === "porcentagem" ? `${config.valor}%` : `R$ ${config.valor.toFixed(2)}`})`,
    status: "pendente",
    created_at: new Date().toISOString(),
  };

  // 4. Salva no banco de dados na tabela dedicada (se existir)
  try {
    await (supabase as any)
      .from("cliente_debitos_cancelamento")
      .insert({
        id: novoDebito.id,
        cliente_id: clienteId,
        barbeiro_id: barbeiroId,
        tenant_id: tenantId || null,
        agendamento_id: agendamentoId || null,
        valor_taxa: valorTaxa,
        tipo_taxa: config.tipo,
        porcentagem_aplicada: porcentagemAplicada,
        valor_servico_original: valorServico,
        motivo: novoDebito.motivo,
        status: "pendente",
      });
  } catch {}

  // 5. Salva na chave do cliente para bloqueio instantâneo do app
  try {
    const chave = `debito_cancelamento_${clienteId}`;
    await supabase.from("informacoes_empresa").upsert({
      chave,
      categoria: "debitos_cliente",
      valor: JSON.stringify(novoDebito),
      tenant_id: tenantId || null,
      ativo: true,
    } as any, { onConflict: "tenant_id,chave" });
  } catch {}

  // 6. Indexa na lista de débitos pendentes do barbeiro
  try {
    const listKey = `lista_debitos_pendentes_${barbeiroId}`;
    const { data: listRow } = await supabase
      .from("informacoes_empresa")
      .select("id, valor")
      .eq("chave", listKey)
      .maybeSingle();

    let list: ClienteDebitoCancelamento[] = [];
    if (listRow?.valor) {
      try { list = JSON.parse(listRow.valor); } catch {}
    }
    // Remove qualquer duplicata e adiciona o novo no início
    list = [novoDebito, ...list.filter((d) => d.id !== novoDebito.id && d.cliente_id !== novoDebito.cliente_id)];

    if (listRow?.id) {
      await supabase
        .from("informacoes_empresa")
        .update({
          valor: JSON.stringify(list),
          atualizado_em: new Date().toISOString(),
        } as any)
        .eq("id", listRow.id);
    } else {
      await supabase.from("informacoes_empresa").insert({
        chave: listKey,
        categoria: "debitos_barbeiro",
        valor: JSON.stringify(list),
        tenant_id: tenantId || null,
        ativo: true,
      } as any);
    }
  } catch {}

  return novoDebito;
}

/**
 * Dá baixa no débito após o pagamento ser confirmado via Pix.
 */
export async function markCancellationDebtAsPaid(
  debitoId: string,
  clienteId: string,
  barbeiroId?: string
): Promise<boolean> {
  if (!debitoId && !clienteId) return false;

  try {
    await (supabase as any)
      .from("cliente_debitos_cancelamento")
      .update({
        status: "pago",
        pago_em: new Date().toISOString(),
      })
      .eq(debitoId ? "id" : "cliente_id", debitoId || clienteId);
  } catch {}

  try {
    const chave = `debito_cancelamento_${clienteId}`;
    const { data: existing } = await supabase
      .from("informacoes_empresa")
      .select("id, valor")
      .eq("chave", chave)
      .maybeSingle();

    if (existing?.id) {
      let parsed: any = {};
      try { parsed = JSON.parse(existing.valor); } catch {}
      parsed.status = "pago";
      parsed.pago_em = new Date().toISOString();

      await supabase
        .from("informacoes_empresa")
        .update({
          valor: JSON.stringify(parsed),
          ativo: false,
          atualizado_em: new Date().toISOString(),
        } as any)
        .eq("id", existing.id);
    }
  } catch {}

  // Remove da lista do barbeiro se especificado
  if (barbeiroId) {
    try {
      const listKey = `lista_debitos_pendentes_${barbeiroId}`;
      const { data: listRow } = await supabase
        .from("informacoes_empresa")
        .select("id, valor")
        .eq("chave", listKey)
        .maybeSingle();

      if (listRow?.valor) {
        try {
          const list: ClienteDebitoCancelamento[] = JSON.parse(listRow.valor);
          const filtered = list.filter((d) => d.id !== debitoId && d.cliente_id !== clienteId);
          await supabase
            .from("informacoes_empresa")
            .update({
              valor: JSON.stringify(filtered),
              atualizado_em: new Date().toISOString(),
            } as any)
            .eq("id", listRow.id);
        } catch {}
      }
    } catch {}
  }

  return true;
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
  debitoId: string;
  clienteId: string;
  barbeiroId: string;
  tenantId?: string | null;
}): Promise<boolean> {
  if (!debitoId && !clienteId) return false;

  // 1. Atualizar tabela cliente_debitos_cancelamento se existir
  try {
    await (supabase as any)
      .from("cliente_debitos_cancelamento")
      .update({
        status: "dispensado",
        dispensado_em: new Date().toISOString(),
      })
      .eq(debitoId ? "id" : "cliente_id", debitoId || clienteId);
  } catch {}

  // 2. Atualizar informacoes_empresa debito_cancelamento_${clienteId}
  // Marcando como 'liberado_manual' e ativo: false para desbloqueio em tempo real
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
      parsed.dispensado_em = new Date().toISOString();

      await supabase
        .from("informacoes_empresa")
        .update({
          valor: JSON.stringify(parsed),
          ativo: false,
          atualizado_em: new Date().toISOString(),
        } as any)
        .eq("id", existing.id);
    }
  } catch {}

  // 3. Atualizar a lista indexada do barbeiro
  try {
    const listKey = `lista_debitos_pendentes_${barbeiroId}`;
    const { data: listRow } = await supabase
      .from("informacoes_empresa")
      .select("id, valor")
      .eq("chave", listKey)
      .maybeSingle();

    if (listRow?.valor) {
      try {
        const list: ClienteDebitoCancelamento[] = JSON.parse(listRow.valor);
        const filtered = list.filter((d) => d.id !== debitoId && d.cliente_id !== clienteId);
        await supabase
          .from("informacoes_empresa")
          .update({
            valor: JSON.stringify(filtered),
            atualizado_em: new Date().toISOString(),
          } as any)
          .eq("id", listRow.id);
      } catch {}
    }
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

  // 1. Buscar da tabela cliente_debitos_cancelamento se existir
  try {
    const { data, error } = await (supabase as any)
      .from("cliente_debitos_cancelamento")
      .select("*, profiles:cliente_id(nome, telefone)")
      .eq("barbeiro_id", barbeiroId)
      .eq("status", "pendente")
      .order("created_at", { ascending: false });

    if (!error && Array.isArray(data)) {
      for (const item of data) {
        const deb: ClienteDebitoCancelamento = {
          id: item.id,
          cliente_id: item.cliente_id,
          cliente_nome: item.profiles?.nome || item.cliente_nome,
          cliente_telefone: item.profiles?.telefone || item.cliente_telefone,
          barbeiro_id: item.barbeiro_id,
          tenant_id: item.tenant_id,
          agendamento_id: item.agendamento_id,
          valor_taxa: Number(item.valor_taxa) || 0,
          tipo_taxa: item.tipo_taxa || "porcentagem",
          porcentagem_aplicada: item.porcentagem_aplicada ? Number(item.porcentagem_aplicada) : null,
          valor_servico_original: item.valor_servico_original ? Number(item.valor_servico_original) : null,
          motivo: item.motivo,
          status: item.status,
          pix_charge_id: item.pix_charge_id,
          pix_payload: item.pix_payload,
          pix_qrcode: item.pix_qrcode,
          created_at: item.created_at,
        };
        mapById.set(deb.id, deb);
      }
    }
  } catch {}

  // 2. Buscar da lista indexada em informacoes_empresa: lista_debitos_pendentes_${barbeiroId}
  try {
    const listKey = `lista_debitos_pendentes_${barbeiroId}`;
    const { data: listRow } = await supabase
      .from("informacoes_empresa")
      .select("valor")
      .eq("chave", listKey)
      .maybeSingle();

    if (listRow?.valor) {
      const parsedList = JSON.parse(listRow.valor);
      if (Array.isArray(parsedList)) {
        for (const item of parsedList) {
          if (item?.status === "pendente" && !mapById.has(item.id)) {
            mapById.set(item.id, item);
          }
        }
      }
    }
  } catch {}

  // 3. Buscar débitos gerais em informacoes_empresa onde categoria = 'debitos_cliente' e ativo = true
  try {
    const { data: rows } = await supabase
      .from("informacoes_empresa")
      .select("valor")
      .eq("categoria", "debitos_cliente")
      .eq("ativo", true);

    if (Array.isArray(rows)) {
      for (const row of rows) {
        if (row.valor) {
          try {
            const parsed = JSON.parse(row.valor);
            if (
              parsed?.barbeiro_id === barbeiroId &&
              parsed?.status === "pendente" &&
              !mapById.has(parsed.id)
            ) {
              mapById.set(parsed.id, parsed);
            }
          } catch {}
        }
      }
    }
  } catch {}

  const results = Array.from(mapById.values());

  // 4. Se algum cliente estiver sem nome, busca no profiles para enriquecer a exibição
  const missingNameUserIds = results
    .filter((d) => !d.cliente_nome && d.cliente_id)
    .map((d) => d.cliente_id);

  if (missingNameUserIds.length > 0) {
    try {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, nome, telefone")
        .in("id", missingNameUserIds);

      if (Array.isArray(profiles)) {
        const profMap = new Map(profiles.map((p) => [p.id, p]));
        for (const res of results) {
          if (!res.cliente_nome && res.cliente_id && profMap.has(res.cliente_id)) {
            const p = profMap.get(res.cliente_id)!;
            res.cliente_nome = p.nome;
            res.cliente_telefone = p.telefone;
          }
        }
      }
    } catch {}
  }

  // Ordenar decrescente por data de criação
  results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return results;
}

/**
 * Assina atualizações em tempo real nos débitos do cliente (para desbloqueio instantâneo do app).
 */
export function subscribeToClientCancellationDebts(
  clienteId: string,
  onUpdate: (debt: ClienteDebitoCancelamento | null) => void
): () => void {
  if (!clienteId) return () => {};

  const channel = supabase
    .channel(`cliente-debitos-${clienteId}-${Date.now()}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "cliente_debitos_cancelamento",
        filter: `cliente_id=eq.${clienteId}`,
      },
      async (payload) => {
        const row = payload.new as any;
        if (row && row.status === "pendente") {
          onUpdate(row as ClienteDebitoCancelamento);
        } else {
          onUpdate(null);
        }
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "informacoes_empresa",
        filter: `chave=eq.debito_cancelamento_${clienteId}`,
      },
      (payload) => {
        if (payload.eventType === "DELETE") {
          onUpdate(null);
          return;
        }
        const row = payload.new as any;
        if (row?.valor) {
          try {
            const parsed = JSON.parse(row.valor);
            if (parsed.status === "pendente") {
              onUpdate(parsed as ClienteDebitoCancelamento);
              return;
            }
          } catch {}
        }
        onUpdate(null);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Assina atualizações em tempo real na lista de débitos de um barbeiro.
 */
export function subscribeToBarberPendingDebts(
  barbeiroId: string,
  onUpdate: () => void
): () => void {
  if (!barbeiroId) return () => {};

  const channel = supabase
    .channel(`barbeiro-debitos-${barbeiroId}-${Date.now()}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "cliente_debitos_cancelamento",
        filter: `barbeiro_id=eq.${barbeiroId}`,
      },
      () => {
        onUpdate();
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "informacoes_empresa",
        filter: `chave=eq.lista_debitos_pendentes_${barbeiroId}`,
      },
      () => {
        onUpdate();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
