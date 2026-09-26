import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { useCancelarTodosAgendamentos } from "@/hooks/useAdminMutations";

interface CancelAllAppointmentsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date;
  appointmentsCount: number;
  onSuccess: () => void;
}

export function CancelAllAppointmentsModal({
  open,
  onOpenChange,
  date,
  appointmentsCount,
  onSuccess,
}: CancelAllAppointmentsModalProps) {
  const [reason, setReason] = useState("");
  const [fetching, setFetching] = useState(false);
  const cancelarTodos = useCancelarTodosAgendamentos();

  useEffect(() => {
    if (!open) {
      setReason("");
    }
  }, [open]);

  const handleCancelAll = async () => {
    if (!reason.trim()) {
      toast.error("Por favor, informe o motivo do cancelamento");
      return;
    }

    setFetching(true);
    try {
      const dateStr = format(date, 'yyyy-MM-dd');

      // Buscar IDs dos agendamentos ativos do dia
      const { data: appointments, error: fetchError } = await supabase
        .from("agendamentos")
        .select("id")
        .eq("data", dateStr)
        .eq("barbeiro_confirmou", true)
        .neq("status", "cancelled_by_admin")
        .neq("status", "cancelled_by_user");

      if (fetchError) throw fetchError;

      if (!appointments || appointments.length === 0) {
        toast.info("Não há agendamentos para cancelar neste dia");
        onOpenChange(false);
        return;
      }

      const ids = appointments.map((a) => a.id);

      // Delegar cancelamento atômico à Edge Function via mutation
      cancelarTodos.mutate(
        { appointmentIds: ids, reason: reason.trim() },
        {
          onSuccess: () => {
            setReason("");
            onOpenChange(false);
            setTimeout(() => onSuccess(), 500);
          },
        }
      );
    } catch (error: any) {
      console.error("Erro ao buscar agendamentos:", error);
      toast.error(error?.message || "Erro ao buscar agendamentos do dia.");
    } finally {
      setFetching(false);
    }
  };

  const isLoading = fetching || cancelarTodos.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            Cancelar Todos os Agendamentos
          </DialogTitle>
          <DialogDescription>
            Esta ação irá cancelar {appointmentsCount} agendamento(s) do dia{" "}
            {date.toLocaleDateString("pt-BR")}. Todos os clientes serão notificados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="reason">Motivo do Cancelamento *</Label>
            <Textarea
              id="reason"
              placeholder="Ex: Emergência pessoal, fechamento do estabelecimento, etc."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="mt-2"
            />
          </div>

          <div className="bg-destructive/10 p-3 rounded-md text-sm">
            ⚠️ <strong>Atenção:</strong> Esta ação não pode ser desfeita. Todos os{" "}
            <strong>{appointmentsCount} agendamento(s)</strong> serão cancelados e os clientes
            receberão uma notificação automática sobre o cancelamento.
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button
            onClick={() => onOpenChange(false)}
            variant="outline"
            disabled={isLoading}
          >
            Voltar
          </Button>
          <Button
            onClick={handleCancelAll}
            variant="destructive"
            disabled={isLoading || !reason.trim()}
          >
            {isLoading ? "Cancelando..." : "Confirmar Cancelamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
