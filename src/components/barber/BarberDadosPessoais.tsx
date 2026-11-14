import { BarberContext } from "@/pages/Barbeiro";
import { BarberDadosGerais } from "./dados-pessoais/BarberDadosGerais";

interface Props {
  barberContext?: Partial<BarberContext>;
  basePath?: string;
  onBack?: () => void;
}

/**
 * Dados Gerais do Barbeiro — tela unificada com foto, identificação, contato e endereço.
 */
export function BarberDadosPessoais({ barberContext, basePath = "/barbeiro", onBack }: Props) {
  return (
    <BarberDadosGerais
      barbeiroId={barberContext?.barbeiroId}
      userId={barberContext?.userId}
      basePath={basePath}
      onBack={onBack}
    />
  );
}
