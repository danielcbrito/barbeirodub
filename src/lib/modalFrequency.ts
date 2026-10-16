import { format } from "date-fns";

interface DismissalRecord {
  date: string;
  timestamps: number[];
}

/**
 * Helper seguro e determinístico para controlar a frequência de auto-abertura de modais
 * @param storageKey Chave única no localStorage
 * @param maxPerDay Quantidade máxima de vezes que o modal pode abrir sozinho por dia
 * @param minHoursInterval Intervalo mínimo em horas entre cada abertura automática
 */
export function canAutoOpenModal(
  storageKey: string,
  maxPerDay: number,
  minHoursInterval: number
): boolean {
  if (typeof window === "undefined") return true;
  try {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const raw = localStorage.getItem(storageKey);
    if (!raw) return true;

    const parsed = JSON.parse(raw) as DismissalRecord;
    // Se a data registrada for anterior a hoje, novo ciclo começa
    if (parsed.date !== todayStr) return true;

    // Se já atingiu o limite de dispensas no dia (ex: 2 para setup, 3 para agenda)
    if (Array.isArray(parsed.timestamps) && parsed.timestamps.length >= maxPerDay) {
      return false;
    }

    // Se houve dispensa anterior hoje, respeita o intervalo de tempo mínimo
    if (Array.isArray(parsed.timestamps) && parsed.timestamps.length > 0) {
      const lastDismiss = parsed.timestamps[parsed.timestamps.length - 1];
      const hoursPassed = (Date.now() - lastDismiss) / (1000 * 60 * 60);
      if (hoursPassed < minHoursInterval) {
        return false;
      }
    }

    return true;
  } catch {
    return true;
  }
}

/**
 * Registra o fechamento/dispensa do modal no localStorage
 */
export function recordModalDismissal(storageKey: string): void {
  if (typeof window === "undefined") return;
  try {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const raw = localStorage.getItem(storageKey);
    let timestamps: number[] = [];

    if (raw) {
      try {
        const parsed = JSON.parse(raw) as DismissalRecord;
        if (parsed.date === todayStr && Array.isArray(parsed.timestamps)) {
          timestamps = parsed.timestamps;
        }
      } catch {}
    }

    timestamps.push(Date.now());
    localStorage.setItem(
      storageKey,
      JSON.stringify({ date: todayStr, timestamps })
    );
  } catch (err) {
    console.error(`[modalFrequency] Erro ao registrar fechamento (${storageKey}):`, err);
  }
}

/* ── 1. Configurar Barbearia ───────────────────────────────────────────────
 * Regra: Máximo 2 vezes ao dia, com intervalo mínimo de 5 horas.
 */
export const canAutoOpenSetupModal = () =>
  canAutoOpenModal("dub_setup_modal_dismiss", 2, 5);

export const recordSetupModalDismissal = () =>
  recordModalDismissal("dub_setup_modal_dismiss");

/* ── 2. Finalizar Atendimentos na Agenda ────────────────────────────────────
 * Regra: Máximo 3 vezes ao dia, com intervalo mínimo de 3 horas.
 */
export const canAutoOpenOverdueModal = () =>
  canAutoOpenModal("dub_overdue_modal_dismiss", 3, 3);

export const recordOverdueModalDismissal = () =>
  recordModalDismissal("dub_overdue_modal_dismiss");
