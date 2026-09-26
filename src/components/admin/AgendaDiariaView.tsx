import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, User, CheckCircle, CreditCard, Crown } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isWhatsAppAppointment } from "@/lib/walkInName";
import { WhatsAppBadge } from "@/components/shared/WhatsAppBadge";

interface AgendaDiariaViewProps {
  date: Date;
  appointments: any[];
  onCancelAppointment: (id: string) => void;
}

interface BusinessHoursConfig {
  aberto: boolean;
  hora_abertura: string;
  hora_fechamento: string;
  hora_almoco_inicio: string | null;
  hora_almoco_fim: string | null;
  delay_entre_servicos: number;
}

// Helper function: convert HH:MM to minutes
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function AgendaDiariaView({ date, appointments, onCancelAppointment }: AgendaDiariaViewProps) {
  const [clickedUnavailableSlot, setClickedUnavailableSlot] = useState<string | null>(null);
  const [businessHours, setBusinessHours] = useState<BusinessHoursConfig | null>(null);

  // Fetch business hours from database
  useEffect(() => {
    const fetchBusinessHours = async () => {
      const dayOfWeek = date.getDay();
      
      const { data: configData, error } = await supabase
        .from('configuracoes_horario')
        .select('aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, delay_entre_servicos')
        .eq('dia_semana', dayOfWeek)
        .maybeSingle();

      if (error) {
        console.error('[AgendaDiariaView] Erro ao buscar config:', error);
      }

      // Use database config or fallback
      const config: BusinessHoursConfig = configData ? {
        aberto: configData.aberto,
        hora_abertura: configData.hora_abertura,
        hora_fechamento: configData.hora_fechamento,
        hora_almoco_inicio: configData.hora_almoco_inicio,
        hora_almoco_fim: configData.hora_almoco_fim,
        delay_entre_servicos: configData.delay_entre_servicos || 10
      } : {
        aberto: dayOfWeek !== 0,
        hora_abertura: '09:00',
        hora_fechamento: '21:00',
        hora_almoco_inicio: '13:00',
        hora_almoco_fim: '14:00',
        delay_entre_servicos: 10
      };

      console.log(`[AgendaDiariaView] Config do dia ${dayOfWeek}: ${config.hora_abertura} - ${config.hora_fechamento}`);
      setBusinessHours(config);
    };

    fetchBusinessHours();
  }, [date]);

  // Generate all time slots based on business hours (every 30 minutes)
  const timeSlots = useMemo(() => {
    if (!businessHours) return [];
    
    const slots: string[] = [];
    const openMinutes = timeToMinutes(businessHours.hora_abertura);
    const closeMinutes = timeToMinutes(businessHours.hora_fechamento);
    
    for (let minutes = openMinutes; minutes <= closeMinutes; minutes += 30) {
      const hour = Math.floor(minutes / 60);
      const min = minutes % 60;
      slots.push(`${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`);
    }
    
    return slots;
  }, [businessHours]);

  const getAppointmentForSlot = (slot: string) => {
    return appointments.find(apt => apt.hora === slot || apt.hora === slot + ":00");
  };

  // Check if a slot is blocked by another appointment's duration
  const isSlotBlockedByDuration = (slot: string): boolean => {
    if (!businessHours) return false;
    
    const [slotHour, slotMin] = slot.split(':').map(Number);
    const slotStart = slotHour * 60 + slotMin;
    const bufferTime = businessHours.delay_entre_servicos;

    for (const apt of appointments) {
      const [aptHour, aptMin] = apt.hora.split(':').map(Number);
      const aptStart = aptHour * 60 + aptMin;
      const duration = apt.servico?.duracao_minutos || apt.duracao || 30;
      const aptEnd = aptStart + duration + bufferTime;

      if (slotStart > aptStart && slotStart < aptEnd) {
        return true;
      }
    }

    return false;
  };

  // Check if slot is during lunch break
  const isLunchBreak = (slot: string): boolean => {
    if (!businessHours || !businessHours.hora_almoco_inicio || !businessHours.hora_almoco_fim) {
      return false;
    }
    
    const [hour, min] = slot.split(':').map(Number);
    const slotMinutes = hour * 60 + min;
    const lunchStart = timeToMinutes(businessHours.hora_almoco_inicio);
    const lunchEnd = timeToMinutes(businessHours.hora_almoco_fim);
    
    return slotMinutes >= lunchStart && slotMinutes < lunchEnd;
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "confirmed":
        return { label: "Agendado", className: "bg-green-500/20 text-green-500" };
      case "completed":
        return { label: "Concluído", className: "bg-gold/20 text-gold" };
      case "pending":
        return { label: "Pendente", className: "bg-yellow-500/20 text-yellow-500" };
      case "cancelled_by_user":
        return { label: "Cancelado", className: "bg-red-500/20 text-red-500" };
      case "cancelled_by_admin":
        return { label: "Cancelado (Admin)", className: "bg-red-500/20 text-red-500" };
      default:
        return { label: status, className: "bg-muted text-muted-foreground" };
    }
  };

  const getPaymentBadge = (appointment: any) => {
    const payment = appointment.pagamentos?.[0];
    if (!payment) return null;

    const methodLabel = {
      'pix': 'PIX',
      'card': 'Cartão',
      'cash': 'Dinheiro'
    }[payment.metodo] || payment.metodo;

    const statusConfig = {
      'paid': { label: 'Pago', className: 'bg-green-500/20 text-green-600' },
      'pending': { label: 'Pendente', className: 'bg-yellow-500/20 text-yellow-600' },
      'failed': { label: 'Falhou', className: 'bg-red-500/20 text-red-600' },
    }[payment.status] || { label: payment.status, className: 'bg-muted text-muted-foreground' };

    return {
      text: `${methodLabel} - ${statusConfig.label}`,
      className: statusConfig.className
    };
  };

  if (!businessHours) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg">
        {format(date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })} - Visão Diária Completa
      </h3>
      
      {/* Horário de funcionamento */}
      <p className="text-sm text-muted-foreground">
        Horário: {businessHours.hora_abertura} às {businessHours.hora_fechamento}
        {businessHours.hora_almoco_inicio && businessHours.hora_almoco_fim && 
          ` • Almoço: ${businessHours.hora_almoco_inicio} às ${businessHours.hora_almoco_fim}`
        }
      </p>

      {/* Mensagem de slot indisponível */}
      {clickedUnavailableSlot && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-center">
          <p className="text-sm text-destructive font-medium">
            Este horário já foi agendado.
          </p>
        </div>
      )}

      <div className="grid gap-2">
        {timeSlots.map((slot) => {
          const appointment = getAppointmentForSlot(slot);
          const statusConfig = appointment ? getStatusConfig(appointment.status) : null;
          const lunchBreak = isLunchBreak(slot);
          const isBlockedByDuration = !appointment && isSlotBlockedByDuration(slot);

          // Render lunch break
          if (lunchBreak) {
            return (
              <Card key={slot} className="p-4 border-border/30 opacity-40 bg-amber-500/5">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span className="font-semibold text-sm text-muted-foreground">{slot}</span>
                  </div>
                  <span className="text-sm text-muted-foreground italic">Horário de almoço</span>
                </div>
              </Card>
            );
          }

          return (
            <Card 
              key={slot} 
              className={cn(
                "p-4",
                appointment 
                  ? "border-primary/30" 
                  : isBlockedByDuration
                    ? "border-border/30 opacity-30 bg-muted/10"
                    : "border-border/30 opacity-60"
              )}
              onClick={() => {
                if (isBlockedByDuration) {
                  setClickedUnavailableSlot(slot);
                  toast.error("Este horário já foi agendado.");
                  setTimeout(() => setClickedUnavailableSlot(null), 3000);
                }
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span className={cn(
                      "font-semibold text-sm",
                      isBlockedByDuration && "text-muted-foreground/50"
                    )}>{slot}</span>
                  </div>

                  {appointment ? (
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-medium text-sm">{appointment.servico?.nome || "Serviço"}</span>
                        <Badge variant="outline" className="text-xs">
                          {appointment.servico?.duracao_minutos || appointment.duracao || 30} min
                        </Badge>
                        {statusConfig && (
                          <Badge variant="outline" className={`text-xs ${statusConfig.className}`}>
                            {statusConfig.label}
                          </Badge>
                        )}
                        {appointment.tipo_agendamento === 'plano' || appointment.payment_method === 'plano' ? (
                          <Badge variant="outline" className="bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30 flex items-center gap-1 font-medium px-2 py-0.5">
                            <Crown className="w-3 h-3 fill-purple-400/20" />
                            PLANO
                          </Badge>
                        ) : (
                          <>
                            {getPaymentBadge(appointment) && (
                              <Badge variant="outline" className={`text-xs ${getPaymentBadge(appointment)?.className}`}>
                                {getPaymentBadge(appointment)?.text}
                              </Badge>
                            )}
                            <div className="flex items-center gap-1 text-xs text-muted-foreground ml-1">
                              <CreditCard className="w-3 h-3" />
                              <span className="font-medium text-foreground">R$ {Number(appointment.preco || 0).toFixed(2).replace('.', ',')}</span>
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <User className="w-3 h-3" />
                        <span className="truncate">{appointment.profile?.nome || "Cliente"}</span>
                        {isWhatsAppAppointment(appointment.observacoes) && <WhatsAppBadge />}
                        {appointment.cliente_confirmou && (
                          <span className="flex items-center gap-1 text-green-600">
                            <CheckCircle className="w-3 h-3" />
                            Cliente confirmou
                          </span>
                        )}
                        {appointment.barbeiro_confirmou && (
                          <span className="flex items-center gap-1 text-green-600">
                            <CheckCircle className="w-3 h-3" />
                            Barbeiro confirmou
                          </span>
                        )}
                      </div>
                    </div>
                  ) : isBlockedByDuration ? (
                    <span className="text-sm text-muted-foreground/50 italic">Ocupado (serviço em andamento)</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Horário livre</span>
                  )}
                </div>

                {appointment && appointment.status !== "cancelled_by_admin" && appointment.status !== "cancelled_by_user" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onCancelAppointment(appointment.id)}
                  >
                    Cancelar
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
