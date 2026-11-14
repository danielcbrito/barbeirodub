import { useNavigate } from "react-router-dom";
import { BarberMeuPlano } from "@/components/barber/BarberMeuPlano";
import type { TenantSubscriptionInfo } from "@/hooks/useTenantSubscription";

interface TenantSubscriptionPageProps {
  subscription: TenantSubscriptionInfo;
  basePath: string;
  tenantId?: string | null;
}

/**
 * Todas as assinaturas usam o mesmo checkout Woovi do painel do barbeiro.
 * Assim não existe um segundo caminho liberando planos por links externos.
 */
export function TenantSubscriptionPage({ tenantId }: TenantSubscriptionPageProps) {
  const navigate = useNavigate();

  return (
    <BarberMeuPlano
      tenantId={tenantId ?? null}
      onBack={() => navigate(-1)}
    />
  );
}
