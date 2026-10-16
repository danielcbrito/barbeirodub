import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { CarteiraPage } from "@/components/barber/CarteiraPage";

interface AdminFinanceiroProps {
  userId?: string;
  userName?: string;
  barbeiroId?: string | null;
  basePath?: string;
}

export function AdminFinanceiro({ userName, barbeiroId, basePath = "/admin" }: AdminFinanceiroProps = {}) {
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

  return (
    <CarteiraPage
      barbeiroId={barbeiroId}
      barbeiroNome={userName || "Admin"}
      basePath={basePath}
      onBack={handleBack}
    />
  );
}

