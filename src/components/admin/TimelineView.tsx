import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, User, CreditCard, AlertCircle, CheckCircle2, Crown } from "lucide-react";
import { TimelineAppointment } from "./AdminAgenda";
import { useMemo, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { isWhatsAppAppointment, resolveClienteDisplayName } from "@/lib/walkInName";
import { WhatsAppBadge } from "@/components/shared/WhatsAppBadge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface TimelineViewProps {
  appointments: TimelineAppointment[];
  loading: boolean;
  selectedDate: Date;
  onSelectAppointment: (appointment: TimelineAppointment) => void;
  onEmptySlotClick: (time: string) => void;
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

export function TimelineView({ appointments, loading, selectedDate, onSelectAppointment, onEmptySlotClick }: TimelineViewProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [clickedUnavailableSlot, setClickedUnavailableSlot] = useState<string | null>(null);
  const [businessHours, setBusinessHours] = useState<BusinessHoursConfig | null>(null);

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch business hours from database
  useEffect(() => {
    const fetchBusinessHours = async () => {
      const dayOfWeek = selectedDate.getDay();
      
      const { data: configData, error } = await supabase
        .from('configuracoes_horario')
        .select('aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, delay_entre_servicos')
        .eq('dia_semana', dayOfWeek)
        .maybeSingle();

      if (error) {
        console.error('[TimelineView] Erro ao buscar config:', error);
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

      console.log(`[TimelineView] Config do dia ${dayOfWeek}: ${config.hora_abertura} - ${config.hora_fechamento}`);
      setBusinessHours(config);
    };

    fetchBusinessHours();
  }, [selectedDate]);

  // Generate time slots based on business hours (every 10 minutes for precision)
  const timeSlots = useMemo(() => {
    if (!businessHours) return [];
    
    const slots: string[] = [];
    const openMinutes = timeToMinutes(businessHours.hora_abertura);
    const closeMinutes = timeToMinutes(businessHours.hora_fechamento);
    
    for (let minutes = openMinutes; minutes <= closeMinutes; minutes += 10) {
      const hour = Math.floor(minutes / 60);
      const min = minutes % 60;
      slots.push(`${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`);
    }
    
    return slots;
  }, [businessHours]);

  // Get the appointment that starts at this slot
  const getAppointmentForSlot = (slot: string) => {
    return appointments.find(apt => {
      // Normalizar hora do agendamento para comparação
      const aptHora = (apt.hora || "00:00").substring(0, 5); // Pegar só HH:MM
      return aptHora === slot;
    });
  };

  // Check if a slot is blocked by another appointment's duration (overlap check)
  const isSlotBlockedByDuration = (slot: string): { blocked: boolean; blockingAppointment: TimelineAppointment | null; nextFreeTime: string | null } => {
    if (!businessHours) return { blocked: false, blockingAppointment: null, nextFreeTime: null };
    
    const [slotHour, slotMin] = slot.split(':').map(Number);
    const slotStart = slotHour * 60 + slotMin;
    const DELAY_MINUTES = businessHours.delay_entre_servicos;

    for (const apt of appointments) {
      const [aptHour, aptMin] = (apt.hora || "00:00").split(':').map(Number);
      const aptStart = (aptHour || 0) * 60 + (aptMin || 0);
      const aptEnd = aptStart + (apt.servico?.duracao_minutos || 30);
      const aptEndWithDelay = aptEnd + DELAY_MINUTES;

      // REGRA CORRETA: Slot está bloqueado se começa antes do fim do agendamento + delay
      // E começa depois do início do agendamento (não é o próprio slot do agendamento)
      if (slotStart > aptStart && slotStart < aptEndWithDelay) {
        const nextFreeHour = Math.floor(aptEndWithDelay / 60);
        const nextFreeMin = aptEndWithDelay % 60;
        const nextFreeTime = `${nextFreeHour.toString().padStart(2, '0')}:${nextFreeMin.toString().padStart(2, '0')}`;
        
        return { blocked: true, blockingAppointment: apt, nextFreeTime };
      }
    }

    return { blocked: false, blockingAppointment: null, nextFreeTime: null };
  };

  // Check if slot is during lunch break
  const isLunchBreak = (slot: string): boolean => {
    if (!businessHours || !businessHours.hora_almoco_inicio || !businessHours.hora_almoco_fim) {
      return false;
    }
    
    const [hour, minute] = slot.split(':').map(Number);
    const slotMinutes = hour * 60 + minute;
    const lunchStart = timeToMinutes(businessHours.hora_almoco_inicio);
    const lunchEnd = timeToMinutes(businessHours.hora_almoco_fim);
    
    return slotMinutes >= lunchStart && slotMinutes < lunchEnd;
  };

  // Compara DATA + HORA completa para determinar status
  const getTimeStatus = (hora: string, appointmentDateStr?: string) => {
    const now = currentTime;
    const [hours, minutes] = hora.split(':').map(Number);
    
    // Usar a data do agendamento se disponível, senão usar a data selecionada na agenda
    let slotTime: Date;
    if (appointmentDateStr) {
      // Parse da data do agendamento (formato YYYY-MM-DD)
      const [year, month, day] = appointmentDateStr.split('-').map(Number);
      slotTime = new Date(year, month - 1, day, hours, minutes, 0, 0);
    } else {
      // Usar a data selecionada na agenda
      slotTime = new Date(selectedDate);
      slotTime.setHours(hours, minutes, 0, 0);
    }

    const diffMinutes = Math.floor((slotTime.getTime() - now.getTime()) / 60000);

    // Se a diferença for muito grande (mais de um dia no futuro), é futuro
    if (diffMinutes > 60 * 24) return "future";
    
    if (diffMinutes < -30) return "passed";
    if (diffMinutes <= 0) return "now";
    if (diffMinutes <= 10) return "soon";
    return "future";
  };

  const getServiceColor = (serviceName: string | undefined) => {
    if (!serviceName) return "bg-muted";
    
    const colors: Record<string, string> = {
      "corte": "bg-blue-500",
      "barba": "bg-amber-500",
      "combo": "bg-purple-500",
      "sobrancelha": "bg-pink-500",
      "pezinho": "bg-green-500",
    };

    const key = Object.keys(colors).find(k => serviceName.toLowerCase().includes(k));
    return key ? colors[key] : "bg-primary";
  };

  const getPaymentBadge = (appointment: TimelineAppointment) => {
    const payment = appointment.pagamentos?.[0];
    if (!payment) return { icon: AlertCircle, text: "Sem pagamento", className: "bg-red-500/20 text-red-600" };

    const methodLabel = {
      'pix': 'PIX',
      'card': 'Cartão',
      'cash': 'Dinheiro'
    }[payment.metodo] || payment.metodo;

    const statusConfig = {
      'paid': { icon: CheckCircle2, text: 'Pago', className: 'bg-green-500/20 text-green-600' },
      'pending': { icon: Clock, text: 'Pendente', className: 'bg-yellow-500/20 text-yellow-600' },
      'failed': { icon: AlertCircle, text: 'Falhou', className: 'bg-red-500/20 text-red-600' },
    }[payment.status] || { icon: AlertCircle, text: payment.status, className: 'bg-muted text-muted-foreground' };

    return {
      ...statusConfig,
      text: `${methodLabel} - ${statusConfig.text}`
    };
  };

  if (loading || !businessHours) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-2 pb-8">
      {/* Mensagem de slot indisponível */}
      {clickedUnavailableSlot && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-center mb-4">
          <p className="text-sm text-destructive font-medium">
            Este horário já foi agendado.
          </p>
        </div>
      )}

      {timeSlots.map((slot) => {
        const appointment = getAppointmentForSlot(slot);
        // Passar a data do agendamento para comparação correta
        const timeStatus = getTimeStatus(slot, appointment?.data);
        const paymentInfo = appointment ? getPaymentBadge(appointment) : null;
        const PaymentIcon = paymentInfo?.icon;
        const lunchBreak = isLunchBreak(slot);
        const { blocked: isBlockedByDuration, nextFreeTime } = !appointment ? isSlotBlockedByDuration(slot) : { blocked: false, nextFreeTime: null };

        // Render lunch break slots
        if (lunchBreak) {
          return (
            <Card 
              key={slot}
              className="p-4 transition-all duration-300 border-l-4 border-l-amber-500/50 opacity-40 bg-amber-500/5"
            >
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 min-w-[80px]">
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
              "p-4 transition-all duration-300 border-l-4",
              appointment 
                ? cn(
                    "cursor-pointer hover:shadow-lg hover:scale-[1.01]",
                    timeStatus === "now" && "border-l-green-500 bg-green-500/5 animate-pulse",
                    timeStatus === "soon" && "border-l-yellow-500 bg-yellow-500/5",
                    timeStatus === "passed" && appointment.status !== "completed" && "border-l-red-500 bg-red-500/5",
                    timeStatus === "future" && "border-l-primary/50",
                    appointment.status === "completed" && "border-l-blue-500 bg-blue-500/5 opacity-75"
                  )
                : isBlockedByDuration
                  ? "border-l-muted/30 opacity-30 cursor-not-allowed bg-muted/10"
                  : "border-l-border/30 opacity-60 hover:opacity-100 hover:bg-primary/5 cursor-pointer hover:border-l-primary"
            )}
            onClick={() => {
              if (appointment) {
                onSelectAppointment(appointment);
              } else if (isBlockedByDuration) {
                setClickedUnavailableSlot(slot);
                toast.error("Este horário já foi agendado.");
                setTimeout(() => setClickedUnavailableSlot(null), 3000);
              } else {
                setClickedUnavailableSlot(null);
                onEmptySlotClick(slot);
              }
            }}
          >
            <div className="flex items-center gap-4">
              {/* Time */}
              <div className="flex items-center gap-2 min-w-[80px]">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className={cn(
                  "font-semibold text-sm",
                  timeStatus === "now" && "text-green-500",
                  timeStatus === "soon" && "text-yellow-500",
                  isBlockedByDuration && "text-muted-foreground/50"
                )}>
                  {slot}
                </span>
              </div>

              {appointment ? (
                <div className="flex-1 flex items-center justify-between gap-4">
                  {/* Service indicator */}
                  <div className={cn(
                    "w-2 h-12 rounded-full",
                    getServiceColor(appointment.servico?.nome)
                  )} />

                  {/* Appointment info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">{appointment.servico?.nome || "Serviço"}</span>
                      <Badge variant="outline" className="text-xs">
                        {appointment.servico?.duracao_minutos || 0} min
                      </Badge>
                      {timeStatus === "now" && (
                        <Badge className="bg-green-500 text-foreground animate-pulse">
                          É AGORA
                        </Badge>
                      )}
                      {timeStatus === "soon" && (
                        <Badge className="bg-yellow-500 text-foreground">
                          Em breve
                        </Badge>
                      )}
                      {timeStatus === "passed" && appointment.status !== "completed" && (
                        <Badge variant="destructive">
                          Atrasado
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <User className="w-3 h-3" />
                        <span className="truncate">{resolveClienteDisplayName(appointment.observacoes, appointment.profile?.nome, "Cliente", appointment.cliente_nome)}</span>
                        {isWhatsAppAppointment(appointment.observacoes) && <WhatsAppBadge />}
                      </div>
                      
                      {appointment.is_free ? (
                        <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-foreground border-none shadow-sm font-medium">
                          Corte Grátis
                        </Badge>
                      ) : (
                        <>
                          {appointment.tipo_agendamento === 'plano' || appointment.payment_method === 'plano' ? (
                            <Badge variant="outline" className="bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30 flex items-center gap-1 font-medium px-2 py-0.5">
                              <Crown className="w-3 h-3 fill-purple-400/20" />
                              PLANO
                            </Badge>
                          ) : (
                            <>
                              {paymentInfo && PaymentIcon && (
                                <Badge variant="outline" className={paymentInfo.className}>
                                  <PaymentIcon className="w-3 h-3 mr-1" />
                                  {paymentInfo.text}
                                </Badge>
                              )}
                              <div className="flex items-center gap-2">
                                <CreditCard className="w-3 h-3" />
                                <span className="font-medium text-foreground">
                                  R$ {typeof appointment.preco === 'number' && !isNaN(appointment.preco) ? appointment.preco.toFixed(2).replace('.', ',') : '0,00'}
                                </span>
                              </div>
                            </>
                          )}
                        </>
                      )}

                      {appointment.cliente_confirmou && (
                        <Badge variant="outline" className="bg-green-500/20 text-green-600">
                          Cliente confirmou
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ) : isBlockedByDuration ? (
                <div className="flex items-center justify-between flex-1">
                  <span className="text-sm text-muted-foreground/50 italic">
                    Ocupado (serviço em andamento)
                    {nextFreeTime && <span className="ml-2 text-xs">• Livre às {nextFreeTime}</span>}
                  </span>
                  <Badge variant="outline" className="text-xs bg-muted/20 text-muted-foreground/50">
                    Indisponível
                  </Badge>
                </div>
              ) : (
                <div className="flex items-center justify-between flex-1">
                  <span className="text-sm text-muted-foreground">Horário livre</span>
                  <Badge variant="outline" className="text-xs bg-primary/10">
                    Clique para encaixar
                  </Badge>
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
