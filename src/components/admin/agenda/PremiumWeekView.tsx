import { useMemo, useState, useEffect } from "react";
import { format, addDays, startOfWeek, isSameDay, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { TimelineAppointment } from "../AdminAgenda";
import { supabase } from "@/integrations/supabase/client";
import { Scissors } from "lucide-react";
import { isWhatsAppAppointment, resolveClienteDisplayName } from "@/lib/walkInName";
import { WhatsAppBadge } from "@/components/shared/WhatsAppBadge";

interface PremiumWeekViewProps {
  selectedDate: Date;
  appointments: TimelineAppointment[];
  allAppointments: Array<{ data: string; status: string }>;
  onSelectDate: (date: Date) => void;
  onSelectAppointment: (appointment: TimelineAppointment) => void;
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

const getServiceColor = (serviceName: string | undefined) => {
  if (!serviceName) return "bg-zinc-500";
  
  const name = serviceName.toLowerCase();
  if (name.includes("corte")) return "bg-sky-500";
  if (name.includes("barba")) return "bg-amber-500";
  if (name.includes("combo")) return "bg-violet-500";
  if (name.includes("sobrancelha")) return "bg-rose-500";
  return "bg-primary";
};

export function PremiumWeekView({ 
  selectedDate, 
  appointments,
  allAppointments, 
  onSelectDate,
  onSelectAppointment 
}: PremiumWeekViewProps) {
  const [businessHours, setBusinessHours] = useState<BusinessHoursConfig | null>(null);

  // Get week days (Mon-Sat)
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 }); // Start from Monday
  const weekDays = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => addDays(weekStart, i)); // Mon to Sat
  }, [weekStart]);

  // Fetch business hours
  useEffect(() => {
    const fetchBusinessHours = async () => {
      // Use Monday's config as default
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

  // Generate time slots
  const timeSlots = useMemo(() => {
    if (!businessHours) return [];
    
    const slots: string[] = [];
    const openMinutes = timeToMinutes(businessHours.hora_abertura);
    const closeMinutes = timeToMinutes(businessHours.hora_fechamento);
    
    for (let minutes = openMinutes; minutes < closeMinutes; minutes += 60) {
      const hour = Math.floor(minutes / 60);
      slots.push(`${hour.toString().padStart(2, '0')}:00`);
    }
    
    return slots;
  }, [businessHours]);

  // Get appointments for a specific day (uses full appointments, not calendar indicators)
  const getAppointmentsForDay = (day: Date) => {
    const dateStr = format(day, "yyyy-MM-dd");
    return appointments.filter(apt => apt.data === dateStr);
  };

  // Calculate appointment position and height
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
      height: `${height}%`,
      minHeight: '28px'
    };
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
      {/* Week header */}
      <div className="grid grid-cols-[60px_repeat(6,1fr)] border-b border-foreground/5">
        <div className="p-3 border-r border-foreground/5" />
        {weekDays.map((day, idx) => (
          <motion.button
            key={day.toISOString()}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            onClick={() => onSelectDate(day)}
            className={cn(
              "p-3 text-center border-r border-foreground/5 last:border-r-0 transition-all",
              "hover:bg-foreground/5",
              isSameDay(day, selectedDate) && "bg-primary/10",
              isToday(day) && "ring-1 ring-primary/30 ring-inset"
            )}
          >
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {format(day, "EEE", { locale: ptBR })}
            </div>
            <div className={cn(
              "text-lg font-semibold mt-1",
              isToday(day) && "text-primary",
              isSameDay(day, selectedDate) && "text-primary"
            )}>
              {format(day, "d")}
            </div>
          </motion.button>
        ))}
      </div>

      {/* Time grid */}
      <div className="relative grid grid-cols-[60px_repeat(6,1fr)]" style={{ minHeight: "500px" }}>
        {/* Time labels */}
        <div className="relative border-r border-foreground/5">
          {timeSlots.map((time, idx) => (
            <div 
              key={time}
              className="absolute left-0 right-0 flex items-start justify-end pr-2 -translate-y-1/2"
              style={{ top: `${(idx / timeSlots.length) * 100}%` }}
            >
              <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
                {time}
              </span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        {weekDays.map((day, dayIdx) => {
          const dayAppointments = getAppointmentsForDay(day);
          
          return (
            <div 
              key={day.toISOString()}
              className={cn(
                "relative border-r border-foreground/5 last:border-r-0",
                day.getDay() === 0 && "bg-foreground/[0.02] opacity-50"
              )}
            >
              {/* Hour lines */}
              {timeSlots.map((_, idx) => (
                <div
                  key={idx}
                  className="absolute left-0 right-0 border-t border-foreground/[0.03]"
                  style={{ top: `${(idx / timeSlots.length) * 100}%` }}
                />
              ))}

              {/* Lunch break overlay */}
              {businessHours.hora_almoco_inicio && businessHours.hora_almoco_fim && (
                <div
                  className="absolute left-0 right-0 bg-amber-500/5 border-y border-amber-500/10"
                  style={{
                    top: `${((timeToMinutes(businessHours.hora_almoco_inicio) - timeToMinutes(businessHours.hora_abertura)) / (timeToMinutes(businessHours.hora_fechamento) - timeToMinutes(businessHours.hora_abertura))) * 100}%`,
                    height: `${((timeToMinutes(businessHours.hora_almoco_fim) - timeToMinutes(businessHours.hora_almoco_inicio)) / (timeToMinutes(businessHours.hora_fechamento) - timeToMinutes(businessHours.hora_abertura))) * 100}%`
                  }}
                />
              )}

              {/* Appointments */}
              {dayAppointments.map((apt, aptIdx) => (
                <motion.div
                  key={apt.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: aptIdx * 0.05 }}
                  onClick={() => onSelectAppointment(apt)}
                  className={cn(
                    "absolute left-1 right-1 rounded-lg px-2 py-1 cursor-pointer",
                    "transition-all duration-200 hover:scale-[1.02] hover:z-10",
                    "overflow-hidden",
                    getServiceColor(apt.servico?.nome)
                  )}
                  style={getAppointmentStyle(apt)}
                >
                  <div className="flex items-center gap-1">
                    <Scissors className="w-3 h-3 text-foreground/80 shrink-0" />
                    <span className="text-[10px] font-semibold text-foreground truncate">
                      {apt.servico?.nome?.split(' ')[0]}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-foreground/70 truncate block">
                      {resolveClienteDisplayName(apt.observacoes, apt.profile?.nome, "Cliente", apt.cliente_nome).split(' ')[0]}
                    </span>
                    {isWhatsAppAppointment(apt.observacoes) && <WhatsAppBadge size="sm" showLabel={false} />}
                  </div>
                </motion.div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}