import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { CarteiraPage } from "@/components/barber/CarteiraPage";
import type { BarberContext } from "@/pages/Barbeiro";

interface Props {
  barberContext: BarberContext;
  basePath?: string;
}

export function BarberFinanceiro({ barberContext, basePath = "/barbeiro" }: Props) {
  const navigate = useNavigate();

  const handleBack = useCallback(() => {
    navigate(`${basePath}/perfil`);
  }, [navigate, basePath]);

  return (
    <CarteiraPage
      barbeiroId={barberContext.barbeiroId}
      barbeiroNome={barberContext.apelido}
      basePath={basePath}
      onBack={handleBack}
    />
  );
}
