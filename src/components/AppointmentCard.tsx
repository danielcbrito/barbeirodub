import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, CheckCircle, AlertCircle, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CancelAppointmentModal } from "./CancelAppointmentModal";

interface Appointment {
  id: string;
  data: string;
  hora: string;
  servico: { nome: string };
  status: string;
  duracao?: number;
  preco?: number;
  observacoes?: string;
  cliente_confirmou?: boolean;
  barbeiro_confirmou?: boolean;
  ponto_liberado?: boolean;
  cancelado_em?: string;
  visivel_para_usuario?: boolean;
  remarcacao_solicitada?: boolean;
  motivo_remarcacao?: string;
  pagamentos?: Array<{
    metodo: string;
    status: string;
  }>;
}

interface AppointmentCardProps {
  appointment: Appointment;
  onCancel?: () => void;
  onConfirm?: (id: string) => void;
  userId?: string;
  payments?: any[];
}

export function AppointmentCard({ 
  appointment, 
  onCancel, 
  onConfirm,
  userId,
  payments = []
}: AppointmentCardProps) {
  const [cancelModalOpen, setCancelModalOpen] = useState(false);

  const getStatusConfig = (status: string, barbeiroConfirmou: boolean | undefined) => {
    if (status === "pending" && !barbeiroConfirmou) {
      return { 
        label: "Aguardando Confirmação", 
        className: "bg-yellow-500/20 text-yellow-600 border-yellow-500/30",
        message: "Seu agendamento está em análise. Aguarde a aprovação da barbearia."
      };
    }
    
    switch (status) {
      case "confirmed":
        return { label: "Agendado", className: "bg-green-500/20 text-green-500 border-green-500/30" };
      case "completed":
        return { label: "Concluído", className: "bg-gold/20 text-gold border-gold/30" };
      case "pending":
        return { label: "Pendente", className: "bg-yellow-500/20 text-yellow-500 border-yellow-500/30" };
      case "cancelled_by_user":
        return { label: "Cancelado", className: "bg-red-600/30 text-red-500 border-red-500/50" };
      case "cancelled_by_admin":
        return { label: "Recusado", className: "bg-red-600/30 text-red-500 border-red-500/50" };
      default:
        return { label: status, className: "bg-muted text-muted-foreground border-muted" };
    }
  };

  const statusConfig = getStatusConfig(appointment.status, appointment.barbeiro_confirmou);
  const isCancelled = appointment.status === "cancelled_by_user" || appointment.status === "cancelled_by_admin";
  const isCancelledByAdmin = appointment.status === "cancelled_by_admin";
  const isAwaitingBarberApproval = appointment.status === "pending" && !appointment.barbeiro_confirmou;
  const rescheduleRequested = appointment.remarcacao_solicitada === true;
  const canCancel = (appointment.status === "pending" || appointment.status === "confirmed") && !isAwaitingBarberApproval && !rescheduleRequested;
  const needsConfirmation = appointment.status === "completed" && !appointment.cliente_confirmou && onConfirm;

  // Verificar pagamento tanto no array de pagamentos externos quanto no próprio agendamento
  const externalPayment = payments.find(p => p.agendamento_id === appointment.id);
  const inlinePayment = appointment.pagamentos?.find(p => p.status === "paid");
  const isPaid = externalPayment?.status === "paid" || !!inlinePayment;
  const amount = appointment.preco || 0;

  // Extrair motivo do cancelamento das observações
  const cancellationReason = appointment.observacoes?.includes("Cancelado em massa:") 
    ? appointment.observacoes.replace("Cancelado em massa: ", "")
    : appointment.observacoes?.includes("Cancelamento definitivo:")
    ? appointment.observacoes.replace("Cancelamento definitivo: ", "")
    : null;

  return (
    <>
      <Card className="p-4 bg-card border-border/50 hover:border-primary/30 transition-colors">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Badge className={statusConfig.className}>
                {statusConfig.label}
              </Badge>
              {isPaid && (
                <span className="text-xs text-green-600 font-medium">
                  Pagamento confirmado
                </span>
              )}
            </div>
            <h3 className="font-semibold text-foreground">{appointment.servico?.nome || "Serviço"}</h3>
          </div>
        </div>

        <div className="space-y-2 text-sm text-muted-foreground mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            <span>
              {format(new Date(`${appointment.data}T12:00:00`), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            <span>{appointment.hora}</span>
          </div>
          {typeof appointment.preco === 'number' && !isNaN(appointment.preco) && (
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">
                R$ {appointment.preco.toFixed(2).replace('.', ',')}
              </span>
            </div>
          )}
          
          {isAwaitingBarberApproval && statusConfig.message && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 p-3 rounded-lg mt-3">
              <p className="text-xs text-yellow-700 dark:text-yellow-400 font-medium">
                {statusConfig.message}
              </p>
            </div>
          )}

          {rescheduleRequested && !isCancelled && (
            <div className="bg-destructive/10 border border-destructive/30 p-4 rounded-lg mt-3 space-y-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-destructive mb-2">
                    Alteração solicitada pela barbearia
                  </p>
                  {appointment.motivo_remarcacao && (
                    <div className="bg-background/70 p-3 rounded-md mb-3">
                      <p className="text-xs font-medium text-foreground mb-1">Mensagem do barbeiro:</p>
                      <p className="text-xs text-muted-foreground whitespace-pre-line">
                        {appointment.motivo_remarcacao}
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <Button
                onClick={() => setCancelModalOpen(true)}
                size="sm"
                variant="outline"
                className="w-full border-destructive/30 text-destructive hover:bg-destructive/10"
              >
                <X className="w-4 h-4 mr-2" />
                Cancelar agendamento
              </Button>
            </div>
          )}

          {isCancelledByAdmin && cancellationReason && (
            <div className="bg-destructive/10 border border-destructive/30 p-4 rounded-lg mt-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-destructive mb-1">
                    Agendamento cancelado pela barbearia
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <strong>Motivo:</strong> {cancellationReason}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {needsConfirmation && (
          <Button 
            onClick={() => onConfirm?.(appointment.id)}
            size="sm"
            className="w-full mb-2"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Confirmar Presença
          </Button>
        )}

        {canCancel && !isCancelledByAdmin && !rescheduleRequested && (
          <Button 
            onClick={() => setCancelModalOpen(true)}
            size="sm"
            variant="outline"
            className="w-full border-destructive/30 text-destructive hover:bg-destructive/10"
            disabled={isAwaitingBarberApproval}
          >
            <X className="w-4 h-4 mr-2" />
            Cancelar
          </Button>
        )}

        {isCancelled && !cancellationReason && (
          <div className="text-xs text-muted-foreground text-center py-2">
            Cancelado em {appointment.cancelado_em ? format(new Date(appointment.cancelado_em), "dd/MM/yyyy", { locale: ptBR }) : "—"}
          </div>
        )}
      </Card>

      {/* Modal de cancelamento */}

      <CancelAppointmentModal
        open={cancelModalOpen}
        onOpenChange={setCancelModalOpen}
        appointmentId={appointment.id}
        isPaid={isPaid}
        amount={amount}
        userId={userId || ""}
        paymentMethod={(appointment as any).payment_method}
        observacoes={appointment.observacoes}
        onSuccess={() => {
          setCancelModalOpen(false);
          onCancel?.();
        }}
      />
    </>
  );
}
