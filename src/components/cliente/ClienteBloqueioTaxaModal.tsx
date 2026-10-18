import { useState, useEffect } from "react";
import { ClienteDebitoCancelamento, markCancellationDebtAsPaid, subscribeToClientCancellationDebts } from "@/lib/barberCancellationFee";
import { AlertTriangle, QrCode, Copy, Check, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface ClienteBloqueioTaxaModalProps {
  debito: ClienteDebitoCancelamento | null;
  onUnlocked: () => void;
}

export function ClienteBloqueioTaxaModal({ debito, onUnlocked }: ClienteBloqueioTaxaModalProps) {
  const [copied, setCopied] = useState(false);
  const [paying, setPaying] = useState(false);
  const [showPix, setShowPix] = useState(false);

  useEffect(() => {
    if (!debito?.cliente_id) return;

    // Escuta em tempo real o pagamento / liberação do débito
    const unsubscribe = subscribeToClientCancellationDebts(debito.cliente_id, (updatedDebt) => {
      if (!updatedDebt || updatedDebt.status === "pago") {
        toast.success("Taxa de cancelamento quitada! Seu aplicativo foi desbloqueado.");
        onUnlocked();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [debito?.cliente_id, onUnlocked]);

  if (!debito || debito.status !== "pendente") return null;

  const pixPayloadMock = debito.pix_payload || `00020126580014br.gov.bcb.pix0136${debito.id}520400005303986540${debito.valor_taxa.toFixed(2)}5802BR5913BarbeariaDUB6009SaoPaulo62070503***6304`;

  const handleCopyPix = () => {
    navigator.clipboard.writeText(pixPayloadMock);
    setCopied(true);
    toast.success("Código Pix Copia e Cola copiado!");
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSimularPagamento = async () => {
    setPaying(true);
    try {
      await markCancellationDebtAsPaid(debito.id, debito.cliente_id);
      toast.success("Pagamento confirmado com sucesso!");
      onUnlocked();
    } catch {
      toast.error("Erro ao validar pagamento.");
    } finally {
      setPaying(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="w-full max-w-md rounded-3xl bg-card border border-destructive/30 p-6 text-center space-y-5 shadow-2xl relative overflow-hidden"
        >
          {/* Faixa decorativa no topo */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-red-600 via-amber-500 to-red-600" />

          {/* Ícone de Cadeado / Alerta */}
          <div className="w-16 h-16 rounded-2xl bg-destructive/15 border border-destructive/30 flex items-center justify-center mx-auto text-destructive">
            <Lock className="w-8 h-8 stroke-[2]" />
          </div>

          <div>
            <h2 className="text-[19px] font-bold text-foreground tracking-tight">
              Aplicativo Temporariamente Bloqueado
            </h2>
            <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed">
              Você possui uma taxa de cancelamento pendente referente ao agendamento cancelado com {debito.barbeiro_nome || "seu profissional"}.
            </p>
          </div>

          {/* Card com o Valor da Taxa */}
          <div className="p-4 rounded-2xl bg-secondary/50 border border-border/60 space-y-1">
            <span className="text-[12px] text-muted-foreground font-medium block">
              Valor da taxa de regularização
            </span>
            <span className="text-3xl font-extrabold text-foreground">
              R$ {debito.valor_taxa.toFixed(2).replace(".", ",")}
            </span>
            {debito.porcentagem_aplicada && (
              <span className="text-[11px] text-muted-foreground block">
                Calculado em {debito.porcentagem_aplicada}% sobre o valor do serviço cancelado.
              </span>
            )}
          </div>

          {/* Área Pix */}
          {!showPix ? (
            <button
              type="button"
              onClick={() => setShowPix(true)}
              className="w-full h-13 rounded-2xl bg-foreground text-background font-bold text-[14px] flex items-center justify-center gap-2 shadow-lg active:scale-[0.99] transition-all"
            >
              <QrCode className="w-5 h-5" />
              <span>Pagar taxa via Pix para desbloquear</span>
            </button>
          ) : (
            <div className="space-y-3 pt-2">
              <div className="p-4 rounded-2xl bg-muted/40 border border-border/60 flex flex-col items-center gap-3">
                <div className="w-44 h-44 rounded-xl bg-white p-2.5 flex items-center justify-center shadow-md">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(pixPayloadMock)}`}
                    alt="QR Code Pix"
                    className="w-full h-full object-contain"
                  />
                </div>
                <span className="text-[11.5px] text-muted-foreground">
                  Escaneie com o app do seu banco ou copie o código abaixo:
                </span>
              </div>

              <button
                type="button"
                onClick={handleCopyPix}
                className="w-full h-11 rounded-xl bg-secondary hover:bg-secondary/80 border border-border/60 text-foreground font-semibold text-[13px] flex items-center justify-center gap-2 active:scale-[0.99] transition-all"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? "Copiado com sucesso!" : "Copiar código Pix Copia e Cola"}</span>
              </button>

              <button
                type="button"
                onClick={handleSimularPagamento}
                disabled={paying}
                className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[13px] flex items-center justify-center gap-2 active:scale-[0.99] transition-all shadow-xs"
              >
                {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>Confirmar pagamento e desbloquear</span>
              </button>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground/75 leading-relaxed">
            Assim que a transferência for confirmada pelo sistema bancário, o seu acesso a agendamentos será reestabelecido instantaneamente.
          </p>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
