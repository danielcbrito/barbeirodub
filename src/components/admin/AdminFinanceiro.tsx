import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { CarteiraScreen } from "@/components/financial/CarteiraScreen";

interface AdminFinanceiroProps {
  userId?: string;
  userName?: string;
  barbeiroId?: string | null;
  basePath?: string;
}

/**
 * AdminFinanceiro — ponte direta para o app da Efí Bank.
 * Remove o módulo financeiro interno para admin/tenant também.
 */
export function AdminFinanceiro({ barbeiroId, basePath = "/admin" }: AdminFinanceiroProps = {}) {
  const navigate = useNavigate();

  const handleBack = useCallback(() => {
    navigate(`${basePath}/perfil`);
  }, [navigate, basePath]);

  if (!barbeiroId) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-7 h-7 border-2 border-border border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  return <CarteiraScreen barbeiroId={barbeiroId} onBack={handleBack} />;
}

