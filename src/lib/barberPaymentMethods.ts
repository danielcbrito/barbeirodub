import { supabase } from "@/integrations/supabase/client";

export interface BarberPaymentMethods {
  pix: boolean;
  barbearia: boolean;
}

const DEFAULT_METHODS: BarberPaymentMethods = {
  pix: true,
  barbearia: true,
};

const MEM_CACHE = new Map<string, { data: BarberPaymentMethods; timestamp: number }>();
const CACHE_TTL_MS = 60 * 1000; // 1 minuto em memória para leituras rápidas

/**
 * Busca as formas de pagamento configuradas para um barbeiro específico.
 * Totalmente isolado por barbeiro.
 */
export async function fetchBarberPaymentMethods(
  barbeiroId: string,
  tenantId?: string | null
): Promise<BarberPaymentMethods> {
  if (!barbeiroId) return { ...DEFAULT_METHODS };

  // 1. Checa cache em memória recente
  const cached = MEM_CACHE.get(barbeiroId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  let result: BarberPaymentMethods = { ...DEFAULT_METHODS };
  let found = false;

  // 2. Estratégia Principal: tabela dedicada `barbeiro_formas_pagamento`
  try {
    const { data, error } = await supabase
      .from("barbeiro_formas_pagamento" as any)
      .select("pix_habilitado, pagamento_barbearia_habilitado")
      .eq("barbeiro_id", barbeiroId)
      .maybeSingle();

    if (!error && data) {
      result = {
        pix: typeof (data as any).pix_habilitado === "boolean" ? (data as any).pix_habilitado : true,
        barbearia: typeof (data as any).pagamento_barbearia_habilitado === "boolean" ? (data as any).pagamento_barbearia_habilitado : true,
      };
      found = true;
    }
  } catch (err) {
    // Tabela pode ainda estar sendo provisionada
  }

  // 3. Estratégia de Fallback 1: `informacoes_empresa` com chave específica por barbeiro
  if (!found) {
    try {
      const { data, error } = await supabase
        .from("informacoes_empresa")
        .select("valor")
        .eq("chave", `formas_pagamento_${barbeiroId}`)
        .maybeSingle();

      if (!error && data?.valor) {
        const parsed = JSON.parse(data.valor);
        if (typeof parsed === "object" && parsed !== null) {
          result = {
            pix: typeof parsed.pix === "boolean" ? parsed.pix : true,
            barbearia: typeof parsed.barbearia === "boolean" ? parsed.barbearia : true,
          };
          found = true;
        }
      }
    } catch {}
  }

  // 4. Estratégia de Fallback 2: colunas na tabela `barbeiros`
  if (!found) {
    try {
      const { data, error } = await supabase
        .from("barbeiros")
        .select("pagamento_pix_habilitado, pagamento_barbearia_habilitado" as any)
        .eq("id", barbeiroId)
        .maybeSingle();

      if (!error && data) {
        const d = data as any;
        if (typeof d.pagamento_pix_habilitado === "boolean" || typeof d.pagamento_barbearia_habilitado === "boolean") {
          result = {
            pix: typeof d.pagamento_pix_habilitado === "boolean" ? d.pagamento_pix_habilitado : true,
            barbearia: typeof d.pagamento_barbearia_habilitado === "boolean" ? d.pagamento_barbearia_habilitado : true,
          };
          found = true;
        }
      }
    } catch {}
  }

  // Armazena no cache
  MEM_CACHE.set(barbeiroId, { data: result, timestamp: Date.now() });
  return result;
}

/**
 * Salva as formas de pagamento para um barbeiro específico no Supabase.
 * Salva com isolamento total para que não afete outros barbeiros.
 */
export async function saveBarberPaymentMethods({
  barbeiroId,
  userId,
  tenantId,
  pix,
  barbearia,
}: {
  barbeiroId: string;
  userId?: string | null;
  tenantId?: string | null;
  pix: boolean;
  barbearia: boolean;
}): Promise<BarberPaymentMethods> {
  if (!barbeiroId) throw new Error("ID do barbeiro não fornecido");

  const newMethods: BarberPaymentMethods = { pix, barbearia };

  // Atualiza cache em memória imediatamente (Optimistic)
  MEM_CACHE.set(barbeiroId, { data: newMethods, timestamp: Date.now() });

  let savedSuccessfully = false;
  let lastError: any = null;

  // 1. Salvar na tabela dedicada `barbeiro_formas_pagamento`
  try {
    const { error } = await supabase
      .from("barbeiro_formas_pagamento" as any)
      .upsert(
        {
          barbeiro_id: barbeiroId,
          user_id: userId || null,
          pix_habilitado: pix,
          pagamento_barbearia_habilitado: barbearia,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "barbeiro_id" }
      );

    if (!error) {
      savedSuccessfully = true;
    } else {
      lastError = error;
    }
  } catch (err) {
    lastError = err;
  }

  // 2. Salvar também em `informacoes_empresa` com chave única por barbeiro (garante persistência multi-nível)
  try {
    const chave = `formas_pagamento_${barbeiroId}`;
    const valorJson = JSON.stringify(newMethods);

    // Tenta atualizar se já existir
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

      if (!upErr) savedSuccessfully = true;
      else if (!savedSuccessfully) lastError = upErr;
    } else {
      const { error: insErr } = await supabase
        .from("informacoes_empresa")
        .insert({
          chave,
          categoria: "pagamentos",
          valor: valorJson,
          tenant_id: tenantId || null,
          ativo: true,
        } as any);

      if (!insErr) savedSuccessfully = true;
      else if (!savedSuccessfully) lastError = insErr;
    }
  } catch (err) {
    if (!savedSuccessfully) lastError = err;
  }

  // 3. Tentar atualizar colunas na tabela `barbeiros`
  try {
    const { error: bErr } = await supabase
      .from("barbeiros")
      .update({
        pagamento_pix_habilitado: pix,
        pagamento_barbearia_habilitado: barbearia,
      } as any)
      .eq("id", barbeiroId);

    if (!bErr) savedSuccessfully = true;
  } catch {}

  if (!savedSuccessfully && lastError) {
    console.error("[saveBarberPaymentMethods] Falha ao persistir no Supabase:", lastError);
    throw new Error(lastError.message || "Erro ao salvar no banco de dados");
  }

  return newMethods;
}

