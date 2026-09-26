/**
 * ═══════════════════════════════════════════════════════════
 * CONSTANTS — Valores centralizados do sistema DUB
 * ═══════════════════════════════════════════════════════════
 *
 * REGRA: Nenhuma magic string inline no código.
 *        Se aparece mais de 1 vez → vem pra cá.
 */

/* ─── Status de Agendamento ────────────────────────────── */

export const APPOINTMENT_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  COMPLETED: 'completed',
  CANCELLED_BY_USER: 'cancelled_by_user',
  CANCELLED_BY_ADMIN: 'cancelled_by_admin',
} as const;

export type AppointmentStatus =
  (typeof APPOINTMENT_STATUS)[keyof typeof APPOINTMENT_STATUS];

/** Labels legíveis para cada status de agendamento */
export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  [APPOINTMENT_STATUS.PENDING]: 'Pendente',
  [APPOINTMENT_STATUS.CONFIRMED]: 'Confirmado',
  [APPOINTMENT_STATUS.COMPLETED]: 'Concluído',
  [APPOINTMENT_STATUS.CANCELLED_BY_USER]: 'Cancelado',
  [APPOINTMENT_STATUS.CANCELLED_BY_ADMIN]: 'Cancelado (Admin)',
};

/** Cores CSS para badges de status */
export const APPOINTMENT_STATUS_COLORS: Record<AppointmentStatus, string> = {
  [APPOINTMENT_STATUS.PENDING]: 'bg-yellow-500/20 text-yellow-500',
  [APPOINTMENT_STATUS.CONFIRMED]: 'bg-green-500/20 text-green-500',
  [APPOINTMENT_STATUS.COMPLETED]: 'bg-blue-500/20 text-blue-500',
  [APPOINTMENT_STATUS.CANCELLED_BY_USER]: 'bg-red-500/20 text-red-500',
  [APPOINTMENT_STATUS.CANCELLED_BY_ADMIN]: 'bg-red-500/20 text-red-500',
};

/* ─── Status de Assinatura ─────────────────────────────── */

export const SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  TRIALING: 'trialing',
  SUSPENDED: 'suspended',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  PAST_DUE: 'past_due',
  PENDING_CASH: 'pending_cash',
  PENDING_RENEWAL: 'pending_renewal',
} as const;

export type SubscriptionStatus =
  (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS];

/* ─── Métodos de Pagamento ─────────────────────────────── */

export const PAYMENT_METHODS = {
  PIX: 'pix',
  CREDIT_CARD: 'credit_card',
  DEBIT_CARD: 'debit_card',
  CASH: 'cash',
  CREDIT: 'credit',       // crédito da carteira
  PLAN: 'plano',           // uso de plano/assinatura
  REDEMPTION: 'resgate',   // corte grátis por fidelidade
} as const;

export type PaymentMethod =
  (typeof PAYMENT_METHODS)[keyof typeof PAYMENT_METHODS];

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  [PAYMENT_METHODS.PIX]: 'PIX',
  [PAYMENT_METHODS.CREDIT_CARD]: 'Cartão de Crédito',
  [PAYMENT_METHODS.DEBIT_CARD]: 'Cartão de Débito',
  [PAYMENT_METHODS.CASH]: 'Dinheiro',
  [PAYMENT_METHODS.CREDIT]: 'Crédito',
  [PAYMENT_METHODS.PLAN]: 'Plano',
  [PAYMENT_METHODS.REDEMPTION]: 'Resgate',
};

/* ─── Status de Pagamento ──────────────────────────────── */

export const PAYMENT_STATUS = {
  PAID: 'paid',
  PENDING: 'pending',
  FAILED: 'failed',
} as const;

/* ─── Dias da Semana (pt-BR) ───────────────────────────── */

export const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

export const WEEKDAYS_LONG = [
  'Domingo', 'Segunda-feira', 'Terça-feira',
  'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado',
] as const;

/* ─── Manutenção ───────────────────────────────────────── */

export const MAINTENANCE_AUDIENCE = {
  CLIENT: 'cliente',
  BARBER: 'barbeiro',
  BOTH: 'ambos',
} as const;

export type MaintenanceAudience =
  (typeof MAINTENANCE_AUDIENCE)[keyof typeof MAINTENANCE_AUDIENCE];

/* ─── Configurações Padrão ─────────────────────────────── */

export const DEFAULTS = {
  /** Minutos de buffer entre serviços */
  SERVICE_BUFFER_MINUTES: 10,
  /** Horário de abertura padrão */
  OPENING_TIME: '09:00',
  /** Horário de fechamento padrão */
  CLOSING_TIME: '18:00',
  /** Duração padrão de serviço em minutos */
  SERVICE_DURATION: 30,
  /** StaleTime padrão do React Query (30s) */
  QUERY_STALE_TIME: 30_000,
  /** StaleTime para dados que mudam raramente (5min) */
  QUERY_STALE_TIME_SLOW: 5 * 60 * 1000,
  /** Limite de saques por dia */
  MAX_WITHDRAWALS_PER_DAY: 3,
  /** Valor mínimo de saque */
  MIN_WITHDRAWAL_AMOUNT: 1.00,
} as const;

/* ─── URLs e Endpoints ─────────────────────────────────── */

export const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'djtpzvujzmrrslirzwun';

export const PRODUCTION_URL = 'https://dubadmin.lovable.app';
