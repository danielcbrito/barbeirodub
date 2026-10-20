import { useEffect } from "react";
import { ClienteDebitoCancelamento, subscribeToClientCancellationDebts } from "@/lib/barberCancellationFee";

interface ClienteBloqueioTaxaModalProps {
  debito: ClienteDebitoCancelamento | null;
  onUnlocked: () => void;
}

/**
 * ClienteBloqueioTaxaModal (Versão Não-Bloqueante)
 * Taxas pendentes NUNCA bloqueiam o aplicativo.
 * O saldo devedor é somado de forma transparente no próximo agendamento do cliente.
 */
export function ClienteBloqueioTaxaModal({ debito, onUnlocked }: ClienteBloqueioTaxaModalProps) {
  useEffect(() => {
    if (!debito?.cliente_id) return;

    const unsubscribe = subscribeToClientCancellationDebts(debito.cliente_id, (updatedDebt) => {
      if (!updatedDebt || updatedDebt.status === "pago" || updatedDebt.status === "dispensado" || (updatedDebt.status as string) === "liberado_manual") {
        onUnlocked();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [debito?.cliente_id, onUnlocked]);

  // NUNCA bloqueia a navegação nem exibe tela preta impeditiva
  return null;
}
