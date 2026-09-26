/**
 * ═══════════════════════════════════════════════════════════
 * WALK-IN / WHATSAPP NAME HELPERS
 * ═══════════════════════════════════════════════════════════
 *
 * Quando um barbeiro cria um encaixe manual para um cliente
 * que não possui cadastro (walk-in), o agendamento é registrado
 * com `user_id = barbeiro logado` e o nome real do cliente fica
 * persistido em `observacoes` no formato:
 *
 *   🚶 Cliente walk-in: <nome>
 *
 * Quando um agendamento vem pelo WhatsApp, o campo `observacoes`
 * é preenchido no formato:
 *
 *   WhatsApp | Cliente: <nome>
 *
 * Estes helpers extraem esses nomes para que a UI exiba o nome
 * real do cliente mesmo sem cadastro no app, e identifiquem a
 * origem do agendamento.
 *
 * Funciona retroativamente para encaixes antigos.
 */
const WALK_IN_REGEX = /🚶\s*Cliente walk-in:\s*(.+?)(?:\n|$)/i;
const WHATSAPP_REGEX = /^WhatsApp\s*\|\s*Cliente:\s*(.+?)(?:\n|$)/i;

export function extractWalkInName(observacoes?: string | null): string | null {
  if (!observacoes) return null;
  const match = observacoes.match(WALK_IN_REGEX);
  return match?.[1]?.trim() || null;
}

export function isWhatsAppAppointment(observacoes?: string | null): boolean {
  if (!observacoes) return false;
  return WHATSAPP_REGEX.test(observacoes);
}

export function extractWhatsAppName(observacoes?: string | null): string | null {
  if (!observacoes) return null;
  const match = observacoes.match(WHATSAPP_REGEX);
  return match?.[1]?.trim() || null;
}

/**
 * Resolve o nome do cliente para exibição na agenda.
 * Prioridade: WhatsApp > walk-in > perfil do app > fallback.
 */
export function resolveClienteDisplayName(
  observacoes: string | null | undefined,
  profileNome: string | null | undefined,
  fallback = "Cliente"
): string {
  return (
    extractWhatsAppName(observacoes) ||
    extractWalkInName(observacoes) ||
    profileNome?.trim() ||
    fallback
  );
}