/**
 * Assina atualizações em tempo real (Supabase Realtime) para as formas de pagamento
 * de um barbeiro específico.
 */
export function subscribeToBarberPaymentMethods(
  barbeiroId: string,
  onUpdate: (methods: BarberPaymentMethods) => void
): () => void {
  if (!barbeiroId) return () => {};

  const channelName = `barber-pay-methods-${barbeiroId}-${Date.now()}`;
  const channel = supabase
    .channel(channelName)
    // 1. Escuta alterações na tabela dedicada
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "barbeiro_formas_pagamento",
        filter: `barbeiro_id=eq.${barbeiroId}`,
      },
      (payload) => {
        const row = payload.new as any;
        if (row) {
          const methods: BarberPaymentMethods = {
            pix: typeof row.pix_habilitado === "boolean" ? row.pix_habilitado : true,
            barbearia: typeof row.pagamento_barbearia_habilitado === "boolean" ? row.pagamento_barbearia_habilitado : true,
          };
          MEM_CACHE.set(barbeiroId, { data: methods, timestamp: Date.now() });
          onUpdate(methods);
        }
      }
    )
    // 2. Escuta alterações na tabela de informações da empresa para a chave do barbeiro
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "informacoes_empresa",
        filter: `chave=eq.formas_pagamento_${barbeiroId}`,
      },
      (payload) => {
        const row = payload.new as any;
        if (row?.valor) {
          try {
            const parsed = JSON.parse(row.valor);
            const methods: BarberPaymentMethods = {
              pix: typeof parsed.pix === "boolean" ? parsed.pix : true,
              barbearia: typeof parsed.barbearia === "boolean" ? parsed.barbearia : true,
            };
            MEM_CACHE.set(barbeiroId, { data: methods, timestamp: Date.now() });
            onUpdate(methods);
          } catch {}
        }
      }
    )
    // 3. Escuta alterações na tabela de barbeiros
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "barbeiros",
        filter: `id=eq.${barbeiroId}`,
      },
      (payload) => {
        const row = payload.new as any;
        if (
          row &&
          (typeof row.pagamento_pix_habilitado === "boolean" ||
            typeof row.pagamento_barbearia_habilitado === "boolean")
        ) {
          const methods: BarberPaymentMethods = {
            pix: typeof row.pagamento_pix_habilitado === "boolean" ? row.pagamento_pix_habilitado : true,
            barbearia: typeof row.pagamento_barbearia_habilitado === "boolean" ? row.pagamento_barbearia_habilitado : true,
          };
          MEM_CACHE.set(barbeiroId, { data: methods, timestamp: Date.now() });
          onUpdate(methods);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
