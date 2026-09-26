import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { format, isSameDay } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { TimelineAppointment } from "../AdminAgenda";
import { PremiumTimelineCard } from "./PremiumTimelineCard";
import { PremiumEmptySlot } from "./PremiumEmptySlot";
import { PremiumLunchBreak } from "./PremiumLunchBreak";
import { PremiumFreeIntervalCard } from "./PremiumFreeIntervalCard";
import { CurrentTimeIndicator } from "./CurrentTimeIndicator";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface PremiumTimelineProps {
  appointments: TimelineAppointment[];
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

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function PremiumTimeline({ 
  appointments, 
  selectedDate, 
  onSelectAppointment, 
  onEmptySlotClick 
}: PremiumTimelineProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [businessHours, setBusinessHours] = useState<BusinessHoursConfig | null>(null);
  const [hideFreeSlots, setHideFreeSlots] = useState(false);
  const [expandedIntervals, setExpandedIntervals] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  // Update current time every minute (silently, no re-render flash)
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
        console.error('[PremiumTimeline] Error fetching config:', error);
      }

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

      setBusinessHours(config);
    };

    fetchBusinessHours();
  }, [selectedDate]);

  // Generate time slots (every 10 minutes)
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

  // Get appointment for a specific slot
  const getAppointmentForSlot = useCallback((slot: string) => {
    return appointments.find(apt => apt.hora.substring(0, 5) === slot);
  }, [appointments]);

  // Check if slot is blocked by another appointment's duration
  const isSlotBlockedByDuration = useCallback((slot: string): { blocked: boolean; nextFreeTime: string | null } => {
    if (!businessHours) return { blocked: false, nextFreeTime: null };
    
    const [slotHour, slotMin] = slot.split(':').map(Number);
    const slotStart = slotHour * 60 + slotMin;
    const DELAY_MINUTES = businessHours.delay_entre_servicos;

    for (const apt of appointments) {
      const [aptHour, aptMin] = apt.hora.split(':').map(Number);
      const aptStart = aptHour * 60 + aptMin;
      const aptEnd = aptStart + ((apt as any).duracao || apt.servico?.duracao_minutos || 30);
      const aptEndWithDelay = aptEnd + DELAY_MINUTES;

      if (slotStart > aptStart && slotStart < aptEndWithDelay) {
        const nextFreeHour = Math.floor(aptEndWithDelay / 60);
        const nextFreeMin = aptEndWithDelay % 60;
        const nextFreeTime = `${nextFreeHour.toString().padStart(2, '0')}:${nextFreeMin.toString().padStart(2, '0')}`;
        
        return { blocked: true, nextFreeTime };
      }
    }

    return { blocked: false, nextFreeTime: null };
  }, [appointments, businessHours]);

  // Check if slot is during lunch break
  const isLunchBreak = useCallback((slot: string): boolean => {
    if (!businessHours || !businessHours.hora_almoco_inicio || !businessHours.hora_almoco_fim) {
      return false;
    }
    
    const slotMinutes = timeToMinutes(slot);
    const lunchStart = timeToMinutes(businessHours.hora_almoco_inicio);
    const lunchEnd = timeToMinutes(businessHours.hora_almoco_fim);
    
    return slotMinutes >= lunchStart && slotMinutes < lunchEnd;
  }, [businessHours]);

  // Get time status for an appointment
  const getTimeStatus = useCallback((hora: string, appointmentDateStr?: string): "now" | "soon" | "passed" | "future" => {
    const now = currentTime;
    const [hours, minutes] = hora.split(':').map(Number);
    
    let slotTime: Date;
    if (appointmentDateStr) {
      const [year, month, day] = appointmentDateStr.split('-').map(Number);
      slotTime = new Date(year, month - 1, day, hours, minutes, 0, 0);
    } else {
      slotTime = new Date(selectedDate);
      slotTime.setHours(hours, minutes, 0, 0);
    }

    const diffMinutes = Math.floor((slotTime.getTime() - now.getTime()) / 60000);

    if (diffMinutes > 60 * 24) return "future";
    if (diffMinutes < -30) return "passed";
    if (diffMinutes <= 0) return "now";
    if (diffMinutes <= 10) return "soon";
    return "future";
  }, [currentTime, selectedDate]);

  // Group consecutive free slots
  const groupedSlots = useMemo(() => {
    if (!hideFreeSlots) return null;

    const groups: Array<{
      type: 'appointment' | 'blocked' | 'lunch' | 'freeInterval';
      slots: string[];
      appointment?: TimelineAppointment;
    }> = [];

    let currentFreeGroup: string[] = [];

    timeSlots.forEach((slot) => {
      const appointment = getAppointmentForSlot(slot);
      const { blocked } = isSlotBlockedByDuration(slot);
      const lunch = isLunchBreak(slot);

      if (appointment) {
        if (currentFreeGroup.length > 0) {
          groups.push({ type: 'freeInterval', slots: currentFreeGroup });
          currentFreeGroup = [];
        }
        groups.push({ type: 'appointment', slots: [slot], appointment });
      } else if (lunch) {
        if (currentFreeGroup.length > 0) {
          groups.push({ type: 'freeInterval', slots: currentFreeGroup });
          currentFreeGroup = [];
        }
        // Only add lunch once for the interval
        const lastGroup = groups[groups.length - 1];
        if (!lastGroup || lastGroup.type !== 'lunch') {
          groups.push({ type: 'lunch', slots: [slot] });
        }
      } else if (blocked) {
        if (currentFreeGroup.length > 0) {
          groups.push({ type: 'freeInterval', slots: currentFreeGroup });
          currentFreeGroup = [];
        }
        groups.push({ type: 'blocked', slots: [slot] });
      } else {
        currentFreeGroup.push(slot);
      }
    });

    if (currentFreeGroup.length > 0) {
      groups.push({ type: 'freeInterval', slots: currentFreeGroup });
    }

    return groups;
  }, [timeSlots, getAppointmentForSlot, isSlotBlockedByDuration, isLunchBreak, hideFreeSlots]);

  const toggleInterval = (intervalKey: string) => {
    setExpandedIntervals(prev => {
      const next = new Set(prev);
      if (next.has(intervalKey)) {
        next.delete(intervalKey);
      } else {
        next.add(intervalKey);
      }
      return next;
    });
  };

  if (!businessHours) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Render standard view (all slots)
  const renderStandardView = () => (
    <div className="space-y-2">
      {timeSlots.map((slot, index) => {
        const appointment = getAppointmentForSlot(slot);
        const { blocked, nextFreeTime } = isSlotBlockedByDuration(slot);
        const lunch = isLunchBreak(slot);

        // Lunch break
        if (lunch) {
          // Only render once at the start of lunch
          if (slot === businessHours.hora_almoco_inicio) {
            return (
              <PremiumLunchBreak
                key={slot}
                startTime={businessHours.hora_almoco_inicio!}
                endTime={businessHours.hora_almoco_fim!}
                index={index}
              />
            );
          }
          return null;
        }

        // Appointment
        if (appointment) {
          return (
            <PremiumTimelineCard
              key={slot}
              appointment={appointment}
              timeStatus={getTimeStatus(slot, appointment.data)}
              onClick={() => onSelectAppointment(appointment)}
              index={index}
            />
          );
        }

        // Blocked slot
        if (blocked) {
          return (
            <PremiumEmptySlot
              key={slot}
              time={slot}
              onClick={() => {}}
              isBlocked={true}
              blockReason="Serviço em andamento"
              nextFreeTime={nextFreeTime}
              index={index}
            />
          );
        }

        // Free slot
        return (
          <PremiumEmptySlot
            key={slot}
            time={slot}
            onClick={() => onEmptySlotClick(slot)}
            index={index}
          />
        );
      })}
    </div>
  );

  // Render compact view (grouped free slots)
  const renderCompactView = () => (
    <div className="space-y-2">
      {groupedSlots?.map((group, groupIndex) => {
        if (group.type === 'appointment' && group.appointment) {
          return (
            <PremiumTimelineCard
              key={group.slots[0]}
              appointment={group.appointment}
              timeStatus={getTimeStatus(group.slots[0], group.appointment.data)}
              onClick={() => onSelectAppointment(group.appointment!)}
              index={groupIndex}
            />
          );
        }

        if (group.type === 'lunch') {
          return (
            <PremiumLunchBreak
              key={`lunch-${group.slots[0]}`}
              startTime={businessHours.hora_almoco_inicio!}
              endTime={businessHours.hora_almoco_fim!}
              index={groupIndex}
            />
          );
        }

        if (group.type === 'blocked') {
          return (
            <PremiumEmptySlot
              key={group.slots[0]}
              time={group.slots[0]}
              onClick={() => {}}
              isBlocked={true}
              blockReason="Serviço em andamento"
              index={groupIndex}
            />
          );
        }

        if (group.type === 'freeInterval' && group.slots.length > 0) {
          const intervalKey = `${group.slots[0]}-${group.slots[group.slots.length - 1]}`;
          const isExpanded = expandedIntervals.has(intervalKey);

          if (group.slots.length === 1) {
            return (
              <PremiumEmptySlot
                key={group.slots[0]}
                time={group.slots[0]}
                onClick={() => onEmptySlotClick(group.slots[0])}
                index={groupIndex}
              />
            );
          }

          return (
            <div key={intervalKey}>
              <PremiumFreeIntervalCard
                startTime={group.slots[0]}
                endTime={group.slots[group.slots.length - 1]}
                slotsCount={group.slots.length}
                isExpanded={isExpanded}
                onToggle={() => toggleInterval(intervalKey)}
                index={groupIndex}
              />
              
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden pl-4 mt-2 space-y-1"
                  >
                    {group.slots.map((slot, slotIdx) => (
                      <PremiumEmptySlot
                        key={slot}
                        time={slot}
                        onClick={() => onEmptySlotClick(slot)}
                        index={slotIdx}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        }

        return null;
      })}
    </div>
  );

  return (
    <div ref={containerRef} className="relative">
      {/* Header with toggle */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-muted-foreground">
          Horário: {businessHours.hora_abertura} — {businessHours.hora_fechamento}
        </div>
        <button
          onClick={() => setHideFreeSlots(!hideFreeSlots)}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
            hideFreeSlots 
              ? "bg-primary/10 text-primary" 
              : "bg-foreground/5 text-muted-foreground hover:bg-foreground/10"
          )}
        >
          {hideFreeSlots ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {hideFreeSlots ? "Mostrando compacto" : "Ocultar livres"}
        </button>
      </div>

      {/* Current time indicator */}
      {isSameDay(selectedDate, new Date()) && (
        <CurrentTimeIndicator 
          selectedDate={selectedDate} 
          businessHours={businessHours} 
        />
      )}

      {/* Timeline content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={hideFreeSlots ? 'compact' : 'standard'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {hideFreeSlots ? renderCompactView() : renderStandardView()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}