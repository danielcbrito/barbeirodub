import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Calendar } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface CancelledAppointmentBannerProps {
  reason: string;
  serviceName: string;
  date: string;
  time: string;
}

export function CancelledAppointmentBanner({
  reason,
  serviceName,
  date,
  time,
}: CancelledAppointmentBannerProps) {
  const navigate = useNavigate();

  return (
    <Card className="border-l-4 border-l-destructive bg-destructive/5 p-6 mb-6">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-6 h-6 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-bold text-lg text-destructive mb-2">
              Agendamento Cancelado pela Barbearia
            </h3>
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                <strong>Serviço:</strong> {serviceName}
              </p>
              <p className="text-muted-foreground">
                <strong>Data e Horário:</strong> {new Date(date).toLocaleDateString("pt-BR")} às {time}
              </p>
              <div className="bg-background/80 p-3 rounded-md mt-3">
                <p className="text-xs font-semibold text-foreground mb-1">
                  Motivo do Cancelamento:
                </p>
                <p className="text-sm text-foreground">{reason}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-primary/10 border border-primary/30 rounded-md p-3 text-sm">
          <p className="text-foreground">
            💡 <strong>Não se preocupe!</strong> Você pode escolher um novo horário disponível
            a qualquer momento. Clique no botão abaixo para agendar novamente.
          </p>
        </div>

        <Button
          onClick={() => navigate("/cliente/agendar")}
          className="w-full"
          size="lg"
        >
          <Calendar className="w-5 h-5 mr-2" />
          Agendar novo horário
        </Button>
      </div>
    </Card>
  );
}
