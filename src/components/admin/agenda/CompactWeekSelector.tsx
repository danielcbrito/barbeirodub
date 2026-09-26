import { format, addWeeks, subWeeks, startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

interface CompactWeekSelectorProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  onTodayClick: () => void;
}

export function CompactWeekSelector({ 
  selectedDate, 
  onDateChange,
  onTodayClick 
}: CompactWeekSelectorProps) {
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });

  const handlePrevWeek = () => {
    onDateChange(subWeeks(selectedDate, 1));
  };

  const handleNextWeek = () => {
    onDateChange(addWeeks(selectedDate, 1));
  };

  const isCurrentWeek = () => {
    const today = new Date();
    const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });
    return weekStart.getTime() === currentWeekStart.getTime();
  };

  return (
    <div
      className="flex items-center justify-between gap-4 px-5 py-3 rounded-xl"
      style={{
        background: "linear-gradient(135deg, rgba(24, 24, 29, 0.95), rgba(14, 14, 17, 0.98))",
        border: "1px solid rgba(255, 255, 255, 0.06)",
      }}
    >
      {/* Week Info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10">
          <CalendarDays className="w-4 h-4 text-primary" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-foreground">
            {format(weekStart, "dd", { locale: ptBR })} - {format(weekEnd, "dd 'de' MMMM", { locale: ptBR })}
          </span>
          <span className="text-xs text-muted-foreground">
            {format(weekStart, "yyyy")}
          </span>
        </div>
      </div>

      {/* Navigation - botão Hoje sempre ocupa espaço fixo para não tremer */}
      <div className="flex items-center gap-2">
        <button
          onClick={onTodayClick}
          className={cn(
            "px-3 py-1.5 text-xs font-medium tracking-wide rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-opacity duration-200",
            isCurrentWeek() ? "opacity-0 pointer-events-none" : "opacity-100"
          )}
        >
          Hoje
        </button>
        
        <div className="flex items-center rounded-lg bg-foreground/5">
          <button
            onClick={handlePrevWeek}
            className="p-2 rounded-l-lg hover:bg-foreground/10 transition-all duration-300 group"
          >
            <ChevronLeft className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </button>
          <div className="w-px h-5 bg-foreground/10" />
          <button
            onClick={handleNextWeek}
            className="p-2 rounded-r-lg hover:bg-foreground/10 transition-all duration-300 group"
          >
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </button>
        </div>
      </div>
    </div>
  );
}
