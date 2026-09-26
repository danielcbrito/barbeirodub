/**
 * ═══════════════════════════════════════════════════════════
 * usePermissions — Hook centralizado de permissões
 * ═══════════════════════════════════════════════════════════
 *
 * Fonte única de verdade para roles e permissões do usuário.
 * Usa React Query com staleTime de 5min (roles mudam raramente).
 *
 * Uso:
 *   const { isDubAdmin, isTenantAdmin, isBarber, isLoading } = usePermissions()
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  GLOBAL_ROLES,
  type GlobalRole,
  isDubAdmin,
  isTenantAdmin,
  isTI,
  isBarber as isBarberRole,
} from "@/lib/roles";
import { STALE_TIMES } from "@/lib/queryConstants";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { useAuthReady } from "@/hooks/useAuthReady";
import { resolveOldestOwnedTenant, resolvePrimaryBarberForUser } from "@/lib/tenantOwnership";

interface PermissionsData {
  userId: string | null;
  globalRole: GlobalRole | null;
  tenantId: string | null;
  barbeiroId: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Admin DUB — controle total */
  isDubAdmin: boolean;
  /** Dono de barbearia */
  isTenantAdmin: boolean;
  /** Técnico de TI */
  isTI: boolean;
  /** Barbeiro (com ou sem role explícito) */
  isBarber: boolean;
  /** Cliente puro (sem role especial) */
  isClient: boolean;
  /** Refetch manual das permissões */
  refetch: () => void;
}

export function usePermissions(): PermissionsData {
  const { user, isReady } = useAuthReady();

  const { data, isLoading, refetch } = useQuery({
    queryKey: QUERY_KEYS.shared.permissoes(user?.id),
    queryFn: async () => {
      if (!user) return null;

      // Buscar roles, perfil profissional principal e tenant próprio em paralelo.
      // Isso protege contra barbeiros duplicados criados depois do perfil histórico.
      const [{ data: roles }, { data: barberProfile }, { data: ownedTenant }] = await Promise.all([
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id),
        resolvePrimaryBarberForUser<{ id: string; tenant_id: string | null }>(user.id),
        resolveOldestOwnedTenant<{ id: string }>(user.id, "id"),
      ]);

      const hasBarberProfile = !!barberProfile?.id;
      const hasOwnedTenant = !!ownedTenant?.id;
      const hasAdminRole = !!roles?.some((r) => r.role === GLOBAL_ROLES.ADMIN);
      const hasTenantAdminRole = !!roles?.some((r) => r.role === GLOBAL_ROLES.TENANT_ADMIN);
      const hasTIRole = !!roles?.some((r) => r.role === GLOBAL_ROLES.TI);
      const hasExplicitBarberRole = !!roles?.some(
        (r) =>
          r.role === GLOBAL_ROLES.BARBER ||
          (r.role as string) === "barbeiro"
      );
      const hasClientRole = !!roles?.some((r) => r.role === GLOBAL_ROLES.CLIENTE);

      const shouldTreatTenantAdminAsBarber =
        hasTenantAdminRole && hasBarberProfile && !hasOwnedTenant;

      // Determinar role global (prioridade: admin > tenant_admin > ti > barber > cliente)
      // Importante: proprietário de tenant continua sendo tenant_admin
      // mesmo se a row em user_roles estiver ausente/legada.
      let globalRole: GlobalRole | null = null;
      if (hasAdminRole) {
        globalRole = GLOBAL_ROLES.ADMIN;
      } else if (hasOwnedTenant) {
        globalRole = GLOBAL_ROLES.TENANT_ADMIN;
      } else if (hasTenantAdminRole && (hasOwnedTenant || !hasBarberProfile)) {
        globalRole = GLOBAL_ROLES.TENANT_ADMIN;
      } else if (hasTIRole) {
        globalRole = GLOBAL_ROLES.TI;
      } else if (
        hasExplicitBarberRole ||
        shouldTreatTenantAdminAsBarber ||
        (hasClientRole && hasBarberProfile) ||
        hasBarberProfile
      ) {
        // Perfil de barbeiro ativo sempre tem prioridade sobre role 'cliente'
        globalRole = GLOBAL_ROLES.BARBER;
      } else if (hasClientRole) {
        globalRole = GLOBAL_ROLES.CLIENTE;
      }

      return {
        userId: user.id,
        globalRole,
        tenantId: barberProfile?.tenant_id ?? null,
        barbeiroId: barberProfile?.id ?? null,
        hasBarberProfile,
      };
    },
    staleTime: STALE_TIMES.PERMISSOES,
    retry: 1,
    enabled: isReady,
  });

  const globalRole = data?.globalRole ?? null;
  const hasBarberProfile = data?.hasBarberProfile ?? false;

  return {
    userId: data?.userId ?? null,
    globalRole,
    tenantId: data?.tenantId ?? null,
    barbeiroId: data?.barbeiroId ?? null,
    isLoading: !isReady || isLoading,
    isAuthenticated: !!data?.userId,
    isDubAdmin: isDubAdmin(globalRole),
    isTenantAdmin: isTenantAdmin(globalRole),
    isTI: isTI(globalRole),
    isBarber: isBarberRole(globalRole) || (!globalRole && hasBarberProfile),
    isClient: !globalRole && !hasBarberProfile,
    refetch,
  };
}
