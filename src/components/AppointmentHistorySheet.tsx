import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AppointmentHistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId?: string;
}

interface HistoryAppointment {
  id: string;
  data: string;
  hora: string;
  servico: { nome: string };
  status: string;
  preco?: number;
}

export function AppointmentHistorySheet({ 
  open, 
  onOpenChange, 
  userId 
}: AppointmentHistorySheetProps) {
  const [appointments, setAppointments] = useState<HistoryAppointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && userId) {
      loadHistory();
    }
  }, [open, userId]);

  const loadHistory = async () => {
    if (!userId) return;
    
    setLoading(true);
    const { data } = await supabase
      .from("agendamentos")
      .select(`
        id,
        data,
        hora,
        status,
        preco,
        servico:servicos(nome)
      `)
      .eq("user_id", userId)
      .in("status", ["completed", "cancelled_by_admin", "cancelled_by_user", "no_show"])
      .order("data", { ascending: false })
      .limit(50);

    setAppointments(data || []);
    setLoading(false);
  };

  const completedCount = appointments.filter(a => a.status === "completed").length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="text-lg">Histórico de Agendamentos</SheetTitle>
          <SheetDescription className="text-xs">
            {completedCount} {completedCount === 1 ? 'corte realizado' : 'cortes realizados'} no total
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-3 max-h-[60vh] overflow-y-auto pr-2">
          {loading ? (
            <div className="text-center py-8">
              <p className="text-xs text-muted-foreground">Carregando...</p>
            </div>
          ) : appointments.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-xs text-muted-foreground">
                Nenhum histórico encontrado
              </p>
            </div>
          ) : (
            appointments.map((apt) => {
              const isCompleted = apt.status === "completed";
              
              return (
                <Card 
                  key={apt.id} 
                  className={`p-4 border-border/50 ${isCompleted ? 'bg-gold/5' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {isCompleted && <CheckCircle className="w-3 h-3 text-gold shrink-0" />}
                        <p className="font-semibold text-sm truncate">{apt.servico.nome}</p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(`${apt.data}T12:00:00`), "dd/MM/yyyy", { locale: ptBR })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {apt.hora}
                        </span>
                      </div>
                      {apt.preco && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(apt.preco))}
                        </p>
                      )}
                    </div>
                    <Badge 
                      variant="outline" 
                      className={`text-[10px] px-2 py-0.5 shrink-0 ${
                        isCompleted 
                          ? 'bg-gold/20 text-gold border-gold/30' 
                          : apt.status === 'cancelled_by_user' || apt.status === 'cancelled_by_admin'
                          ? 'bg-destructive/20 text-destructive border-destructive/30'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {isCompleted 
                        ? 'Concluído' 
                        : apt.status === 'cancelled_by_user' 
                        ? 'Cancelado' 
                        : apt.status === 'cancelled_by_admin'
                        ? 'Cancelado pelo Admin'
                        : apt.status === 'no_show'
                        ? 'Não Compareceu'
                        : apt.status}
                    </Badge>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
