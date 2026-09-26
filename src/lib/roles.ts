/**
 * ═══════════════════════════════════════════════════════════
 * ROLES — Constantes tipadas para todo o sistema DUB
 * ═══════════════════════════════════════════════════════════
 *
 * REGRA: Nunca escreva 'admin', 'barbeiro', 'tenant_admin'
 *        diretamente no código. Sempre use estas constantes.
 *
 * CONTEXTO:
 *  - Roles globais vivem na tabela `user_roles`
 *  - Roles de unidade vivem na tabela `barbeiro_unidades`
 *  - "admin" em user_roles = DUB Admin (controle total)
 *  - "admin" em barbeiro_unidades = Admin de Unidade (escopo local)
 *    → futuramente será renomeado para 'unit_admin' via migration
 */

/* ─── Roles Globais (tabela user_roles) ────────────────── */

export const GLOBAL_ROLES = {
  /** Admin DUB — controle total do sistema */
  ADMIN: 'admin',
  /** Dono de barbearia — controle do seu tenant */
  TENANT_ADMIN: 'tenant_admin',
  /** Técnico de TI — monitoramento e suporte */
  TI: 'ti',
  /** Cliente final */
  CLIENTE: 'cliente',
  /** Barbeiro (role global, aliases: 'barber'/'barbeiro') */
  BARBER: 'barber',
} as const;

export type GlobalRole = (typeof GLOBAL_ROLES)[keyof typeof GLOBAL_ROLES];

/* ─── Roles de Unidade (tabela barbeiro_unidades) ──────── */

export const UNIT_ROLES = {
  /** Admin de uma unidade específica (escopo local) */
  UNIT_ADMIN: 'admin', // será renomeado para 'unit_admin' na Fase 5
  /** Barbeiro padrão vinculado à unidade */
  BARBER: 'barbeiro',
} as const;

export type UnitRole = (typeof UNIT_ROLES)[keyof typeof UNIT_ROLES];

/* ─── Helpers ──────────────────────────────────────────── */

/** Verifica se o role é de admin DUB (controle total) */
export function isDubAdmin(role: string | null | undefined): boolean {
  return role === GLOBAL_ROLES.ADMIN;
}

/** Verifica se o role é de dono de barbearia */
export function isTenantAdmin(role: string | null | undefined): boolean {
  return role === GLOBAL_ROLES.TENANT_ADMIN;
}

/** Verifica se é TI */
export function isTI(role: string | null | undefined): boolean {
  return role === GLOBAL_ROLES.TI;
}

/** Verifica se é barbeiro (aceita aliases 'barber' e 'barbeiro') */
export function isBarber(role: string | null | undefined): boolean {
  return role === GLOBAL_ROLES.BARBER || role === 'barbeiro';
}

/** Verifica se o role de unidade permite gerenciar a filial */
export function canManageUnit(unitRole: string | null | undefined): boolean {
  return unitRole === UNIT_ROLES.UNIT_ADMIN;
}

/** Mapa de redirecionamento após login, por role global */
export const ROLE_REDIRECTS: Record<string, string> = {
  [GLOBAL_ROLES.ADMIN]: '/admin',
  [GLOBAL_ROLES.TENANT_ADMIN]: '/minha-barbearia',
  [GLOBAL_ROLES.TI]: '/ti',
  [GLOBAL_ROLES.BARBER]: '/barbeiro',
  [GLOBAL_ROLES.CLIENTE]: '/cliente',
  barbeiro: '/barbeiro', // alias legado
} as const;
