/**
 * ═══════════════════════════════════════════════════════════
 * AuthRouter — Componente de redirecionamento pós-login
 * ═══════════════════════════════════════════════════════════
 *
 * ÚNICO responsável por decidir para onde redirecionar
 * após login com base nas permissões do usuário.
 *
 * Uso: <Route path="/auth/redirect" element={<AuthRouter />} />
 *
 * Pode também ser chamado como função via useAuthRedirect().
 */

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { LoadingScreen } from "@/components/shared/LoadingScreen";
import { ROLE_REDIRECTS } from "@/lib/roles";
import { resolveOldestOwnedTenant } from "@/lib/tenantOwnership";

/**
 * Componente que renderiza loading enquanto resolve o redirect.
 * Nunca deixa tela em branco.
 */
export function AuthRouter() {
  const navigate = useNavigate();
  const { globalRole, isBarber, isLoading, isAuthenticated, userId } =
    usePermissions();

  useEffect(() => {
    if (isLoading) return;

    // Não autenticado → landing
    if (!isAuthenticated) {
      navigate("/", { replace: true });
      return;
    }

    // 1. Role global com redirect mapeado
    if (globalRole && ROLE_REDIRECTS[globalRole]) {
      // Caso especial: tenant_admin sem onboarding pode precisar ir pro onboarding
      if (globalRole === "tenant_admin") {
        checkTenantOnboarding(userId!, navigate);
        return;
      }
      navigate(ROLE_REDIRECTS[globalRole], { replace: true });
      return;
    }

    // 2. Barbeiro sem role global
    if (isBarber) {
      navigate("/barbeiro", { replace: true });
      return;
    }

    // 3. Cliente puro ou sem role → tela do cliente
    navigate("/cliente", { replace: true });
  }, [globalRole, isBarber, isLoading, isAuthenticated, userId, navigate]);

  return <LoadingScreen message="Carregando seu perfil..." />;
}

/**
 * Verifica se tenant_admin completou o onboarding.
 * Se sim → /minha-barbearia. Se não → /onboarding.
 */
async function checkTenantOnboarding(
  userId: string,
  navigate: ReturnType<typeof useNavigate>
) {
  const { data: tenant } = await resolveOldestOwnedTenant<{
    onboarding_completed: boolean | null;
  }>(userId, "onboarding_completed");

  if (tenant?.onboarding_completed) {
    navigate("/minha-barbearia", { replace: true });
  } else {
    navigate("/onboarding", { replace: true });
  }
}

/**
 * Hook para usar a lógica de redirect em componentes existentes.
 * Retorna uma função que redireciona baseado no role do usuário.
 */
export function useAuthRedirect() {
  const navigate = useNavigate();
  const permissions = usePermissions();

  const redirect = async () => {
    if (permissions.isLoading) return;

    if (permissions.globalRole && ROLE_REDIRECTS[permissions.globalRole]) {
      if (permissions.globalRole === "tenant_admin" && permissions.userId) {
        await checkTenantOnboarding(permissions.userId, navigate);
        return;
      }
      navigate(ROLE_REDIRECTS[permissions.globalRole], { replace: true });
      return;
    }

    if (permissions.isBarber) {
      navigate("/barbeiro", { replace: true });
      return;
    }

    navigate("/cliente", { replace: true });
  };

  return { redirect, ...permissions };
}
