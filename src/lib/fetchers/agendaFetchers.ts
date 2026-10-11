/**
 * ═══════════════════════════════════════════════════════════
 * FETCHER DE AGENDA — Função reutilizável para busca de
 * agendamentos do dia com dados enriquecidos.
 * ═══════════════════════════════════════════════════════════
 *
 * Extraída do useBarberAgenda para permitir reutilização
 * em prefetch (login) e no hook de query.
 */

import { supabase } from "@/integrations/supabase/client";
import type { TimelineAppointment } from "@/hooks/useBarberAgenda";
import { extractWalkInName, extractWhatsAppName } from "@/lib/walkInName";

/**
 * Busca agendamentos enriquecidos de um barbeiro para uma data específica.
 * Usa batch fetching (4 queries em vez de 1 + 3N).
 */
/**
 * Busca agendamentos enriquecidos usando o RPC bundle
 * `get_barber_agenda_bundle` (1 chamada única, tudo pronto).
 * Fallback silencioso para o batch original se RPC falhar.
 */
export async function fetchAgendaDia(
  barbeiroId: string,
  dateStr: string
): Promise<TimelineAppointment[]> {
  const { data, error } = await supabase.rpc("get_barber_agenda_bundle", {
    p_barbeiro_id: barbeiroId,
    p_data: dateStr,
  });

  if (error) {
    console.warn("[agendaFetchers] bundle falhou, usando fallback:", error);
    return fetchAgendaDiaFallback(barbeiroId, dateStr);
  }

  const bundle = data as { appointments?: any[] } | null;
  const raw = bundle?.appointments || [];

  return raw.filter(Boolean).map((apt: any): TimelineAppointment => {
    const walkInName = extractWalkInName(apt.observacoes);
    const whatsAppName = extractWhatsAppName(apt.observacoes);
    const displayName = whatsAppName || walkInName || apt.profile?.nome || null;
    return {
      id: apt.id,
      data: apt.data || dateStr,
      hora: apt.hora || "00:00",
      duracao: apt.duracao,
      status: apt.status || "pending",
      preco: typeof apt.preco === "number" && !isNaN(apt.preco) ? apt.preco : 0,
      observacoes: apt.observacoes,
      barbeiro_confirmou: apt.barbeiro_confirmou,
      cliente_confirmou: apt.cliente_confirmou,
      ponto_liberado: apt.ponto_liberado,
      user_id: apt.user_id,
      servico_id: apt.servico_id,
      barbeiro_id: apt.barbeiro_id,
      is_free: Boolean(apt.is_free),
      payment_method: apt.payment_method,
      tipo_agendamento: apt.tipo_agendamento,
      remarcacao_solicitada: apt.remarcacao_solicitada,
      motivo_remarcacao: apt.motivo_remarcacao,
      profile: displayName
        ? { nome: displayName, cpf: apt.profile?.cpf || undefined }
        : apt.profile
        ? { nome: apt.profile.nome, cpf: apt.profile.cpf }
        : null,
      servico: apt.servico
        ? { nome: apt.servico.nome, duracao_minutos: apt.servico.duracao_minutos }
        : null,
      pagamentos: apt.pagamentos || [],
    };
  });
}

/** Fallback: batch fetching original — usado se o RPC bundle não estiver disponível. */
async function fetchAgendaDiaFallback(
  barbeiroId: string,
  dateStr: string
): Promise<TimelineAppointment[]> {
  const { data: rawApts, error } = await supabase
    .from("agendamentos")
    .select(
      "id, data, hora, duracao, status, preco, observacoes, barbeiro_confirmou, cliente_confirmou, ponto_liberado, user_id, servico_id, barbeiro_id, is_free, payment_method, tipo_agendamento, remarcacao_solicitada, motivo_remarcacao"
    )
    .eq("barbeiro_id", barbeiroId)
    .eq("data", dateStr)
    .in("status", ["pending", "confirmed", "completed", "no_show"])
    .order("hora", { ascending: true });

  if (error) throw error;
  const agendamentos = rawApts || [];
  if (!agendamentos.length) return [];

  const userIds = [...new Set(agendamentos.map((a) => a.user_id))];
  const servicoIds = [...new Set(agendamentos.map((a) => a.servico_id))];
  const aptIds = agendamentos.map((a) => a.id);

  const [profilesRes, servicosRes, pagamentosRes] = await Promise.all([
    supabase.from("profiles").select("id, nome, cpf").in("id", userIds),
    supabase.from("servicos").select("id, nome, duracao_minutos").in("id", servicoIds),
    supabase
      .from("pagamentos")
      .select("agendamento_id, metodo, status, valor")
      .in("agendamento_id", aptIds),
  ]);

  const profilesMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p]));
  const servicosMap = new Map((servicosRes.data || []).map((s: any) => [s.id, s]));
  const pagamentosMap = new Map<string, Array<{ metodo: string; status: string; valor: number }>>();
  for (const p of (pagamentosRes.data || []) as any[]) {
    const key = p.agendamento_id as string;
    const arr = pagamentosMap.get(key) || [];
    arr.push({ metodo: p.metodo, status: p.status, valor: p.valor });
    pagamentosMap.set(key, arr);
  }

  return agendamentos.filter(Boolean).map((apt): TimelineAppointment => {
    const profile = profilesMap.get(apt.user_id) as any;
    const servico = servicosMap.get(apt.servico_id) as any;
    const walkInName = extractWalkInName(apt.observacoes);
    const whatsAppName = extractWhatsAppName(apt.observacoes);
    const displayName = whatsAppName || walkInName || profile?.nome || null;
    return {
      id: apt.id,
      data: apt.data || dateStr,
      hora: apt.hora || "00:00",
      duracao: apt.duracao,
      status: apt.status || "pending",
      preco: typeof apt.preco === "number" && !isNaN(apt.preco) ? apt.preco : 0,
      observacoes: apt.observacoes,
      barbeiro_confirmou: apt.barbeiro_confirmou,
      cliente_confirmou: apt.cliente_confirmou,
      ponto_liberado: apt.ponto_liberado,
      user_id: apt.user_id,
      servico_id: apt.servico_id,
      barbeiro_id: apt.barbeiro_id,
      is_free: Boolean(apt.is_free),
      payment_method: apt.payment_method,
      tipo_agendamento: apt.tipo_agendamento,
      remarcacao_solicitada: apt.remarcacao_solicitada,
      motivo_remarcacao: apt.motivo_remarcacao,
      profile: displayName
        ? { nome: displayName, cpf: profile?.cpf || undefined }
        : profile
        ? { nome: profile.nome, cpf: profile.cpf }
        : null,
      servico: servico
        ? { nome: servico.nome, duracao_minutos: servico.duracao_minutos }
        : null,
      pagamentos: pagamentosMap.get(apt.id) || [],
    };
  });
}
