import { useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { XCircle, AlertTriangle, Wallet } from "lucide-react";

interface CancelAppointmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string;
  isPaid: boolean;
  amount: number;
  userId: string;
  onSuccess: () => void;
  paymentMethod?: string;
  observacoes?: string;
}

export function CancelAppointmentModal({
  open,
  onOpenChange,
  appointmentId,
  isPaid,
  amount,
  userId,
  onSuccess,
  paymentMethod,
  observacoes,
}: CancelAppointmentModalProps) {
  const [cancelling, setCancelling] = useState(false);

  const isPaidWithCredit = paymentMethod === 'credit' || 
    observacoes?.toLowerCase().includes('crédito do app') ||
    observacoes?.toLowerCase().includes('credito do app');

  const getCreditAmount = (): number => {
    if (amount > 0) return amount;
    if (observacoes) {
      const match = observacoes.match(/R\$\s*([\d.,]+)/);
      if (match) return parseFloat(match[1].replace(',', '.'));
    }
    return 0;
  };

  const creditAmount = getCreditAmount();
  const shouldRefundCredit = isPaidWithCredit && creditAmount > 0;
  const shouldRefundPayment = isPaid && !isPaidWithCredit && amount > 0;
  const refundAmount = shouldRefundCredit ? creditAmount : (shouldRefundPayment ? amount : 0);

  const handleCancelDefinitely = async () => {
    setCancelling(true);
    try {
      const { error: updateError } = await supabase
        .from("agendamentos")
        .update({ 
          status: "cancelled_by_user",
          visivel_para_usuario: false 
        })
        .eq("id", appointmentId);

      if (updateError) throw updateError;

      if (shouldRefundCredit) {
        const { error: creditError } = await supabase
          .from("creditos")
          .insert({
            user_id: userId,
            valor: creditAmount,
            origem: "estorno_cancelamento",
            agendamento_origem_id: appointmentId,
            usado: false,
          });
        if (creditError) throw creditError;
        toast.success(`Agendamento cancelado. R$ ${creditAmount.toFixed(2)} estornado para sua carteira.`);
      } else if (shouldRefundPayment) {
        const { error: creditError } = await supabase
          .from("creditos")
          .insert({
            user_id: userId,
            valor: amount,
            origem: "cancelamento",
            agendamento_origem_id: appointmentId,
            usado: false,
          });
        if (creditError) throw creditError;
        toast.success(`Agendamento cancelado. Crédito de R$ ${amount.toFixed(2)} disponível para o próximo corte.`);
      } else {
        toast.success("Agendamento cancelado com sucesso.");
      }

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Error cancelling appointment:", error);
      toast.error("Erro ao cancelar agendamento. Tente novamente.");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="text-left pb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
              <XCircle className="w-4.5 h-4.5 text-destructive" />
            </div>
            <div>
              <DrawerTitle className="text-base font-bold text-foreground">
                Cancelar Agendamento
              </DrawerTitle>
              <DrawerDescription className="text-xs text-muted-foreground mt-0.5">
                Esta ação não pode ser desfeita
              </DrawerDescription>
            </div>
          </div>
        </DrawerHeader>

        <div className="px-4 pb-2 space-y-4">
          {/* Warning */}
          <div className="flex items-start gap-2.5 rounded-xl bg-destructive/8 border border-destructive/15 p-3.5">
            <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-[12px] text-destructive/90 leading-relaxed">
              Tem certeza que deseja cancelar este agendamento definitivamente?
            </p>
          </div>

          {/* Refund info */}
          {refundAmount > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl bg-primary/8 border border-primary/15 p-3.5">
              <Wallet className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <p className="text-[12px] text-foreground/80 leading-relaxed">
                {shouldRefundCredit ? (
                  <>O valor de <strong className="text-foreground">R$ {creditAmount.toFixed(2)}</strong> será estornado para sua carteira.</>
                ) : (
                  <>O valor de <strong className="text-foreground">R$ {amount.toFixed(2)}</strong> ficará como crédito para o próximo corte.</>
                )}
              </p>
            </div>
          )}
        </div>

        <DrawerFooter className="pt-2 pb-6 gap-2.5">
          <Button
            onClick={handleCancelDefinitely}
            disabled={cancelling}
            variant="destructive"
            className="w-full h-12 rounded-xl text-[13px] font-semibold tracking-wide"
          >
            {cancelling ? "Cancelando..." : "Confirmar Cancelamento"}
          </Button>
          <Button
            onClick={() => onOpenChange(false)}
            variant="outline"
            className="w-full h-11 rounded-xl text-[13px] font-medium border-border/40"
          >
            Voltar
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
