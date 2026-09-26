/**
 * VALIDATE-APPOINTMENT — Validação atômica de disponibilidade
 * 
 * REFATORADO: Usa _shared/business-hours.ts e _shared/response.ts
 * eliminando duplicação de resolveBusinessHours.
 * 
 * ISOLAMENTO MULTI-TENANT:
 * - barbeiro_id obrigatório (exceto com skipValidation)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
import { ok, fail, handleCors } from "../_shared/response.ts";
import {
  resolveBusinessHours,
  timeToMinutes,
} from "../_shared/business-hours.ts";

const LOG_PREFIX = "[validate-appointment]";

interface AppointmentRequest {
  data: string;
  hora: string;
  duracao: number;
  userId: string;
  excludeAppointmentId?: string;
  barbeiro_id?: string;
  barberId?: string;
  skipValidation?: boolean;
}

interface ValidationResult {
  valid: boolean;
  message: string;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body: AppointmentRequest = await req.json();
    const { data, hora, duracao, userId, excludeAppointmentId, barbeiro_id, barberId, skipValidation } = body;
    const resolvedBarberId = barbeiro_id ?? barberId;

    console.log(`${LOG_PREFIX} Validando:`, { data, hora, duracao, barberId: resolvedBarberId, skipValidation });

    // ═══ ISOLAMENTO MULTI-TENANT ═══
    if (!resolvedBarberId && !skipValidation) {
      console.warn(`${LOG_PREFIX} ⚠️ barbeiro_id não fornecido`);
      return ok<ValidationResult>({
        valid: false,
        message: "Profissional é obrigatório para validar o horário.",
      });
    }

    const appointmentDate = new Date(data + "T12:00:00");
    const dayOfWeek = appointmentDate.getDay();

    // Resolver unidade do barbeiro (para exceções por unidade)
    let unidadeId: string | undefined;
    if (resolvedBarberId) {
      const { data: barberRow } = await supabase
        .from("barbeiros")
        .select("unidade_id")
        .eq("id", resolvedBarberId)
        .maybeSingle();
      unidadeId = barberRow?.unidade_id ?? undefined;
    }

    // Resolver config com helper compartilhado
    const config = await resolveBusinessHours(supabase, data, dayOfWeek, resolvedBarberId, LOG_PREFIX, unidadeId);

    console.log(`${LOG_PREFIX} Config resolvida para dia ${dayOfWeek}:`, JSON.stringify(config));

    // ═══ Verificar se dia está aberto ═══
    if (!config.aberto && !skipValidation) {
      return ok<ValidationResult>({
        valid: false,
        message: "A barbearia não funciona neste dia.",
      });
    }

    const [startHour, startMinute] = hora.split(":").map(Number);
    const startTimeInMinutes = startHour * 60 + startMinute;
    const endTimeInMinutes = startTimeInMinutes + duracao;

    const OPEN_MINUTES = timeToMinutes(config.hora_abertura);
    const CLOSE_MINUTES = timeToMinutes(config.hora_fechamento);
    const lunchStart = config.hora_almoco_inicio?.trim() || null;
    const lunchEnd = config.hora_almoco_fim?.trim() || null;
    const LUNCH_START = lunchStart ? timeToMinutes(lunchStart) : null;
    const LUNCH_END = lunchEnd ? timeToMinutes(lunchEnd) : null;

    // ═══ Verificar horário de almoço ═══
    if (!skipValidation && LUNCH_START !== null && LUNCH_END !== null) {
      if (
        (startTimeInMinutes >= LUNCH_START && startTimeInMinutes < LUNCH_END) ||
        (endTimeInMinutes > LUNCH_START && endTimeInMinutes <= LUNCH_END) ||
        (startTimeInMinutes < LUNCH_START && endTimeInMinutes > LUNCH_END)
      ) {
        return ok<ValidationResult>({
          valid: false,
          message: `Horário indisponível. A barbearia está fechada para almoço entre ${config.hora_almoco_inicio} e ${config.hora_almoco_fim}.`,
        });
      }
    }

    // ═══ Verificar expediente ═══
    if (!skipValidation && (startTimeInMinutes < OPEN_MINUTES || endTimeInMinutes > CLOSE_MINUTES)) {
      return ok<ValidationResult>({
        valid: false,
        message: `Horário fora do expediente. Funcionamento: ${config.hora_abertura} às ${config.hora_fechamento}.`,
      });
    }

    // ═══ Encaixe manual: barbeiro tem liberdade total ═══
    if (skipValidation) {
      console.log(`${LOG_PREFIX} skipValidation=true → encaixe manual, pulando verificação de conflitos`);
      return ok<ValidationResult>({ valid: true, message: "Horário disponível (encaixe manual)" });
    }

    // ═══ Verificar conflitos de agendamentos ═══
    let agendamentosQuery = supabase
      .from("agendamentos")
      .select("id, hora, duracao, status")
      .eq("data", data)
      .in("status", ["pending", "confirmed", "completed"]);

    if (resolvedBarberId) {
      agendamentosQuery = agendamentosQuery.eq("barbeiro_id", resolvedBarberId);
    }

    if (excludeAppointmentId) {
      agendamentosQuery = agendamentosQuery.neq("id", excludeAppointmentId);
    }

    const { data: existingAppointments, error: aptError } = await agendamentosQuery;

    if (aptError) {
      console.error(`${LOG_PREFIX} Erro ao buscar agendamentos:`, aptError);
      return fail("DB_ERROR", "Erro ao verificar disponibilidade", 500);
    }

    const DELAY_MINUTES = config.delay_entre_servicos;

    for (const apt of existingAppointments || []) {
      const [aptHour, aptMinute] = apt.hora.split(":").map(Number);
      const aptStart = aptHour * 60 + aptMinute;
      const aptEnd = aptStart + apt.duracao;
      const aptEndWithDelay = aptEnd + DELAY_MINUTES;

      if (startTimeInMinutes < aptEndWithDelay && endTimeInMinutes > aptStart) {
        console.log(`${LOG_PREFIX} CONFLITO com agendamento:`, {
          requestedTime: hora,
          conflictingTime: apt.hora,
          aptId: apt.id,
        });
        return ok<ValidationResult>({
          valid: false,
          message: "Horário indisponível. Já existe um agendamento nesse período.",
        });
      }
    }

    // ═══ Verificar pending bookings ═══
    let pendingQuery = supabase
      .from("pending_bookings")
      .select("id, hora, duracao, expires_at")
      .eq("data", data)
      .gt("expires_at", new Date().toISOString());

    if (resolvedBarberId) {
      pendingQuery = pendingQuery.eq("barbeiro_id", resolvedBarberId);
    }

    const { data: pendingBookings } = await pendingQuery;

    for (const pending of pendingBookings || []) {
      const [pendingHour, pendingMinute] = pending.hora.split(":").map(Number);
      const pendingStart = pendingHour * 60 + pendingMinute;
      const pendingEnd = pendingStart + pending.duracao;
      const pendingEndWithDelay = pendingEnd + DELAY_MINUTES;

      if (startTimeInMinutes < pendingEndWithDelay && endTimeInMinutes > pendingStart) {
        console.log(`${LOG_PREFIX} CONFLITO com pending_booking:`, {
          requestedTime: hora,
          conflictingTime: pending.hora,
          pendingId: pending.id,
        });
        return ok<ValidationResult>({
          valid: false,
          message: "Horário temporariamente reservado. Tente outro horário ou aguarde alguns minutos.",
        });
      }
    }
    console.log(`${LOG_PREFIX} Horário DISPONÍVEL:`, { data, hora, duracao });
    return ok<ValidationResult>({ valid: true, message: "Horário disponível" });
  } catch (error) {
    console.error(`${LOG_PREFIX} Erro:`, error);
    return fail(
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "Erro interno",
      500
    );
  }
});
