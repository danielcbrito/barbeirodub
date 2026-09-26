/**
 * ═══════════════════════════════════════════════════════════
 * BUSINESS HOURS — Resolução compartilhada de horário comercial
 * ═══════════════════════════════════════════════════════════
 *
 * DUPLICAÇÃO ELIMINADA: Esta função era copiada identicamente
 * em check-availability e validate-appointment.
 *
 * Hierarquia de prioridade:
 * 1. Exceção do barbeiro (horarios_excepcionais_barbeiro)
 * 2. Exceção global (horarios_excepcionais)
 * 3. Config do barbeiro (configuracoes_horario_barbeiro)
 * 4. Config global (configuracoes_horario)
 * 5. Fallback de emergência
 */

export interface BusinessHoursConfig {
  aberto: boolean;
  hora_abertura: string;
  hora_fechamento: string;
  hora_almoco_inicio: string | null;
  hora_almoco_fim: string | null;
  delay_entre_servicos: number;
  slot_interval_minutes: number;
}

/**
 * Resolve a configuração de horário para uma data/dia específico.
 * 
 * @param supabase - Cliente Supabase (service role)
 * @param date - Data no formato YYYY-MM-DD
 * @param dayOfWeek - Dia da semana (0=Dom, 6=Sáb)
 * @param barbeiroId - ID do barbeiro (obrigatório para isolamento multi-tenant)
 * @param logPrefix - Prefixo para logs (ex: '[check-availability]')
 */
