import { useState, useEffect } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { AlertTriangle, XCircle, Scissors, Clock, Send } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { sendAgendamentoCanceladoEvent } from "@/lib/webhookService";
import { useCancelarAgendamentoAdmin } from "@/hooks/useAdminMutations";

interface AdminRescheduleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string;
  userId: string;
  serviceName: string;
  currentDate: string;
  currentTime: string;
  appointmentPrice?: number;
  onSuccess: () => void;
}

export function AdminRescheduleModal({
  open,
  onOpenChange,
  appointmentId,
  userId,
  serviceName,
  currentDate,
  currentTime,
  onSuccess,
}: AdminRescheduleModalProps) {
  const [reason, setReason] = useState("");
  const cancelarMutation = useCancelarAgendamentoAdmin();

  useEffect(() => {
    if (!open) {
      setReason("");
    }
  }, [open]);

  const formattedDate = format(new Date(`${currentDate}T12:00:00`), "dd 'de' MMMM", { locale: ptBR });
  const horaFormatted = currentTime.substring(0, 5);

  const handleCancel = () => {
    if (!reason.trim()) {
      toast.error("Informe o motivo do cancelamento.");
      return;
    }

    cancelarMutation.mutate(
      { appointmentIds: [appointmentId], reason: reason.trim() },
      {
        onSuccess: () => {
          // Webhook fire-and-forget (não bloqueia)
          sendAgendamentoCanceladoEvent({
            agendamento_id: appointmentId,
            cliente_id: userId,
            servico: serviceName,
            data: currentDate,
            hora: currentTime,
            mensagem_barbeiro: reason,
          });

          onOpenChange(false);
          onSuccess();
        },
      }
    );
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
                O cliente será notificado automaticamente
              </DrawerDescription>
            </div>
          </div>
        </DrawerHeader>

        <div className="px-4 pb-2 space-y-4">
          {/* Info card */}
          <div className="rounded-xl bg-muted/40 border border-border/30 p-3.5 space-y-2.5">
            <div className="flex items-center gap-2.5">
              <Scissors className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-[13px] font-medium text-foreground">{serviceName}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-[13px] text-foreground/80 font-mono tabular-nums">
                {formattedDate} · {horaFormatted}
              </span>
            </div>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2.5 rounded-xl bg-destructive/8 border border-destructive/15 p-3.5">
            <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-[12px] text-destructive/90 leading-relaxed">
              Esta ação é irreversível. O agendamento será cancelado e uma notificação será enviada ao cliente.
            </p>
          </div>

          {/* Reason input */}
          <div className="space-y-2">
            <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Motivo do cancelamento *
            </label>
            <Textarea
              placeholder="Ex: Conflito de horários, emergência, etc."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="rounded-xl bg-muted/30 border-border/30 text-[13px] placeholder:text-muted-foreground/40 resize-none focus:border-destructive/40 focus:ring-destructive/20"
            />
          </div>
        </div>

        <DrawerFooter className="pt-2 pb-6 gap-2.5">
          <Button
            onClick={handleCancel}
            disabled={cancelarMutation.isPending || reason.trim().length === 0}
            variant="destructive"
            className="w-full h-12 rounded-xl text-[13px] font-semibold tracking-wide gap-2"
          >
            {cancelarMutation.isPending ? (
              "Cancelando..."
            ) : (
              <>
                <Send className="w-4 h-4" />
                Confirmar Cancelamento
              </>
            )}
          </Button>
          <Button
            onClick={() => onOpenChange(false)}
            variant="outline"
            disabled={cancelarMutation.isPending}
            className="w-full h-11 rounded-xl text-[13px] font-medium border-border/40"
          >
            Voltar
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
