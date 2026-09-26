/**
 * ═══════════════════════════════════════════════════════════
 * authRoleCheck — Verificação de acesso pós-autenticação
 * ═══════════════════════════════════════════════════════════
 *
 * Este app (dubadmin) NUNCA bloqueia login.
 * Qualquer pessoa autenticada pode acessar — o roteamento
 * interno (AuthRouter + usePermissions) cuida do destino.
 *
 * Um cliente que faz login aqui será encaminhado para o
 * onboarding e poderá criar sua barbearia normalmente.
 */

export type RoleCheckResult = { allowed: true };

/**
 * Sempre permite acesso. O roteamento pós-login decide o destino
 * baseado em roles existentes (admin, tenant_admin, barber, etc).
 */
export async function verifyStaffAccess(
  _userId: string,
  _isNewSignup = false
): Promise<RoleCheckResult> {
  return { allowed: true };
}
