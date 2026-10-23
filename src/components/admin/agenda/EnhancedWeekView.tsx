import { useMemo, useState, useEffect } from "react";
import { format, addDays, startOfWeek, isSameDay, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { TimelineAppointment } from "../AdminAgenda";
import { supabase } from "@/integrations/supabase/client";
import { Scissors, User, Clock, CreditCard } from "lucide-react";
import { isWhatsAppAppointment, resolveClienteDisplayName } from "@/lib/walkInName";
import { WhatsAppBadge } from "@/components/shared/WhatsAppBadge";

interface EnhancedWeekViewProps {
  selectedDate: Date;
  appointments: TimelineAppointment[];
  allAppointments: Array<{ data: string; status: string }>;
  onSelectDate: (date: Date) => void;
  onSelectAppointment: (appointment: TimelineAppointment) => void;
  onEmptySlotClick?: (date: string, time: string) => void;
}

interface BusinessHoursConfig {
  aberto: boolean;
  hora_abertura: string;
  hora_fechamento: string;
  hora_almoco_inicio: string | null;
  hora_almoco_fim: string | null;
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

// Cores baseadas no status igual ao mobile (verde = completed, azul = confirmed, amarelo = pending)
const getStatusConfig = (status: string, barbeiroConfirmou: boolean | null) => {
  if (status === "completed") {
    return { 
      gradient: "from-emerald-600 to-emerald-700",
      color: "bg-emerald-500", 
      label: "Concluído"
    };
  }
  if (status === "confirmed" || barbeiroConfirmou) {
    return { 
      gradient: "from-sky-600 to-blue-700",
      color: "bg-sky-500", 
      label: "Agendado"
    };
  }
  return { 
    gradient: "from-amber-600 to-orange-700",
    color: "bg-amber-500", 
    label: "Pendente"
  };
};

export function EnhancedWeekView({ 
  selectedDate, 
  appointments,
  allAppointments, 
  onSelectDate,
  onSelectAppointment,
  onEmptySlotClick
}: EnhancedWeekViewProps) {
  const [businessHours, setBusinessHours] = useState<BusinessHoursConfig | null>(null);

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  useEffect(() => {
    const fetchBusinessHours = async () => {
      const { data: configData } = await supabase
        .from('configuracoes_horario')
        .select('aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, delay_entre_servicos')
        .eq('dia_semana', 1)
        .maybeSingle();

      const config: BusinessHoursConfig = configData ? {
        aberto: configData.aberto,
        hora_abertura: configData.hora_abertura,
        hora_fechamento: configData.hora_fechamento,
        hora_almoco_inicio: configData.hora_almoco_inicio,
        hora_almoco_fim: configData.hora_almoco_fim
      } : {
        aberto: true,
        hora_abertura: '09:00',
        hora_fechamento: '21:00',
        hora_almoco_inicio: '13:00',
        hora_almoco_fim: '14:00'
      };

      setBusinessHours(config);
    };

    fetchBusinessHours();
  }, []);

  // Generate time slots (every 30 minutes for better granularity)
  const timeSlots = useMemo(() => {
    if (!businessHours) return [];
    
    const slots: string[] = [];
    const openMinutes = timeToMinutes(businessHours.hora_abertura);
    const closeMinutes = timeToMinutes(businessHours.hora_fechamento);
    
    for (let minutes = openMinutes; minutes < closeMinutes; minutes += 30) {
      const hour = Math.floor(minutes / 60);
      const min = minutes % 60;
      slots.push(`${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`);
    }
    
    return slots;
  }, [businessHours]);

  const getAppointmentsForDay = (day: Date) => {
    const dateStr = format(day, "yyyy-MM-dd");
    return appointments.filter(apt => apt.data === dateStr);
  };

  const getAppointmentStyle = (appointment: TimelineAppointment) => {
    if (!businessHours) return {};

    const openMinutes = timeToMinutes(businessHours.hora_abertura);
    const closeMinutes = timeToMinutes(businessHours.hora_fechamento);
    const totalMinutes = closeMinutes - openMinutes;

    const aptMinutes = timeToMinutes(appointment.hora);
    const duration = (appointment as any).duracao || appointment.servico?.duracao_minutos || 30;

    const top = ((aptMinutes - openMinutes) / totalMinutes) * 100;
    const height = (duration / totalMinutes) * 100;

    return {
      top: `${top}%`,
      height: `${Math.max(height, 4)}%`,
      minHeight: '32px'
    };
  };

  const isLunchTime = (time: string) => {
    if (!businessHours?.hora_almoco_inicio || !businessHours?.hora_almoco_fim) return false;
    const minutes = timeToMinutes(time);
    const lunchStart = timeToMinutes(businessHours.hora_almoco_inicio);
    const lunchEnd = timeToMinutes(businessHours.hora_almoco_fim);
    return minutes >= lunchStart && minutes < lunchEnd;
  };

  if (!businessHours) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div 
      className="rounded-2xl overflow-hidden"
      style={{
        background: "linear-gradient(135deg, rgba(24, 24, 29, 0.95), rgba(14, 14, 17, 0.98))",
        border: "1px solid rgba(255, 255, 255, 0.06)"
      }}
    >
      {/* Week header with days */}
      <div className="grid grid-cols-[70px_repeat(6,1fr)] border-b border-foreground/10">
        <div className="p-3 border-r border-foreground/10 flex items-center justify-center">
          <Clock className="w-4 h-4 text-muted-foreground" />
        </div>
        {weekDays.map((day, idx) => {
          const dayAppointments = getAppointmentsForDay(day);
          const appointmentCount = dayAppointments.length;
          
          return (
            <motion.button
              key={day.toISOString()}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              onClick={() => onSelectDate(day)}
              className={cn(
                "p-3 text-center border-r border-foreground/10 last:border-r-0 transition-all duration-300",
                "hover:bg-foreground/5 relative",
                isSameDay(day, selectedDate) && "bg-primary/10",
                isToday(day) && "ring-1 ring-primary/40 ring-inset"
              )}
            >
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                {format(day, "EEE", { locale: ptBR })}
              </div>
              <div className={cn(
                "text-xl font-bold mt-1",
                isToday(day) && "text-primary",
                isSameDay(day, selectedDate) && "text-primary"
              )}>
                {format(day, "d")}
              </div>
              {appointmentCount > 0 && (
                <div className="mt-1.5 flex items-center justify-center gap-1">
                  <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-primary/20 text-primary">
                    {appointmentCount} {appointmentCount === 1 ? 'corte' : 'cortes'}
                  </span>
                </div>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Time grid - expandido sem scroll interno */}
      <div className="relative">
        <div className="relative grid grid-cols-[70px_repeat(6,1fr)]" style={{ minHeight: `${timeSlots.length * 50}px` }}>
          {/* Time labels column */}
          <div className="relative border-r border-foreground/10 bg-black/20">
            {timeSlots.map((time, idx) => {
              const isLunch = isLunchTime(time);
              return (
                <div 
                  key={time}
                  className={cn(
                    "h-[50px] flex items-center justify-end pr-3 border-b border-foreground/5",
                    isLunch && "bg-amber-500/5"
                  )}
                >
                  <span className={cn(
                    "text-xs font-medium tabular-nums",
                    time.endsWith(':00') ? "text-foreground" : "text-muted-foreground/60"
                  )}>
                    {time}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Day columns */}
          {weekDays.map((day, dayIdx) => {
            const dayAppointments = getAppointmentsForDay(day);
            const dateStr = format(day, "yyyy-MM-dd");
            
            return (
              <div 
                key={day.toISOString()}
                className={cn(
                  "relative border-r border-foreground/10 last:border-r-0",
                  day.getDay() === 0 && "bg-foreground/[0.02] opacity-50"
                )}
              >
                {/* Hour grid lines */}
                {timeSlots.map((time, idx) => {
                  const isLunch = isLunchTime(time);
                  const isHour = time.endsWith(':00');
                  
                  return (
                    <div
                      key={time}
                      onClick={() => !isLunch && onEmptySlotClick?.(dateStr, time)}
                      className={cn(
                        "h-[50px] border-b transition-colors cursor-pointer",
                        isHour ? "border-foreground/10" : "border-foreground/5",
                        isLunch ? "bg-amber-500/5 cursor-not-allowed" : "hover:bg-foreground/5"
                      )}
                    >
                      {isLunch && idx === timeSlots.findIndex(t => isLunchTime(t)) && (
                        <div className="absolute inset-x-1 top-1/2 -translate-y-1/2 flex items-center justify-center z-10">
                          <span className="text-[9px] font-medium text-amber-500/70 uppercase tracking-wider">
                            Almoço
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Appointments overlay - cores iguais ao mobile */}
                <div className="absolute inset-0 pointer-events-none">
                  {dayAppointments.map((apt, aptIdx) => {
                    const statusConfig = getStatusConfig(apt.status, apt.barbeiro_confirmou);
                    
                    return (
                      <motion.div
                        key={apt.id}
                        initial={{ opacity: 0, scale: 0.95, x: -5 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        transition={{ delay: aptIdx * 0.03, duration: 0.2 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectAppointment(apt);
                        }}
                        className={cn(
                          "absolute left-1 right-1 rounded-xl cursor-pointer pointer-events-auto",
                          "transition-all duration-200 hover:scale-[1.02] hover:z-20 hover:shadow-xl",
                          "overflow-hidden border border-foreground/10",
                          `bg-gradient-to-br ${statusConfig.gradient}`
                        )}
                        style={getAppointmentStyle(apt)}
                      >
                        <div className="p-2 h-full flex flex-col justify-between">
                          <div className="flex items-start gap-1.5">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <Scissors className="w-3 h-3 text-foreground/80 shrink-0" />
                                <span className="text-[11px] font-bold text-foreground truncate">
                                  {(() => {
                                    if (apt.observacoes?.startsWith("Serviços:")) {
                                      return apt.observacoes.split(".")[0].replace("Serviços: ", "");
                                    }
                                    const sName = apt.servico?.nome || "Serviço";
                                    const sDur = apt.servico?.duracao_minutos || 0;
                                    const aDur = (apt as any).duracao || 0;
                                    if (sDur > 0 && aDur > sDur) {
                                      const qty = Math.round(aDur / sDur);
                                      if (qty > 1) return `${qty}x ${sName}`;
                                    }
                                    return sName;
                                  })()}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 mt-0.5">
                                <User className="w-2.5 h-2.5 text-foreground/60 shrink-0" />
                                <span className="text-[10px] text-foreground/80 truncate">
                                  {resolveClienteDisplayName(apt.observacoes, apt.profile?.nome, "Cliente", apt.cliente_nome)}
                                </span>
                                {isWhatsAppAppointment(apt.observacoes) && <WhatsAppBadge size="sm" />}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-[9px] text-foreground/70 tabular-nums mt-auto">
                            <span>{apt.hora} • {(apt as any).duracao || apt.servico?.duracao_minutos}min</span>
                            {(apt.payment_method === 'credit' || apt.observacoes?.includes('crédito do app')) && (
                              <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-foreground/20 rounded-full text-foreground text-[8px]">
                                <CreditCard className="w-2 h-2" />
                                Crédito
                              </span>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 px-4 py-3 border-t border-foreground/10 bg-black/20 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-[10px] text-muted-foreground font-medium">Agendado</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="text-[10px] text-muted-foreground font-medium">Pendente</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-sky-500" />
          <span className="text-[10px] text-muted-foreground font-medium">Concluído</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-2 rounded bg-amber-500/20" />
          <span className="text-[10px] text-muted-foreground font-medium">Almoço</span>
        </div>
        <div className="flex items-center gap-2">
          <CreditCard className="w-3 h-3 text-purple-400" />
          <span className="text-[10px] text-muted-foreground font-medium">Crédito App</span>
        </div>
      </div>
    </div>
  );
}
