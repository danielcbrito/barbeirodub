/**
 * ═══════════════════════════════════════════════════════════
 * AGENDA TYPES — Tipos compartilhados do sistema de agenda
 * ═══════════════════════════════════════════════════════════
 *
 * Fonte única de verdade para todas as interfaces
 * usadas nos componentes de agenda (admin, barbeiro, mobile).
 */

/* ─── Agendamento na Timeline ──────────────────────────── */

export interface TimelineAppointment {
  id: string;
  data: string;
  hora: string;
  status: string;
  preco: number;
  duracao: number;
  observacoes: string | null;
  barbeiro_confirmou: boolean | null;
  cliente_confirmou: boolean | null;
  ponto_liberado: boolean | null;
  user_id: string;
  servico_id: string;
  barbeiro_id?: string | null;
  is_free: boolean | null;
  payment_method: string | null;
  tipo_agendamento: string | null;
  profile: { nome: string; telefone?: string; cpf?: string } | null;
  servico: { nome: string; duracao_minutos: number } | null;
  pagamentos?: Array<{ metodo: string; status: string; valor: number }>;
}

/* ─── Configuração de Horário Comercial ────────────────── */

export interface BusinessHoursConfig {
  aberto: boolean;
  hora_abertura: string;
  hora_fechamento: string;
  hora_almoco_inicio: string | null;
  hora_almoco_fim: string | null;
  delay_entre_servicos: number;
}

/* ─── Views disponíveis ────────────────────────────────── */

export type AgendaView = "day" | "week" | "month";

/* ─── Modos de operação ────────────────────────────────── */

export type AgendaMode = "admin" | "barber" | "readonly";

/* ─── Config de status visual ──────────────────────────── */

export interface StatusColorConfig {
  bg: string;
  border: string;
  accent: string;
  statusBadge: string;
  statusLabel: string;
  lightBg: string;
}

/**
 * Retorna config visual para um status de agendamento.
 * Utilizado por todos os cards de timeline (admin, barber, mobile).
 */
export function getStatusColorConfig(
  status: string,
  barbeiroConfirmou: boolean | null
): StatusColorConfig {
  if (status === "completed") {
    return {
      bg: "bg-emerald-500/6",
      border: "dark:border-emerald-500/15 border-emerald-400/40",
      accent: "dark:border-l-emerald-500 border-l-emerald-500",
      statusBadge:
        "dark:bg-emerald-500/10 dark:text-emerald-400 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60",
      statusLabel: "CONCLUÍDO",
      lightBg: "dark:bg-transparent bg-emerald-50/50",
    };
  }
  if (status === "no_show") {
    return {
      bg: "bg-orange-500/6",
      border: "dark:border-orange-500/15 border-orange-400/40",
      accent: "dark:border-l-orange-500 border-l-orange-500",
      statusBadge:
        "dark:bg-orange-500/10 dark:text-orange-400 bg-orange-50 text-orange-700 ring-1 ring-orange-200/60",
      statusLabel: "NÃO VEIO",
      lightBg: "dark:bg-transparent bg-orange-50/50",
    };
  }
  if (status === "confirmed" || barbeiroConfirmou) {
    return {
      bg: "bg-blue-500/6",
      border: "dark:border-blue-500/15 border-blue-400/40",
      accent: "dark:border-l-blue-500 border-l-blue-500",
      statusBadge:
        "dark:bg-blue-500/10 dark:text-blue-400 bg-blue-50 text-blue-700 ring-1 ring-blue-200/60",
      statusLabel: "AGENDADO",
      lightBg: "dark:bg-transparent bg-blue-50/50",
    };
  }
  if (status === "pending") {
    return {
      bg: "bg-amber-500/6",
      border: "dark:border-amber-500/15 border-amber-400/40",
      accent: "dark:border-l-amber-500 border-l-amber-500",
      statusBadge:
        "dark:bg-amber-500/10 dark:text-amber-400 bg-amber-50 text-amber-700 ring-1 ring-amber-200/60",
      statusLabel: "PENDENTE",
      lightBg: "dark:bg-transparent bg-amber-50/50",
    };
  }
  if (status === "cancelled_by_user" || status === "cancelled_by_admin") {
    return {
      bg: "bg-red-500/6",
      border: "dark:border-red-500/15 border-red-400/40",
      accent: "dark:border-l-red-500 border-l-red-500",
      statusBadge:
        "dark:bg-red-500/10 dark:text-red-400 bg-red-50 text-red-700 ring-1 ring-red-200/60",
      statusLabel: "CANCELADO",
      lightBg: "dark:bg-transparent bg-red-50/50",
    };
  }
  // Default
  return {
    bg: "bg-muted/6",
    border: "border-border/30",
    accent: "border-l-muted-foreground",
    statusBadge: "bg-muted text-muted-foreground",
    statusLabel: status.toUpperCase(),
    lightBg: "bg-transparent",
  };
}

/* ─── Helpers de Tempo ─────────────────────────────────── */

/** Converte "HH:MM" para minutos desde meia-noite */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** Converte minutos desde meia-noite para "HH:MM" */
export function minutesToTime(totalMinutes: number): string {
  const hour = Math.floor(totalMinutes / 60);
  const min = totalMinutes % 60;
  return `${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
}

/** Gera array de slots de tempo entre abertura e fechamento */
export function generateTimeSlots(
  openTime: string,
  closeTime: string,
  intervalMinutes = 30
): string[] {
  const slots: string[] = [];
  const openMinutes = timeToMinutes(openTime);
  const closeMinutes = timeToMinutes(closeTime);

  for (let minutes = openMinutes; minutes <= closeMinutes; minutes += intervalMinutes) {
    slots.push(minutesToTime(minutes));
  }

  return slots;
}

/** Cor baseada no tipo de serviço */
export function getServiceColor(serviceName: string | undefined): string {
  if (!serviceName) return "bg-zinc-500";
  const name = serviceName.toLowerCase();
  if (name.includes("corte")) return "bg-sky-500";
  if (name.includes("barba")) return "bg-amber-500";
  if (name.includes("combo")) return "bg-violet-500";
  if (name.includes("sobrancelha")) return "bg-rose-500";
  return "bg-primary";
}
