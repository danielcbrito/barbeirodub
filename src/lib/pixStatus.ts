/**
 * Helpers de status de cobranças PIX.
 *
 * Distinção crítica:
 * - PAGO               → confirmação financeira forte (webhook/OCR/admin). Uso interno/auditoria.
 * - PROVAVELMENTE_PAGO → confirmação operacional (heurística). Libera fluxo p/ usuário.
 *
 * Regra global: NENHUMA tela deve comparar status por string.
 * Sempre usar os helpers (isOperationallyPaid, isFinanciallyPaid, getPixStatusLabel).
 */

// ─── Constantes padronizadas ─────────────────────────────────
export const PIX_STATUS = {
  PENDENTE: "pending",
  EM_VERIFICACAO: "em_verificacao",
  PROVAVELMENTE_PAGO: "provavelmente_pago",
  PAGO: "paid",
  EXPIRADO: "expired",
  CANCELADO: "cancelled",
} as const;

export type PixChargeStatus = (typeof PIX_STATUS)[keyof typeof PIX_STATUS];

/** Status que liberam o fluxo operacional (agendamento, UI de sucesso). */
export const OPERATIONALLY_PAID_STATUSES: PixChargeStatus[] = [
  PIX_STATUS.PROVAVELMENTE_PAGO,
  PIX_STATUS.PAGO,
];

/** Status com confirmação financeira forte (uso interno/auditoria). */
export const FINANCIALLY_PAID_STATUSES: PixChargeStatus[] = [PIX_STATUS.PAGO];

/** True quando devemos liberar o fluxo do usuário (cliente e barbeiro). */
export function isOperationallyPaid(status?: string | null): boolean {
  return !!status && OPERATIONALLY_PAID_STATUSES.includes(status as PixChargeStatus);
}

/** True apenas com evidência financeira forte. Use para conciliação/relatórios. */
export function isFinanciallyPaid(status?: string | null): boolean {
  return !!status && FINANCIALLY_PAID_STATUSES.includes(status as PixChargeStatus);
}

/** True para estados ainda em andamento (não finalizados nem confirmados). */
export function isPixInProgress(status?: string | null): boolean {
  return (
    status === PIX_STATUS.PENDENTE ||
    status === PIX_STATUS.EM_VERIFICACAO
  );
}

/** True para estados terminais sem pagamento. */
export function isPixFailed(status?: string | null): boolean {
  return status === PIX_STATUS.EXPIRADO || status === PIX_STATUS.CANCELADO;
}

/** Rótulo amigável para o usuário final (cliente e barbeiro). UX unificada. */
export function getPixStatusLabel(status?: string | null): string {
  switch (status) {
    case PIX_STATUS.PAGO:
    case PIX_STATUS.PROVAVELMENTE_PAGO:
      return "Pagamento confirmado";
    case PIX_STATUS.EM_VERIFICACAO:
      return "Verificando pagamento";
    case PIX_STATUS.PENDENTE:
      return "Aguardando pagamento";
    case PIX_STATUS.EXPIRADO:
      return "Cobrança expirada";
    case PIX_STATUS.CANCELADO:
      return "Cobrança cancelada";
    default:
      return "Status desconhecido";
  }
}

/** Rótulo técnico para painéis internos/auditoria (preserva distinção). */
export function getPixStatusInternalLabel(status?: string | null): string {
  switch (status) {
    case PIX_STATUS.PAGO:
      return "Pago (confirmado)";
    case PIX_STATUS.PROVAVELMENTE_PAGO:
      return "Provavelmente pago (heurística)";
    case PIX_STATUS.EM_VERIFICACAO:
      return "Em verificação";
    case PIX_STATUS.PENDENTE:
      return "Pendente";
    case PIX_STATUS.EXPIRADO:
      return "Expirado";
    case PIX_STATUS.CANCELADO:
      return "Cancelado";
    default:
      return status ?? "—";
  }
}

/** Classifica nível de confiança (confidence_score 0–100). */
export function getConfidenceLevel(score?: number | null): "alta" | "media" | "baixa" | "indefinida" {
  if (score == null) return "indefinida";
  if (score >= 75) return "alta";
  if (score >= 40) return "media";
  return "baixa";
}
