import { supabase } from "@/integrations/supabase/client";

/**
 * Utilitário para persistência e recuperação segura do PIN financeiro (local e banco de dados).
 * Permite que saques subsequentes sejam autorizados automaticamente ao arrastar
 * o slider ("Deslize para transferir"), enviando o PIN diretamente para o banco
 * de dados (Supabase) sem exigir que o barbeiro redigite o PIN toda hora.
 */

const PIN_STORAGE_PREFIX = "dub:fin_pin:v1:";

function obfuscatePin(pin: string, userId: string): string {
  try {
    const payload = JSON.stringify({ p: pin, u: userId, t: Date.now() });
    return btoa(encodeURIComponent(payload));
  } catch {
    return pin;
  }
}

function deobfuscatePin(stored: string, userId: string): string | null {
  try {
    const raw = decodeURIComponent(atob(stored));
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.p === "string" && parsed.u === userId) {
      return parsed.p;
    }
    return null;
  } catch {
    return /^\d{4}$/.test(stored) ? stored : null;
  }
}

/**
 * Salva o PIN tanto no localStorage quanto no banco de dados (informacoes_empresa)
 * para persistência permanente entre dispositivos e sessões.
 */
export async function saveFinancialPin(userId: string, pin: string, barbeiroId?: string): Promise<void> {
  if (!userId || !pin || pin.length !== 4) return;
  const obfuscated = obfuscatePin(pin, userId);

  // 1. Salva localmente para leitura ultra-rápida (0ms)
  try {
    localStorage.setItem(`${PIN_STORAGE_PREFIX}${userId}`, obfuscated);
    if (barbeiroId && barbeiroId !== userId) {
      localStorage.setItem(`${PIN_STORAGE_PREFIX}${barbeiroId}`, obfuscatePin(pin, barbeiroId));
    }
  } catch (err) {
    console.warn("[financialPinStorage] falha ao salvar pin local:", err);
  }

  // 2. Salva no banco de dados (informacoes_empresa com chave formas_pagamento_pin_*)
  // Essa política RLS permite escrita e leitura por qualquer barbeiro autenticado
  try {
    await supabase.from("informacoes_empresa").upsert(
      {
        chave: `formas_pagamento_pin_${userId}`,
        categoria: "financeiro",
        valor: obfuscated,
        ativo: true,
      },
      { onConflict: "chave" }
    );

    if (barbeiroId && barbeiroId !== userId) {
      await supabase.from("informacoes_empresa").upsert(
        {
          chave: `formas_pagamento_pin_${barbeiroId}`,
          categoria: "financeiro",
          valor: obfuscatePin(pin, barbeiroId),
          ativo: true,
        },
        { onConflict: "chave" }
      );
    }
  } catch (err) {
    console.warn("[financialPinStorage] falha ao sincronizar pin com banco:", err);
  }
}

/**
 * Leitura síncrona do cache local
 */
export function getSavedFinancialPin(userId: string): string | null {
  if (!userId) return null;
  try {
    const key = `${PIN_STORAGE_PREFIX}${userId}`;
    const item = localStorage.getItem(key);
    if (!item) return null;
    return deobfuscatePin(item, userId);
  } catch {
    return null;
  }
}

/**
 * Busca o PIN salvo no localStorage ou consulta o banco de dados (informacoes_empresa)
 * se o cache local estiver vazio.
 */
export async function fetchSavedFinancialPin(userId: string, barbeiroId?: string): Promise<string | null> {
  if (!userId) return null;

  // 1. Tenta recuperar do localStorage (0ms)
  const localPin = getSavedFinancialPin(userId) || (barbeiroId ? getSavedFinancialPin(barbeiroId) : null);
  if (localPin && localPin.length === 4) {
    return localPin;
  }

  // 2. Se não estiver no localStorage, busca no banco de dados (informacoes_empresa)
  try {
    const { data } = await supabase
      .from("informacoes_empresa")
      .select("valor")
      .eq("chave", `formas_pagamento_pin_${userId}`)
      .maybeSingle();

    if (data?.valor) {
      const pin = deobfuscatePin(data.valor, userId);
      if (pin && pin.length === 4) {
        // Popula localStorage para o próximo uso
        try {
          localStorage.setItem(`${PIN_STORAGE_PREFIX}${userId}`, data.valor);
        } catch {}
        return pin;
      }
    }

    // Fallback tentando por barbeiroId
    if (barbeiroId && barbeiroId !== userId) {
      const { data: barbData } = await supabase
        .from("informacoes_empresa")
        .select("valor")
        .eq("chave", `formas_pagamento_pin_${barbeiroId}`)
        .maybeSingle();

      if (barbData?.valor) {
        const pin = deobfuscatePin(barbData.valor, barbeiroId);
        if (pin && pin.length === 4) {
          try {
            localStorage.setItem(`${PIN_STORAGE_PREFIX}${barbeiroId}`, barbData.valor);
          } catch {}
          return pin;
        }
      }
    }
  } catch (err) {
    console.warn("[financialPinStorage] erro ao buscar pin do banco:", err);
  }

  return null;
}

export async function clearSavedFinancialPin(userId: string, barbeiroId?: string): Promise<void> {
  if (!userId) return;
  try {
    localStorage.removeItem(`${PIN_STORAGE_PREFIX}${userId}`);
    if (barbeiroId) localStorage.removeItem(`${PIN_STORAGE_PREFIX}${barbeiroId}`);
  } catch {}

  try {
    await supabase
      .from("informacoes_empresa")
      .delete()
      .eq("chave", `formas_pagamento_pin_${userId}`);

    if (barbeiroId) {
      await supabase
        .from("informacoes_empresa")
        .delete()
        .eq("chave", `formas_pagamento_pin_${barbeiroId}`);
    }
  } catch {}
}
