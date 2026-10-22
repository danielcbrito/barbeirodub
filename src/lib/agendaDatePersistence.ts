/**
 * Utilitário de persistência e sincronização de data selecionada na Agenda do Barbeiro / Admin.
 * Garante que ao navegar para os detalhes de um agendamento e retornar (ou recarregar),
 * o mês e o dia onde o barbeiro estava trabalhando sejam fielmente preservados.
 */

const AGENDA_DATE_STORAGE_KEY = "barber_agenda_selected_date";

/**
 * Normaliza qualquer formato de data (Date, string "YYYY-MM-DD", ISO) para um objeto Date seguro no fuso local.
 */
export function parseDateSafe(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val.getTime())) {
    return new Date(val.getFullYear(), val.getMonth(), val.getDate());
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    // Formato padrão "yyyy-MM-dd"
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, d] = trimmed.split("-").map(Number);
      const parsed = new Date(y, m - 1, d);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    // Formatos ISO como "2026-02-15T..."
    if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
      const datePart = trimmed.split("T")[0];
      const [y, m, d] = datePart.split("-").map(Number);
      const parsed = new Date(y, m - 1, d);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    }
  }
  return null;
}

/**
 * Converte Date para string 'yyyy-MM-dd' no fuso local sem problemas de timezone UTC.
 */
export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Salva a data selecionada da agenda na sessão para que retornos e recarregamentos preservem o dia.
 */
export function saveAgendaSelectedDate(date: Date | string | null | undefined): void {
  if (!date) return;
  try {
    const str = typeof date === "string" ? (parseDateSafe(date) ? formatDateKey(parseDateSafe(date)!) : null) : formatDateKey(date);
    if (str && /^\d{4}-\d{2}-\d{2}$/.test(str)) {
      sessionStorage.setItem(AGENDA_DATE_STORAGE_KEY, str);
    }
  } catch {}
}

/**
 * Obtém a data selecionada da agenda:
 * 1. Prioridade: stateDate (passado via location.state?.selectedDate ao fechar detalhes)
 * 2. Segunda prioridade: sessionStorage (salva ao navegar ou escolher dia)
 * 3. Fallback: hoje (fuso local)
 */
export function getStoredAgendaDate(stateDate?: unknown): Date {
  const parsedState = parseDateSafe(stateDate);
  if (parsedState) {
    saveAgendaSelectedDate(parsedState);
    return parsedState;
  }

  try {
    const stored = sessionStorage.getItem(AGENDA_DATE_STORAGE_KEY);
    const parsedStored = parseDateSafe(stored);
    if (parsedStored) {
      return parsedStored;
    }
  } catch {}

  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
