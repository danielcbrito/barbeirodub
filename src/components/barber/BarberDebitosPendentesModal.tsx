import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  fetchBarberPendingCancellationDebts,
  dispenseCancellationDebt,
  formatItemReason,
  type ClienteDebitoCancelamento,
  type ClienteDebitoItem,
} from "@/lib/barberCancellationFee";
import { toast } from "sonner";
import {
  Loader2,
  Search,
  User,
  Phone,
  Calendar,
  AlertCircle,
  CheckCircle2,
  HeartHandshake,
  Receipt,
  X,
  Sparkles,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface BarberDebitosPendentesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  barbeiroId: string;
  tenantId?: string | null;
  onDebtUpdated?: () => void;
}

export function BarberDebitosPendentesModal({
  open,
  onOpenChange,
  barbeiroId,
  tenantId,
  onDebtUpdated,
}: BarberDebitosPendentesModalProps) {
  const [debts, setDebts] = useState<ClienteDebitoCancelamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [dispensingId, setDispensingId] = useState<string | null>(null);

  // Confirmação para dispensar taxa
  const [confirmDebtToDispense, setConfirmDebtToDispense] = useState<{
    debitoId?: string;
    clienteId: string;
    clienteNome: string;
    valor: number;
  } | null>(null);

  const loadDebts = async () => {
    if (!barbeiroId) return;
    try {
      setLoading(true);
      const data = await fetchBarberPendingCancellationDebts(barbeiroId, tenantId);
      setDebts(data);
    } catch (err) {
      console.error("Erro ao carregar débitos pendentes:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadDebts();
    }
  }, [open, barbeiroId, tenantId]);

  const filteredDebts = useMemo(() => {
    if (!search.trim()) return debts;
    const q = search.toLowerCase();
    return debts.filter(
      (d) =>
        (d.cliente_nome && d.cliente_nome.toLowerCase().includes(q)) ||
        (d.cliente_telefone && d.cliente_telefone.includes(q)) ||
        (d.motivo && d.motivo.toLowerCase().includes(q))
    );
  }, [debts, search]);

  const handleDispense = async () => {
    if (!confirmDebtToDispense) return;
    const { clienteId, debitoId, clienteNome, valor } = confirmDebtToDispense;
    setDispensingId(clienteId);
    setConfirmDebtToDispense(null);

    // Optimistic removal from list
    const previous = [...debts];
    setDebts((prev) => prev.filter((d) => d.cliente_id !== clienteId));

    try {
      const ok = await dispenseCancellationDebt({
        debitoId,
        clienteId,
        barbeiroId,
        tenantId,
      });

      if (ok) {
        toast.success(`Taxa de R$ ${valor.toFixed(2).replace(".", ",")} de ${clienteNome} dispensada com sucesso! O cliente está liberado.`);
        onDebtUpdated?.();
      } else {
        setDebts(previous);
        toast.error("Não foi possível dispensar a taxa. Tente novamente.");
      }
    } catch (err: any) {
      setDebts(previous);
      toast.error(err?.message || "Erro ao dispensar taxa.");
    } finally {
      setDispensingId(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg p-0 overflow-hidden rounded-3xl border border-border/60 bg-background max-h-[85vh] flex flex-col">
          <DialogHeader className="p-5 pb-3 border-b border-border/25">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-[17px] font-bold text-foreground tracking-tight">
                  Clientes com Taxas Pendentes
                </DialogTitle>
                <DialogDescription className="text-[12px] text-muted-foreground mt-0.5">
                  Taxas decorrentes de cancelamentos tardios ou faltas (no-show)
                </DialogDescription>
              </div>
            </div>

            {/* Campo de Busca */}
            <div className="relative mt-3">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar por cliente ou telefone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-10 pl-9 pr-3 rounded-xl bg-secondary/50 border border-border/40 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
              />
            </div>
          </DialogHeader>

          {/* Lista com scroll */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loading ? (
              <div className="py-16 flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <span className="text-[12px] text-muted-foreground">Carregando taxas pendentes...</span>
              </div>
            ) : filteredDebts.length === 0 ? (
              <div className="py-14 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center border border-emerald-500/20">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-foreground">
                    Nenhuma taxa pendente
                  </p>
                  <p className="text-[12px] text-muted-foreground max-w-xs mx-auto mt-0.5">
                    {search ? "Nenhum cliente encontrado para sua busca." : "Todos os clientes estão em dia com as políticas de atendimento."}
                  </p>
                </div>
              </div>
            ) : (
              filteredDebts.map((debt) => {
                const total = debt.total_pendente || debt.valor_taxa || 0;
                const isDispensing = dispensingId === debt.cliente_id;

                return (
                  <div
                    key={debt.id || debt.cliente_id}
                    className="p-4 rounded-2xl border border-border/50 bg-card hover:border-border/80 transition-all space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="w-10 h-10 border border-border/40 shrink-0">
                          <AvatarImage src={debt.cliente_avatar || undefined} />
                          <AvatarFallback className="text-[12px] font-semibold bg-secondary text-foreground">
                            {(debt.cliente_nome || "C").slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-[14px] font-semibold text-foreground truncate">
                            {debt.cliente_nome || "Cliente"}
                          </p>
                          {debt.cliente_telefone && (
                            <p className="text-[11.5px] text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Phone className="w-3 h-3 text-muted-foreground/60" />
                              {debt.cliente_telefone}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[15px] font-bold text-foreground tabular-nums block">
                          R$ {total.toFixed(2).replace(".", ",")}
                        </span>
                        <span className="text-[10px] uppercase font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                          Pendente
                        </span>
                      </div>
                    </div>

                    {/* Detalhe do Motivo */}
                    <div className="p-2.5 rounded-xl bg-secondary/30 border border-border/30 text-[11.5px] space-y-1">
                      {debt.itens && debt.itens.length > 0 ? (
                        debt.itens.map((it, idx) => (
                          <div key={it.id || idx} className="flex items-center justify-between text-muted-foreground">
                            <span className="truncate pr-2 font-medium text-foreground">
                              {formatItemReason(it)}
                            </span>
                            <span className="tabular-nums font-semibold shrink-0">
                              R$ {Number(it.valor_taxa || 0).toFixed(2).replace(".", ",")}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-muted-foreground font-medium">
                          {debt.motivo || "Taxa de cancelamento com menos de 2h ou falta"}
                        </p>
                      )}
                    </div>

                    {/* Botão de Liberação / Cortesia */}
                    <div className="pt-1 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmDebtToDispense({
                            clienteId: debt.cliente_id,
                            debitoId: debt.id,
                            clienteNome: debt.cliente_nome || "o cliente",
                            valor: total,
                          })
                        }
                        disabled={isDispensing}
                        className="h-9 px-3.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-[12px] font-semibold flex items-center gap-1.5 border border-border/40 active:scale-[0.98] transition-all disabled:opacity-50"
                      >
                        {isDispensing ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <HeartHandshake className="w-3.5 h-3.5 text-foreground/70" />
                        )}
                        <span>Dispensar taxa (Liberar)</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação de Dispensa */}
      <AlertDialog
        open={!!confirmDebtToDispense}
        onOpenChange={(op) => !op && setConfirmDebtToDispense(null)}
      >
        <AlertDialogContent className="max-w-sm rounded-3xl p-6 bg-background border border-border/60">
          <AlertDialogHeader className="space-y-2">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-1">
              <HeartHandshake className="w-6 h-6 stroke-[1.8]" />
            </div>
            <AlertDialogTitle className="text-[16px] font-bold text-center text-foreground">
              Dispensar taxa por cortesia?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[12.5px] text-center text-muted-foreground leading-relaxed">
              Deseja perdoar a taxa de <strong className="text-foreground">R$ {confirmDebtToDispense?.valor.toFixed(2).replace(".", ",")}</strong> de <strong className="text-foreground">{confirmDebtToDispense?.clienteNome}</strong>?
              <br /><br />
              O aplicativo do cliente será desbloqueado imediatamente e a cobrança removida da conta dele.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pt-3 gap-2 sm:gap-2">
            <AlertDialogCancel className="h-10 rounded-xl text-[12.5px] font-medium border-border/60">
              Voltar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDispense}
              className="h-10 rounded-xl bg-black text-white dark:bg-white dark:text-black text-[12.5px] font-semibold hover:opacity-90 transition-all"
            >
              Sim, dispensar taxa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
