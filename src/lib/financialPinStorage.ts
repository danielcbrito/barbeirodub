/**
 * Utilitário para persistência e recuperação segura do PIN financeiro localmente.
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

export function saveFinancialPin(userId: string, pin: string): void {
  if (!userId || !pin || pin.length !== 4) return;
  try {
    const key = `${PIN_STORAGE_PREFIX}${userId}`;
    localStorage.setItem(key, obfuscatePin(pin, userId));
  } catch (err) {
    console.warn("[financialPinStorage] falha ao salvar pin local:", err);
  }
}

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

export function clearSavedFinancialPin(userId: string): void {
  if (!userId) return;
  try {
    const key = `${PIN_STORAGE_PREFIX}${userId}`;
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
