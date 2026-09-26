import { useState, useRef } from "react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday, startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PremiumCalendarHeaderProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  appointments: Array<{ data: string; status: string }>;
}

export function PremiumCalendarHeader({ selectedDate, onSelectDate, appointments }: PremiumCalendarHeaderProps) {
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(selectedDate));
  const calendarRef = useRef<HTMLDivElement>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getAppointmentsForDate = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return appointments.filter(apt => apt.data === dateStr);
  };

  const handlePrevMonth = () => {
    setCurrentMonth(prev => subMonths(prev, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(prev => addMonths(prev, 1));
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(startOfMonth(today));
    onSelectDate(today);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed": return "bg-emerald-500";
      case "pending": return "bg-amber-500";
      case "completed": return "bg-sky-500";
      case "no_show": return "bg-orange-500";
      default: return "bg-zinc-500";
    }
  };

  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return (
    <div 
      ref={calendarRef}
      className="w-full rounded-2xl overflow-hidden"
      style={{
        background: "linear-gradient(135deg, rgba(24, 24, 29, 0.95), rgba(14, 14, 17, 0.98))",
        border: "1px solid rgba(255, 255, 255, 0.06)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)"
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-foreground/5">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold tracking-wide text-foreground">
              {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
            </h2>
          </div>
          <button
            onClick={goToToday}
            className="px-3 py-1.5 text-xs font-medium tracking-wide rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors duration-200"
          >
            Hoje
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handlePrevMonth}
            className="p-2 rounded-lg hover:bg-foreground/5 transition-colors duration-200 group"
          >
            <ChevronLeft className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
          </button>
          <button
            onClick={handleNextMonth}
            className="p-2 rounded-lg hover:bg-foreground/5 transition-colors duration-200 group"
          >
            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 px-4 py-3 border-b border-foreground/5">
        {weekDays.map(day => (
          <div key={day} className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid - sem animações para evitar tremor */}
      <div className="grid grid-cols-7 gap-1 p-4">
        {calendarDays.map((day) => {
          const dayAppointments = getAppointmentsForDate(day);
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isSelected = isSameDay(day, selectedDate);
          const isTodayDate = isToday(day);
          const isSunday = day.getDay() === 0;

          return (
            <button
              key={day.toISOString()}
              onClick={() => onSelectDate(day)}
              disabled={isSunday}
              className={cn(
                "relative aspect-square p-1 rounded-xl transition-colors duration-200 group",
                "flex flex-col items-center justify-center gap-0.5",
                isCurrentMonth 
                  ? "text-foreground" 
                  : "text-muted-foreground/40",
                isSunday && "opacity-30 cursor-not-allowed",
                !isSunday && !isSelected && "hover:bg-foreground/5",
                isSelected && "bg-primary text-primary-foreground shadow-lg shadow-primary/30",
                isTodayDate && !isSelected && "ring-1 ring-primary/50"
              )}
            >
              <span className={cn(
                "text-sm font-medium",
                isSelected && "font-semibold"
              )}>
                {format(day, "d")}
              </span>

              {/* Appointment indicators */}
              {dayAppointments.length > 0 && (
                <div className="flex gap-0.5 mt-0.5">
                  {dayAppointments.slice(0, 3).map((apt, i) => (
                    <div
                      key={i}
                      className={cn(
                        "w-1 h-1 rounded-full",
                        isSelected ? "bg-foreground/80" : getStatusColor(apt.status)
                      )}
                    />
                  ))}
                  {dayAppointments.length > 3 && (
                    <span className={cn(
                      "text-[8px] font-medium",
                      isSelected ? "text-foreground/80" : "text-muted-foreground"
                    )}>
                      +{dayAppointments.length - 3}
                    </span>
                  )}
                </div>
              )}

              {/* Today indicator */}
              {isTodayDate && !isSelected && (
                <div className="absolute inset-0 rounded-xl ring-1 ring-primary/30 pointer-events-none" />
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 px-4 py-3 border-t border-foreground/5 bg-foreground/[0.02]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-xs text-muted-foreground">Confirmado</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="text-xs text-muted-foreground">Pendente</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-sky-500" />
          <span className="text-xs text-muted-foreground">Concluído</span>
        </div>
      </div>
    </div>
  );
}