export async function resolveBusinessHours(
  supabase: any,
  date: string,
  dayOfWeek: number,
  barbeiroId?: string,
  logPrefix = "[business-hours]",
  unidadeId?: string
): Promise<BusinessHoursConfig> {
  // Resolve slot_interval_minutes from the barbeiro's tenant (per-barbearia setting)
  let slotInterval = 5;
  if (barbeiroId) {
    const { data: bTenant } = await supabase
      .from("barbeiros")
      .select("tenant_id")
      .eq("id", barbeiroId)
      .maybeSingle();
    const tId = (bTenant as { tenant_id?: string } | null)?.tenant_id;
    if (tId) {
      const { data: tRow } = await supabase
        .from("tenants")
        .select("slot_interval_minutes")
        .eq("id", tId)
        .maybeSingle();
      const v = (tRow as { slot_interval_minutes?: number } | null)?.slot_interval_minutes;
      if (typeof v === "number" && v >= 1 && v <= 120) slotInterval = v;
    }
  }


  // 1. Exceção de horário do barbeiro para esta data
  if (barbeiroId) {
    const { data: barberExcecao } = await supabase
      .from("horarios_excepcionais_barbeiro")
      .select("*")
      .eq("barbeiro_id", barbeiroId)
      .eq("data", date)
      .maybeSingle();

    if (barberExcecao) {
      console.log(`${logPrefix} EXCEÇÃO DO BARBEIRO encontrada para ${date}`);
      return {
        aberto: barberExcecao.aberto ?? false,
        hora_abertura: barberExcecao.hora_abertura || "09:00",
        hora_fechamento: barberExcecao.hora_fechamento || "20:00",
        hora_almoco_inicio: barberExcecao.hora_almoco_inicio,
        hora_almoco_fim: barberExcecao.hora_almoco_fim,
        delay_entre_servicos: 10, slot_interval_minutes: slotInterval,
      };
    }
  }

  // 2. Exceção de horário por unidade OU global do MESMO tenant
  //    (antes usávamos unidade_id IS NULL como "global do sistema", o que vazava
  //     exceções entre barbearias diferentes. Agora escopamos por tenant_id.)
  let tenantId: string | null = null;
  if (barbeiroId) {
    const { data: barbRow } = await supabase
      .from("barbeiros")
      .select("tenant_id")
      .eq("id", barbeiroId)
      .maybeSingle();
    tenantId = (barbRow as { tenant_id?: string } | null)?.tenant_id ?? null;
  }

  let excecaoData: any = null;
  if (tenantId) {
    if (unidadeId) {
      const { data: unitExc } = await supabase
        .from("horarios_excepcionais")
        .select("*")
        .eq("data", date)
        .eq("tenant_id", tenantId)
        .eq("unidade_id", unidadeId)
        .maybeSingle();
      excecaoData = unitExc;
    }
    if (!excecaoData) {
      const { data: tenantGlobalExc } = await supabase
        .from("horarios_excepcionais")
        .select("*")
        .eq("data", date)
        .eq("tenant_id", tenantId)
        .is("unidade_id", null)
        .maybeSingle();
      excecaoData = tenantGlobalExc;
    }
  }

  if (excecaoData) {
    console.log(`${logPrefix} EXCEÇÃO GLOBAL/UNIDADE encontrada para ${date}`);
    return {
      aberto: excecaoData.aberto,
      hora_abertura: excecaoData.hora_abertura || "09:00",
      hora_fechamento: excecaoData.hora_fechamento || "20:00",
      hora_almoco_inicio: excecaoData.hora_almoco_inicio,
      hora_almoco_fim: excecaoData.hora_almoco_fim,
      delay_entre_servicos: 10, slot_interval_minutes: slotInterval,
    };
  }

  // 3. Configuração do barbeiro para este dia da semana
  if (barbeiroId) {
    const { data: barberConfig } = await supabase
      .from("configuracoes_horario_barbeiro")
      .select("*")
      .eq("barbeiro_id", barbeiroId)
      .eq("dia_semana", dayOfWeek)
      .maybeSingle();

    if (barberConfig) {
      console.log(`${logPrefix} CONFIG DO BARBEIRO encontrada para dia ${dayOfWeek}`);
      const daySlot = (barberConfig as { slot_interval_minutes?: number | null }).slot_interval_minutes;
      const effectiveSlot = (typeof daySlot === "number" && daySlot >= 1 && daySlot <= 120) ? daySlot : slotInterval;
      return {
        aberto: barberConfig.aberto ?? false,
        hora_abertura: barberConfig.hora_abertura || "09:00",
        hora_fechamento: barberConfig.hora_fechamento || "20:00",
        hora_almoco_inicio: barberConfig.hora_almoco_inicio,
        hora_almoco_fim: barberConfig.hora_almoco_fim,
        delay_entre_servicos: barberConfig.delay_entre_servicos || 10, slot_interval_minutes: effectiveSlot,
      };
    }
  }

  // 3.5 Configuração da BARBEARIA (unidade) — só vale quando o barbeiro
  //     ainda não tem configuração própria para aquele dia.
  if (tenantId) {
    let unitConfig: any = null;
    if (unidadeId) {
      const { data } = await supabase
        .from("configuracoes_horario_unidade")
        .select("*")
        .eq("unidade_id", unidadeId)
        .eq("dia_semana", dayOfWeek)
        .maybeSingle();
      unitConfig = data;
    }
    if (!unitConfig) {
      const { data } = await supabase
        .from("configuracoes_horario_unidade")
        .select("*")
        .eq("tenant_id", tenantId)
        .is("unidade_id", null)
        .eq("dia_semana", dayOfWeek)
        .maybeSingle();
      unitConfig = data;
    }
    if (unitConfig) {
      console.log(`${logPrefix} CONFIG DA UNIDADE encontrada para dia ${dayOfWeek}`);
      const daySlot = unitConfig.slot_interval_minutes;
      return {
        aberto: unitConfig.aberto ?? false,
        hora_abertura: unitConfig.hora_abertura || "09:00",
        hora_fechamento: unitConfig.hora_fechamento || "20:00",
        hora_almoco_inicio: unitConfig.hora_almoco_inicio,
        hora_almoco_fim: unitConfig.hora_almoco_fim,
        delay_entre_servicos: unitConfig.delay_entre_servicos || 10,
        slot_interval_minutes:
          typeof daySlot === "number" && daySlot >= 1 && daySlot <= 120 ? daySlot : slotInterval,
      };
    }
  }

  // 4. Configuração global do dia da semana

  const { data: configData } = await supabase
    .from("configuracoes_horario")
    .select("*")
    .eq("dia_semana", dayOfWeek)
    .maybeSingle();

  if (configData) {
    return {
      aberto: configData.aberto,
      hora_abertura: configData.hora_abertura,
      hora_fechamento: configData.hora_fechamento,
      hora_almoco_inicio: configData.hora_almoco_inicio,
      hora_almoco_fim: configData.hora_almoco_fim,
      delay_entre_servicos: configData.delay_entre_servicos || 10, slot_interval_minutes: slotInterval,
    };
  }

  // 5. Fallback de emergência
  console.warn(`${logPrefix} Nenhuma configuração encontrada. Usando fallback.`);
  return {
    aberto: dayOfWeek !== 0,
    hora_abertura: "09:00",
    hora_fechamento: "21:00",
    hora_almoco_inicio: "13:00",
    hora_almoco_fim: "14:00",
    delay_entre_servicos: 10, slot_interval_minutes: slotInterval,
  };
}

/* ─── Helpers de Tempo ─────────────────────────────────── */

export function timeToMinutes(timeStr: string): number {
  const parts = timeStr.split(":").map(Number);
  return parts[0] * 60 + parts[1];
}

export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}
