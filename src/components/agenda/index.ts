/**
 * ═══════════════════════════════════════════════════════════
 * Agenda — Exportações públicas do módulo
 * ═══════════════════════════════════════════════════════════
 */

export { AgendaProvider, useAgenda } from "./AgendaContext";
export type {
  TimelineAppointment,
  BusinessHoursConfig,
  AgendaView,
  AgendaMode,
  StatusColorConfig,
} from "./types";
export {
  getStatusColorConfig,
  timeToMinutes,
  minutesToTime,
  generateTimeSlots,
  getServiceColor,
} from "./types";
