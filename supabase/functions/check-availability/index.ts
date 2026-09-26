/**
 * CHECK-AVAILABILITY EDGE FUNCTION
 * 
 * FONTE ÚNICA DA VERDADE para disponibilidade de horários.
 * 
 * REFATORADO: Usa _shared/business-hours.ts e _shared/response.ts
 * eliminando duplicação de resolveBusinessHours e padrão CORS.
 * 
 * ISOLAMENTO MULTI-TENANT:
 * - barbeiro_id é OBRIGATÓRIO para garantir isolamento entre barbearias
 * 
 * REGRAS DE BLOQUEIO:
 * - pending, confirmed, completed → BLOQUEIA
 * - cancelled_by_user, cancelled_by_admin, no_show, excluido → LIBERA
 * - pending_bookings não expirados → BLOQUEIA
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
import { ok, fail, handleCors } from "../_shared/response.ts";
import {
  resolveBusinessHours,
  timeToMinutes,
  minutesToTime,
  type BusinessHoursConfig,
} from "../_shared/business-hours.ts";

const BLOCKING_STATUSES = ["pending", "confirmed", "completed"];
const LOG_PREFIX = "[check-availability]";

interface AvailabilityRequest {
  date: string;
  duration: number;
  excludeAppointmentId?: string;
  barbeiro_id?: string;
}

interface TimeSlot {
  time: string;
  available: boolean;
  blockedReason?: "occupied" | "minimum_advance" | "lunch" | "closed" | "overlap" | "delay_buffer";
}

interface OccupiedSlotInfo {
  hora: string;
  duracao: number;
  status: string;
  source: "agendamento" | "pending_booking";
  fim: string;
  fimComDelay: string;
}

interface AvailabilityResponse {
  date: string;
  slots: TimeSlot[];
  occupiedSlots: OccupiedSlotInfo[];
  businessHours?: BusinessHoursConfig;
  message?: string;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body: AvailabilityRequest = await req.json();
    const { date, duration, excludeAppointmentId, barbeiro_id } = body;

    console.log("=".repeat(70));
    console.log(`${LOG_PREFIX} Data: ${date} | Duração: ${duration}min | Barbeiro: ${barbeiro_id || "N/A"}`);

    if (!date || !duration || duration <= 0) {
      return fail("MISSING_FIELDS", "Data e duração são obrigatórios");
    }

    // ═══ ISOLAMENTO MULTI-TENANT ═══
    if (!barbeiro_id) {
      console.warn(`${LOG_PREFIX} ⚠️ barbeiro_id não fornecido`);
      return ok<AvailabilityResponse>({
        date,
        slots: [],
        occupiedSlots: [],
        message: "Selecione um profissional para ver os horários disponíveis",
      });
    }

    const dateObj = new Date(date + "T12:00:00");
    const dayOfWeek = dateObj.getDay();

    // Resolver unidade do barbeiro (para exceções por unidade)
    const { data: barberRow } = await supabase
      .from("barbeiros")
      .select("unidade_id")
      .eq("id", barbeiro_id)
      .maybeSingle();
    const unidadeId = barberRow?.unidade_id ?? undefined;

    // Resolver config com helper compartilhado
    const config = await resolveBusinessHours(supabase, date, dayOfWeek, barbeiro_id, LOG_PREFIX, unidadeId);

    console.log(`${LOG_PREFIX} Horário: ${config.hora_abertura} - ${config.hora_fechamento}`);

    if (!config.aberto) {
      return ok<AvailabilityResponse>({
        date,
        slots: [],
        occupiedSlots: [],
        businessHours: config,
        message: "Fechado neste dia",
      });
    }

    const OPEN_MINUTES = timeToMinutes(config.hora_abertura || "09:00");
    const CLOSE_MINUTES = timeToMinutes(config.hora_fechamento || "20:00");
    const lunchStart = config.hora_almoco_inicio?.trim() || null;
    const lunchEnd = config.hora_almoco_fim?.trim() || null;
    const LUNCH_START = lunchStart ? timeToMinutes(lunchStart) : null;
    const LUNCH_END = lunchEnd ? timeToMinutes(lunchEnd) : null;
    const DELAY_MINUTES = config.delay_entre_servicos || 10;

    // ═══ Buscar agendamentos (filtrado por barbeiro_id) ═══
    let appointmentsQuery = supabase
      .from("agendamentos")
      .select("id, hora, duracao, status")
      .eq("data", date)
      .eq("barbeiro_id", barbeiro_id)
      .in("status", BLOCKING_STATUSES);

    if (excludeAppointmentId) {
      appointmentsQuery = appointmentsQuery.neq("id", excludeAppointmentId);
    }

    const { data: appointments, error: aptError } = await appointmentsQuery;

    if (aptError) {
      console.error(`${LOG_PREFIX} ERRO agendamentos:`, aptError);
      return fail("DB_ERROR", "Erro ao verificar disponibilidade", 500);
    }

    // ═══ Buscar pending bookings (filtrado por barbeiro_id) ═══
    const now = new Date();
    const { data: pendingBookings } = await supabase
      .from("pending_bookings")
      .select("id, hora, duracao, expires_at")
      .eq("data", date)
      .eq("barbeiro_id", barbeiro_id)
      .gt("expires_at", now.toISOString());

    console.log(`${LOG_PREFIX} Agendamentos: ${appointments?.length || 0} | Pending: ${pendingBookings?.length || 0}`);

    // ═══ Processar slots ocupados ═══
    const occupiedSlots: OccupiedSlotInfo[] = [];

    for (const apt of appointments || []) {
      const startMinutes = timeToMinutes(apt.hora);
      const endMinutes = startMinutes + apt.duracao;
      occupiedSlots.push({
        hora: apt.hora,
        duracao: apt.duracao,
        status: apt.status,
        source: "agendamento",
        fim: minutesToTime(endMinutes),
        fimComDelay: minutesToTime(endMinutes + DELAY_MINUTES),
      });
    }

    for (const pb of pendingBookings || []) {
      const startMinutes = timeToMinutes(pb.hora);
      const endMinutes = startMinutes + pb.duracao;
      occupiedSlots.push({
        hora: pb.hora,
        duracao: pb.duracao,
        status: "pending_booking",
        source: "pending_booking",
        fim: minutesToTime(endMinutes),
        fimComDelay: minutesToTime(endMinutes + DELAY_MINUTES),
      });
    }

    // ═══ Calcular horário mínimo (Brasília UTC-3) ═══
    const nowBrazil = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const todayBrazil = nowBrazil.toISOString().split("T")[0];
    const isToday = date === todayBrazil;
    const currentMinutesBrazil = nowBrazil.getUTCHours() * 60 + nowBrazil.getUTCMinutes();
    const minimumAdvanceMinutes = isToday ? currentMinutesBrazil + 30 : 0;

    // ═══ Gerar slots com intervalo configurável (por barbearia) ═══
    const slots: TimeSlot[] = [];
    const SLOT_INTERVAL = Math.max(1, Math.min(120, config.slot_interval_minutes || 5));

    for (let slotStart = OPEN_MINUTES; slotStart < CLOSE_MINUTES; slotStart += SLOT_INTERVAL) {
      const timeStr = minutesToTime(slotStart);
      const slotEnd = slotStart + duration;

      if (slotEnd > CLOSE_MINUTES) continue;

      // Verificar almoço
      if (LUNCH_START !== null && LUNCH_END !== null) {
        if (slotStart >= LUNCH_START && slotStart < LUNCH_END) continue;
        if (slotEnd > LUNCH_START && slotEnd <= LUNCH_END) continue;
        if (slotStart < LUNCH_START && slotEnd > LUNCH_END) continue;
      }

      // Antecedência mínima
      if (isToday && slotStart < minimumAdvanceMinutes) {
        slots.push({ time: timeStr, available: false, blockedReason: "minimum_advance" });
        continue;
      }

      // Verificar conflitos
      let isBlocked = false;
      for (const occupied of occupiedSlots) {
        const occStart = timeToMinutes(occupied.hora);
        const occEndWithDelay = occStart + occupied.duracao + DELAY_MINUTES;
        if (slotStart < occEndWithDelay && slotEnd > occStart) {
          isBlocked = true;
          break;
        }
      }

      slots.push(
        isBlocked
          ? { time: timeStr, available: false, blockedReason: "occupied" }
          : { time: timeStr, available: true }
      );
    }

    const availableCount = slots.filter((s) => s.available).length;
    console.log(`${LOG_PREFIX} RESULTADO: ${slots.length} slots | ${availableCount} disponíveis`);

    return ok<AvailabilityResponse>({
      date,
      slots,
      occupiedSlots,
      businessHours: config,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} ERRO GERAL:`, error);
    return fail(
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "Erro interno",
      500
    );
  }
});
