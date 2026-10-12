import { Clock, Calendar, CreditCard } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

interface PendingBooking {
  id: string;
  data: string;
  hora: string;
  servico_id: string;
  preco: number;
  payment_method?: string;
  created_at: string;
  servico?: { nome: string };
}

interface PendingPaymentCardProps {
  booking: PendingBooking;
  onResumePayment: (bookingId: string) => void;
  onCancel: (bookingId: string) => void;
  index?: number;
}

export function PendingPaymentCard({ 
  booking, 
  onResumePayment, 
  onCancel,
  index = 0 
}: PendingPaymentCardProps) {
  const appointmentDate = new Date(`${booking.data}T12:00:00`);

  return (
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
              {booking.servico?.nome || "Serviço"}
            </h3>
            <div 
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
              style={{
                background: "rgba(245, 158, 11, 0.1)",
                color: "#F59E0B",
                border: "1px solid rgba(245, 158, 11, 0.3)",
              }}
            >
              <CreditCard className="w-3 h-3" />
              Aguardando Pagamento
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
              {format(appointmentDate, "MMM", { locale: ptBR })}
            </p>
            <p className="text-lg font-bold text-foreground leading-none">
              {format(appointmentDate, "dd", { locale: ptBR })}
            </p>
          </div>
        </div>

        {/* Details */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-primary/70" />
            <span className="font-medium">{booking.hora}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-foreground">
              R$ {booking.preco.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Info message */}
        <div 
          className="mb-4 p-3 rounded-xl"
          style={{
            background: "hsl(var(--secondary))",
          }}
        >
          <p className="text-xs text-muted-foreground">
            Seu horário está reservado temporariamente. Complete o pagamento para confirmar o agendamento.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button 
            onClick={() => onResumePayment(booking.id)}
            size="sm"
            className="flex-1 h-10 rounded-xl"
          >
            Finalizar Pagamento
          </Button>
          <Button 
            onClick={() => onCancel(booking.id)}
            size="sm"
            variant="outline"
            className="flex-1 h-10 rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10"
          >
            Cancelar
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
