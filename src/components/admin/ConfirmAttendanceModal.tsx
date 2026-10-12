import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertTriangle, User, CreditCard, Banknote, Crown } from "lucide-react";
import { TimelineAppointment } from "./AdminAgenda";
import { cn } from "@/lib/utils";
import { usePlanPaymentInfo } from "@/hooks/usePlanPaymentInfo";
import { useCompleteAppointment, useNoShowAppointment } from "@/hooks/useAgendaMutations";
import { toast } from "sonner";
import { isWhatsAppAppointment } from "@/lib/walkInName";
import { WhatsAppBadge } from "@/components/shared/WhatsAppBadge";

interface ConfirmAttendanceModalProps {
  appointment: TimelineAppointment | null;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export function ConfirmAttendanceModal({ appointment, open, onClose, onUpdate }: ConfirmAttendanceModalProps) {
  const isPlanAppointment = appointment?.tipo_agendamento === 'plano' || appointment?.payment_method === 'plano';
  const planInfo = usePlanPaymentInfo(appointment?.user_id || '', isPlanAppointment && !!appointment);
  const completeMutation = useCompleteAppointment();
  const noShowMutation = useNoShowAppointment();

  if (!appointment) return null;

  const payment = appointment.pagamentos?.[0];
  const paymentMethod = payment?.metodo || appointment.payment_method || 'cash';
  const isPrepaid = payment?.status === 'paid';
  const loading = completeMutation.isPending || noShowMutation.isPending;
  const barbeiroId = (appointment as any).barbeiro_id || "";

  const handleConfirmAttendance = () => {
    completeMutation.mutate(
      {
        appointmentId: appointment.id,
        barbeiroId,
        date: new Date(`${appointment.data}T12:00:00`),
        userId: appointment.user_id,
        serviceName: appointment.servico?.nome || "serviço",
        preco: appointment.preco,
        paymentMethod,
        isPrepaid,
      },
      {
        onSuccess: () => {
          toast.success("Atendimento confirmado com sucesso. Ponto de fidelidade liberado.");
          onUpdate();
          onClose();
        },
      }
    );
  };

  const handleNoShow = () => {
    noShowMutation.mutate(
      {
        appointmentId: appointment.id,
        barbeiroId,
        date: new Date(`${appointment.data}T12:00:00`),
        userId: appointment.user_id,
        serviceName: appointment.servico?.nome || "serviço",
      },
      {
        onSuccess: () => {
          toast.info("Cliente marcado como ausente");
          onUpdate();
          onClose();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
            </div>
            <span>Confirmação Obrigatória</span>
          </DialogTitle>
          <DialogDescription>
            Confirme a realização do atendimento e o pagamento do cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Cliente Info */}
          <div className="p-4 rounded-xl bg-foreground/[0.03] border border-foreground/[0.06]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-foreground/[0.05] flex items-center justify-center">
                <User className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-foreground">{appointment.profile?.nome || "Cliente"}</p>
                  {isWhatsAppAppointment(appointment.observacoes) && <WhatsAppBadge />}
                </div>
                <p className="text-sm text-muted-foreground">
                  {appointment.servico?.nome} - {(appointment.tipo_agendamento === "plano" || appointment.payment_method === "plano") ? (
                    <span className="inline-flex items-center gap-1 bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30 px-2 py-0.5 rounded-full text-[10px] font-bold ml-1">
                      <Crown className="w-2.5 h-2.5 fill-purple-400/20" />
                      PLANO
                    </span>
                  ) : (
                    <span className="text-primary font-medium">R$ {appointment.preco.toFixed(2).replace('.', ',')}</span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Payment Info */}
          <div className="p-4 rounded-xl bg-foreground/[0.03] border border-foreground/[0.06]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-foreground/[0.05] flex items-center justify-center">
                <CreditCard className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground mb-1">Forma de Pagamento</p>
                <Badge 
                  variant="outline" 
                  className={cn(
                    "font-medium",
                    isPrepaid 
                      ? "bg-green-500/20 text-green-400 border-green-500/30" 
                      : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                  )}
                >
                  {paymentMethod === 'pix' && 'PIX'}
                  {paymentMethod === 'card' && 'Cartão'}
                  {paymentMethod === 'cash' && 'Pagar na Barbearia'}
                  {isPrepaid ? ' - Pago' : ' - Pendente'}
                </Badge>
              </div>
            </div>
          </div>

          {/* Perguntas */}
          <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <p className="font-medium text-sm text-blue-300">O cliente compareceu ao atendimento?</p>
            <p className="font-medium text-sm text-blue-300 mt-1">O pagamento foi realizado corretamente?</p>
          </div>

          {/* Cash Plan Warning */}
          {isPlanAppointment && planInfo.isCashPending && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <div className="flex items-center gap-2 mb-1">
                <Banknote className="w-5 h-5 text-amber-400" />
                <p className="text-sm font-semibold text-amber-400">
                  💰 Plano pago na barbearia
                </p>
              </div>
              <p className="text-sm text-amber-400/80">
                Cobrar <strong>R$ {planInfo.precoMensal.toFixed(2).replace('.', ',')}</strong> do cliente
                {planInfo.planName ? ` (${planInfo.planName})` : ''} antes de finalizar.
              </p>
            </div>
          )}

          {/* Aviso de Segurança */}
          {!isPrepaid && !isPlanAppointment && (
            <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
              <p className="text-sm text-yellow-400">
                Atenção: Cliente ainda não efetuou o pagamento. Confirme apenas após receber o pagamento na barbearia.
              </p>
            </div>
          )}

          {/* Explicação do Sistema de Pontos */}
          <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20">
            <p className="text-sm text-green-400">
              Ao confirmar, o cliente receberá <strong>1 ponto de fidelidade</strong>. 
              Ao atingir a meta configurada no programa, 1 corte gratuito será creditado automaticamente.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button
            onClick={handleConfirmAttendance}
            disabled={loading}
            className="flex-1 h-12 bg-green-600 hover:bg-green-500 text-foreground font-semibold rounded-xl transition-all duration-200 hover:scale-[1.02]"
          >
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Confirmar Atendimento
          </Button>
          <Button
            onClick={handleNoShow}
            disabled={loading}
            variant="destructive"
            className="flex-1 h-12 rounded-xl font-semibold transition-all duration-200 hover:scale-[1.02]"
          >
            <XCircle className="w-4 h-4 mr-2" />
            Não Compareceu
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
