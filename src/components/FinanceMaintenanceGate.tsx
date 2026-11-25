import { MaintenanceScreen } from "@/components/MaintenanceScreen";
import { useNavigate } from "react-router-dom";

interface FinanceMaintenanceGateProps {
  children: React.ReactNode;
  /** Se o tenant é de teste (isento de manutenção no financeiro) */
  isTestTenant: boolean;
  onExit?: () => void;
}

/**
 * Bloqueia o acesso ao financeiro/carteira para barbearias não-teste,
 * exibindo a tela de manutenção. O restante do app segue liberado.
 */
export function FinanceMaintenanceGate({
  children,
  isTestTenant,
  onExit,
}: FinanceMaintenanceGateProps) {
  const navigate = useNavigate();

  if (!isTestTenant) {
    return (
      <MaintenanceScreen
        message="Esta página está em manutenção programada. Retornamos na segunda-feira, 30 de novembro de 2026."
        onExit={onExit || (() => navigate("/"))}
      />
    );
  }

  return <>{children}</>;
}
