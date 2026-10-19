import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isToday, isBefore, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";

interface PremiumCalendarProps {
  selectedDate: Date | undefined;
  onSelectDate: (date: Date) => void;
  disabledDates?: Date[];
  minDate?: Date;
  isDateDisabled?: (date: Date) => boolean;
}

export function PremiumCalendar({
  selectedDate,
  onSelectDate,
  disabledDates = [],
  minDate,
  isDateDisabled: customIsDateDisabled,
}: PremiumCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(selectedDate || new Date());

  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });
    
    // Add padding for the first week
    const firstDayOfWeek = start.getDay();
    const paddingDays = Array(firstDayOfWeek).fill(null);
    
    return [...paddingDays, ...days];
  }, [currentMonth]);

  const isDateDisabled = (date: Date) => {
    if (!date) return true;
    const today = startOfDay(new Date());
    if (isBefore(date, today)) return true;
    if (minDate && isBefore(date, startOfDay(minDate))) return true;
    if (customIsDateDisabled && customIsDateDisabled(date)) return true;
    return disabledDates.some(d => isSameDay(d, date));
  };

  return (
    <div className="bg-foreground/[0.02] border border-foreground/5 rounded-3xl p-6 backdrop-blur-xl">
      {/* Header do calendário */}
      <div className="flex items-center justify-between mb-6">
        <button 
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-foreground/5 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-foreground" />
        </button>
        
        <h3 className="text-xl font-bold text-foreground capitalize">
          {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
        </h3>
        
        <button 
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-foreground/5 transition-colors"
        >
          <ChevronRight className="w-5 h-5 text-foreground" />
        </button>
      </div>

      {/* Dias da semana */}
      <div className="grid grid-cols-7 gap-2 mb-2">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
          <div key={day} className="text-center text-xs font-medium text-zinc-500 py-2">
            {day}
          </div>
        ))}
      </div>

      {/* Grid de dias */}
      <div className="grid grid-cols-7 gap-2">
        {calendarDays.map((day, index) => {
          if (!day) {
            return <div key={`empty-${index}`} className="aspect-square" />;
          }

          const isSelected = selectedDate && isSameDay(day, selectedDate);
          const isDisabled = isDateDisabled(day);
          const isCurrentDay = isToday(day);
          const isCurrentMonth = isSameMonth(day, currentMonth);

          return (
            <button
              key={day.toISOString()}
              onClick={() => !isDisabled && onSelectDate(day)}
              disabled={isDisabled}
              className={cn(
                "aspect-square rounded-xl text-sm font-medium transition-all flex items-center justify-center",
                !isCurrentMonth && "opacity-30",
                isDisabled && "opacity-30 cursor-not-allowed",
                !isDisabled && !isSelected && "hover:bg-foreground/5 text-foreground",
                isCurrentDay && !isSelected && "ring-1 ring-primary/50",
                isSelected && "bg-gradient-to-br from-primary to-primary/80 text-foreground shadow-lg shadow-primary/25 scale-105"
              )}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>
    </div>
  );
}
