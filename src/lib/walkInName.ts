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

const SYSTEM_PLACEHOLDERS = new Set([
  "barbearia dub",
  "barbearia"
]);

const KNOWN_BARBER_NAMES = new Set([
  "tulio",
  "jose jailson moreira dos santos junior",
  "barbeiro vip",
  "barbeiro teste",
  "danielbrito.emp"
]);

export function isBarberOrSystemName(name?: string | null, barberApelido?: string | null): boolean {
  if (!name) return false;
  const normalized = name.trim().toLowerCase();
  if (!normalized) return false;
  if (SYSTEM_PLACEHOLDERS.has(normalized)) return true;
  if (KNOWN_BARBER_NAMES.has(normalized)) return true;
  if (barberApelido && normalized === barberApelido.trim().toLowerCase()) return true;
  return false;
}

/**
 * Resolve o nome do cliente para exibição na agenda.
 * Prioridade: cliente_nome direto > WhatsApp > walk-in > perfil do app > fallback.
 * O nome inserido pelo barbeiro para o cliente é SEMPRE respeitado.
 */
export function resolveClienteDisplayName(
  observacoes: string | null | undefined,
  profileNome: string | null | undefined,
  fallback = "Cliente",
  clienteNome?: string | null | undefined,
  barberApelido?: string | null | undefined
): string {
  // 1. Prioridade máxima: cliente_nome explicitamente salvo no agendamento
  const direct = clienteNome?.trim();
  if (direct && !SYSTEM_PLACEHOLDERS.has(direct.toLowerCase())) return direct;

  // 2. Extração de WhatsApp nas observações
  const wa = extractWhatsAppName(observacoes);
  if (wa && !SYSTEM_PLACEHOLDERS.has(wa.toLowerCase())) return wa;

  // 3. Extração de walk-in manual nas observações
  const walkIn = extractWalkInName(observacoes);
  if (walkIn && !SYSTEM_PLACEHOLDERS.has(walkIn.toLowerCase())) return walkIn;

  // 4. Perfil associado ao agendamento (somente usado se não for a conta do próprio barbeiro nem barbearia)
  const profile = profileNome?.trim();
  if (profile && !isBarberOrSystemName(profile, barberApelido)) return profile;

  return fallback;
}


