import { useState, useMemo } from "react";
import { Clock, Check, AlertCircle, X, Star } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { CancelAppointmentModal } from "@/components/CancelAppointmentModal";

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
  tipo_agendamento?: string;
}

interface AppointmentCardPremiumProps {
  appointment: Appointment;
  onCancel?: () => void;
  onConfirm?: (id: string) => void;
  userId?: string;
  payments?: any[];
  index?: number;
}

export function AppointmentCardPremium({ 
  appointment, 
  onCancel, 
  onConfirm,
  userId,
  payments = [],
  index = 0
}: AppointmentCardPremiumProps) {
  const [cancelModalOpen, setCancelModalOpen] = useState(false);

  const getStatusConfig = (status: string, barbeiroConfirmou: boolean | undefined) => {
    if (status === "pending" && !barbeiroConfirmou) {
      return { 
        label: "Aguardando", 
        color: "hsl(40, 90%, 50%)",
        bgColor: "hsl(40, 90%, 50%, 0.1)",
        borderColor: "hsl(40, 90%, 50%, 0.3)",
        icon: Clock,
      };
    }
    
    switch (status) {
      case "confirmed":
        return { 
          label: "Agendado", 
          color: "hsl(160, 70%, 40%)",
          bgColor: "hsl(160, 70%, 40%, 0.1)",
          borderColor: "hsl(160, 70%, 40%, 0.3)",
          icon: Check,
        };
      case "completed":
        return { 
          label: "Concluído", 
          color: "hsl(40, 50%, 55%)",
          bgColor: "hsl(40, 50%, 55%, 0.1)",
          borderColor: "hsl(40, 50%, 55%, 0.3)",
          icon: Check,
        };
      case "cancelled_by_user":
      case "cancelled_by_admin":
        return { 
          label: "Cancelado", 
          color: "hsl(var(--destructive))",
          bgColor: "hsl(var(--destructive) / 0.1)",
          borderColor: "hsl(var(--destructive) / 0.3)",
          icon: X,
        };
      default:
        return { 
          label: status, 
          color: "hsl(var(--muted-foreground))",
          bgColor: "hsl(var(--muted-foreground) / 0.1)",
          borderColor: "hsl(var(--muted-foreground) / 0.3)",
          icon: Clock,
        };
    }
  };

  const statusConfig = getStatusConfig(appointment.status, appointment.barbeiro_confirmou);
  const StatusIcon = statusConfig.icon;
  const isCancelled = appointment.status === "cancelled_by_user" || appointment.status === "cancelled_by_admin";
  const isAwaitingBarberApproval = appointment.status === "pending" && !appointment.barbeiro_confirmou;
  const rescheduleRequested = appointment.remarcacao_solicitada === true;
  const canCancel = (appointment.status === "pending" || appointment.status === "confirmed") && !isAwaitingBarberApproval && !rescheduleRequested;
  const needsConfirmation = appointment.status === "completed" && !appointment.cliente_confirmou && onConfirm;

  const externalPayment = payments.find(p => p.agendamento_id === appointment.id);
  const inlinePayment = appointment.pagamentos?.find(p => p.status === "paid");
  const isPaid = externalPayment?.status === "paid" || !!inlinePayment;
  const amount = appointment.preco || 0;

  const formattedDate = format(new Date(`${appointment.data}T12:00:00`), "dd MMM", { locale: ptBR });
  const formattedFullDate = format(new Date(`${appointment.data}T12:00:00`), "EEEE, dd 'de' MMMM", { locale: ptBR });

  const isPlanAppointment = appointment.tipo_agendamento === "assinatura" || appointment.tipo_agendamento === "plano" || appointment.tipo_agendamento === "assinatura_silenciosa" || appointment.tipo_agendamento === "plano_registro_interno" || (appointment.status === "completed" && appointment.preco === 0 && !appointment.observacoes?.includes("fidelidade"));

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.1, duration: 0.3 }}
        className="rounded-2xl overflow-hidden"
        style={{
          background: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)",
        }}
      >
        <div className="p-4">
          {/* Header with status */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <h3 className="font-bold text-foreground text-base mb-1">
                {appointment.servico?.nome || "Serviço"}
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <div 
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                  style={{
                    background: statusConfig.bgColor,
                    color: statusConfig.color,
                    border: `1px solid ${statusConfig.borderColor}`,
                  }}
                >
                  <StatusIcon className="w-3 h-3" />
                  {statusConfig.label}
                </div>
                
                {isPlanAppointment && (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-primary/15 text-primary border border-primary/30 uppercase tracking-tight">
                    <Star className="w-2.5 h-2.5 fill-current" />
                    Plano
                  </div>
                )}
              </div>
            </div>

            {/* Date badge */}
            <div 
              className="text-center px-3 py-2 rounded-xl"
              style={{
                background: "hsl(var(--secondary))",
              }}
            >
              <p className="text-[10px] text-muted-foreground uppercase font-medium">
                {format(new Date(`${appointment.data}T12:00:00`), "MMM", { locale: ptBR })}
              </p>
              <p className="text-lg font-bold text-foreground leading-none">
                {format(new Date(`${appointment.data}T12:00:00`), "dd", { locale: ptBR })}
              </p>
            </div>
          </div>

          {/* Details */}
          <div className="flex flex-col gap-2 text-sm text-muted-foreground mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-primary/70" />
                  <span className="font-medium">{appointment.hora}</span>
                </div>
                {(appointment as any).barbeiros?.apelido && (
                  <div className="flex items-center gap-1.5">
                    <span className="w-1 h-3 bg-border rounded-full" />
                    <span className="text-[11px] uppercase tracking-wider font-semibold opacity-70">
                      {(appointment as any).barbeiros.apelido}
                    </span>
                  </div>
                )}
              </div>

              {appointment.preco !== undefined && (
                <div className="flex items-center gap-1.5">
                  {isPlanAppointment ? (
                    <div className="flex items-center gap-1 text-primary font-bold">
                      <Star className="w-3 h-3 fill-current" />
                      <span>Plano</span>
                    </div>
                  ) : (
                    <>
                      <span className="font-bold text-foreground">
                        R$ {appointment.preco.toFixed(2)}
                      </span>
                      {isPaid && (
                        <span className="text-[10px] text-green-500 font-medium">• Pago</span>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
            
            <p className="text-[10px] text-muted-foreground/60 italic leading-none">
              Barbearia Dub
            </p>
          </div>

          {/* Alteração solicitada */}
          {rescheduleRequested && !isCancelled && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/30"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-destructive mb-1">
                    Alteração solicitada pela barbearia
                  </p>
                  {appointment.motivo_remarcacao && (
                    <p className="text-xs text-muted-foreground mb-3">
                      {appointment.motivo_remarcacao}
                    </p>
                  )}
                </div>
              </div>
              <Button
                onClick={() => setCancelModalOpen(true)}
                size="sm"
                variant="outline"
                className="w-full mt-2 h-9 border-destructive/30 text-destructive hover:bg-destructive/10"
              >
                <X className="w-4 h-4 mr-2" />
                Cancelar agendamento
              </Button>
            </motion.div>
          )}

          {/* Confirmation needed */}
          {needsConfirmation && (
            <Button 
              onClick={() => onConfirm?.(appointment.id)}
              size="sm"
              className="w-full mb-3 h-10"
            >
              <Check className="w-4 h-4 mr-2" />
              Confirmar Presença
            </Button>
          )}

          {/* Action button */}
          {canCancel && !rescheduleRequested && (
            <Button 
              onClick={() => setCancelModalOpen(true)}
              size="sm"
              variant="outline"
              className="w-full h-10 rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
          )}
        </div>
      </motion.div>

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
