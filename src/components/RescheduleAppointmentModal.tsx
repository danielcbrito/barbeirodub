import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Calendar } from "lucide-react";

interface RescheduleAppointmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string;
  currentDate: string;
  currentTime: string;
  serviceName: string;
}

export function RescheduleAppointmentModal({
  open,
  onOpenChange,
  appointmentId,
  currentDate,
  currentTime,
  serviceName,
}: RescheduleAppointmentModalProps) {
  const navigate = useNavigate();

  const handleReschedule = () => {
    // Armazenar o ID do agendamento que será remarcado
    sessionStorage.setItem('rescheduleAppointmentId', appointmentId);
    sessionStorage.setItem('isRescheduling', 'true');
    
    // Navegar para a tela de agendamento
    navigate("/cliente/agendar");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Remarcar Agendamento
          </DialogTitle>
          <DialogDescription>
            Você será direcionado para escolher uma nova data e horário.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="p-4 bg-muted rounded-lg space-y-2">
            <p className="text-sm font-medium">Agendamento atual:</p>
            <p className="text-sm text-muted-foreground">
              <strong>Serviço:</strong> {serviceName}
            </p>
            <p className="text-sm text-muted-foreground">
              <strong>Data:</strong> {new Date(currentDate).toLocaleDateString('pt-BR')}
            </p>
            <p className="text-sm text-muted-foreground">
              <strong>Horário:</strong> {currentTime}
            </p>
          </div>

          <div className="bg-primary/10 p-3 rounded-md text-sm">
            ℹ️ Seu agendamento será mantido até você confirmar a nova data. Se já foi pago, o pagamento permanecerá válido.
          </div>
          
          <div className="flex gap-3">
            <Button
              onClick={() => onOpenChange(false)}
              variant="outline"
              className="flex-1"
            >
              Cancelar
            </Button>
            
            <Button
              onClick={handleReschedule}
              className="flex-1"
            >
              Escolher Nova Data
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
