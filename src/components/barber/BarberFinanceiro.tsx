import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { CarteiraScreen } from "@/components/financial/CarteiraScreen";
import type { BarberContext } from "@/pages/Barbeiro";

interface Props {
  barberContext: BarberContext;
  basePath?: string;
}

/**
 * BarberFinanceiro — rota de ponte para a carteira externa da Efí Bank.
 *
 * O fluxo do barbeiro não usa mais o módulo financeiro interno para saque.
 * Ao entrar em /financeiro, o app dispara imediatamente o deep link para a Efí.
 */
export function BarberFinanceiro({ barberContext, basePath = "/barbeiro" }: Props) {
  const navigate = useNavigate();

  const handleBack = useCallback(() => {
    navigate(`${basePath}/perfil`);
  }, [navigate, basePath]);

  return (
    <CarteiraScreen
      barbeiroId={barberContext.barbeiroId}
      onBack={handleBack}
    />
  );
}
