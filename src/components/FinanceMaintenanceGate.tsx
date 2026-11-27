import { MaintenanceScreen } from "@/components/MaintenanceScreen";
import { useNavigate } from "react-router-dom";

interface FinanceMaintenanceGateProps {
  children: React.ReactNode;
  /** Se o tenant é de teste (isento de manutenção no financeiro) */
  isTestTenant: boolean;
  /** Nome do tenant — barbearias com "vip" no nome são isentas */
  tenantNome?: string | null;
  onExit?: () => void;
}

/** Retorna true se o nome do tenant está na lista de isentos */
function isExemptByName(nome?: string | null): boolean {
  if (!nome) return false;
  const clean = nome.toLowerCase().trim();
  return (
    clean.includes("vip") ||
    clean.includes("barbearia vip") ||
    clean.includes("vip exclusive")
  );
}

/**
 * Bloqueia o acesso ao financeiro/carteira para barbearias não-isentas,
 * exibindo a tela de manutenção. O restante do app segue liberado.
 * Isentos: barbearias de teste (is_test) e barbearias VIP.
 */
export function FinanceMaintenanceGate({
  children,
  isTestTenant,
  tenantNome,
  onExit,
}: FinanceMaintenanceGateProps) {
  const navigate = useNavigate();

  const isExempt = isTestTenant || isExemptByName(tenantNome);

  if (!isExempt) {
    return (
      <MaintenanceScreen
        message="Esta página está em manutenção programada. Retornamos na segunda-feira, 30 de novembro de 2026."
        onExit={onExit || (() => navigate("/"))}
      />
    );
  }

  return <>{children}</>;
}
