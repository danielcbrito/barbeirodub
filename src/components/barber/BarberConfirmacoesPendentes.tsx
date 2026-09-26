import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Inbox, Crown, CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BarberContext } from "@/pages/Barbeiro";
import { motion, AnimatePresence } from "framer-motion";
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
import { useBarberPendingPlans, type PendingPlanSub } from "@/hooks/useBarberPendingPlans";
import { useConfirmPlanPayment } from "@/hooks/useBarberMutations";

interface BarberConfirmacoesPendentesProps {
  barberContext: BarberContext;
}

export function BarberConfirmacoesPendentes({ barberContext }: BarberConfirmacoesPendentesProps) {
  const { data: pendingPlans = [], isLoading: loading } = useBarberPendingPlans(barberContext.barbeiroId);
  const confirmMutation = useConfirmPlanPayment();

  const [confirmPlanDialog, setConfirmPlanDialog] = useState<PendingPlanSub | null>(null);

  const isFirstLoad = pendingPlans.length === 0 && loading;

  /** Confirma pagamento de plano via mutation */
  const handleConfirmPlan = () => {
    if (!confirmPlanDialog) return;

    confirmMutation.mutate(
      {
        assinaturaId: confirmPlanDialog.id,
        userId: confirmPlanDialog.user_id,
        planName: confirmPlanDialog.plano?.nome || "assinatura",
        barbeiroId: barberContext.barbeiroId,
      },
      {
        onSuccess: () => setConfirmPlanDialog(null),
      }
    );
  };

  const totalPending = pendingPlans.length;

  return (
    <>
      <div className="space-y-5 pt-4">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold text-foreground">Confirmações de Planos</h1>
          {!loading && totalPending > 0 && (
            <span className="text-[11px] text-muted-foreground/70">{totalPending}</span>
          )}
        </div>

        {isFirstLoad ? (
          <div className="space-y-2">
            {[1, 2].map(i => <div key={i} className="h-[60px] rounded-lg bg-muted/15 animate-pulse" />)}
          </div>
        ) : totalPending === 0 ? (
          <div className="flex flex-col items-center text-center py-12">
            <Inbox className="w-7 h-7 text-muted-foreground/30 mb-3" strokeWidth={1.5} />
            <p className="text-[15px] font-semibold text-muted-foreground">
              Nenhuma confirmação pendente.
            </p>
            <p className="text-[13px] text-[#4B5563] mt-1.5 max-w-[260px]">
              Quando um cliente assinar um plano com pagamento em dinheiro, a confirmação aparecerá aqui.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {pendingPlans.map((plan) => (
                <motion.div
                  key={`plan-${plan.id}`}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.15 }}
                >
                  <div className="relative overflow-hidden rounded-lg border border-amber-500/20 bg-amber-500/5 p-3.5 pl-5 transition-opacity duration-150">
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg bg-amber-500" />
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-[13px] font-medium text-foreground truncate max-w-[140px]">
                            {plan.cliente?.nome || "Cliente"}
                          </p>
                          <span className="text-[10px] font-semibold shrink-0 whitespace-nowrap text-amber-400 flex items-center gap-1">
                            <Crown className="w-3 h-3" />
                            Plano
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {plan.plano?.nome || "Assinatura"} · R$ {Number(plan.plano?.preco_mensal || 0).toFixed(2).replace(".", ",")} · Dinheiro
                        </p>
                      </div>
                      <button
                        onClick={() => setConfirmPlanDialog(plan)}
                        className="h-8 px-3 rounded-lg flex items-center gap-1.5 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors duration-150 text-[11px] font-semibold shrink-0"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        Confirmar
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Dialog de confirmação de pagamento de plano */}
      <AlertDialog open={!!confirmPlanDialog} onOpenChange={(open) => !open && setConfirmPlanDialog(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-[15px]">
              <Crown className="w-5 h-5 text-amber-500" />
              Confirmar Pagamento do Plano
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[12px] space-y-2">
              <p>
                Confirma que <span className="text-foreground font-medium">{confirmPlanDialog?.cliente?.nome}</span> realizou
                o pagamento do plano <span className="text-foreground font-medium">{confirmPlanDialog?.plano?.nome}</span>?
              </p>
              <p className="text-amber-500 font-semibold">
                Valor: R$ {Number(confirmPlanDialog?.plano?.preco_mensal || 0).toFixed(2).replace(".", ",")}
              </p>
              <p className="text-muted-foreground text-[10px]">
                O plano será ativado por 30 dias e os cortes serão liberados para o cliente.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmMutation.isPending} className="h-9 text-[12px]">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmPlan}
              disabled={confirmMutation.isPending}
              className="h-9 text-[12px] bg-amber-600 hover:bg-amber-700"
            >
              {confirmMutation.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Confirmando...</>
              ) : (
                "Confirmar Pagamento"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
