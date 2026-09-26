import { BarberContext } from "@/pages/Barbeiro";
import { BarberDadosGerais } from "./dados-pessoais/BarberDadosGerais";

interface Props {
  barberContext: BarberContext;
  basePath?: string;
}

/**
 * Dados Gerais do Barbeiro — tela unificada com foto, identificação, contato e endereço.
 */
export function BarberDadosPessoais({ barberContext, basePath = "/barbeiro" }: Props) {
  return (
    <BarberDadosGerais
      barbeiroId={barberContext.barbeiroId}
      userId={barberContext.userId}
      basePath={basePath}
    />
  );
}
