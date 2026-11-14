import { useState, useMemo, useEffect } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  addMonths,
  subMonths,
  isToday,
  isBefore,
  startOfDay,
  parseISO,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface VisualCalendarPickerProps {
  value?: string; // Formato 'yyyy-MM-dd'
  onChange: (dateStr: string) => void;
  minDate?: Date;
  className?: string;
}

const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

export function VisualCalendarPicker({
  value,
  onChange,
  minDate,
  className,
}: VisualCalendarPickerProps) {
  const minEffectiveDate = useMemo(() => {
    return startOfDay(minDate || new Date());
  }, [minDate]);

  // Mês atualmente visualizado no calendário
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    if (value) {
      try {
        const parsed = parseISO(value);
        if (!isNaN(parsed.getTime())) return startOfMonth(parsed);
      } catch {
        // fallback para o mês atual
      }
    }
    return startOfMonth(new Date());
  });

  // Sincroniza mês visualizado se o value mudar externamente e for válido
  useEffect(() => {
    if (value) {
      try {
        const parsed = parseISO(value);
        if (!isNaN(parsed.getTime()) && !isSameMonth(parsed, currentMonth)) {
          setCurrentMonth(startOfMonth(parsed));
        }
      } catch {
        // noop
      }
    }
  }, [value]);

  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });

    // Preenche com nulos os dias antes do 1º dia do mês
    const firstDayOfWeek = start.getDay(); // 0 = Domingo, 1 = Segunda, ...
    const padding = Array(firstDayOfWeek).fill(null);

    return [...padding, ...days];
  }, [currentMonth]);

  const canGoPreviousMonth = useMemo(() => {
    const prevMonthEnd = endOfMonth(subMonths(currentMonth, 1));
    return !isBefore(prevMonthEnd, minEffectiveDate);
  }, [currentMonth, minEffectiveDate]);

  const handlePrevMonth = () => {
    if (canGoPreviousMonth) {
      setCurrentMonth((prev) => subMonths(prev, 1));
    }
  };

  const handleNextMonth = () => {
    setCurrentMonth((prev) => addMonths(prev, 1));
  };

  const formattedMonthTitle = useMemo(() => {
    const raw = format(currentMonth, "MMMM yyyy", { locale: ptBR });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [currentMonth]);

  const selectedFormattedText = useMemo(() => {
    if (!value) return null;
    try {
      const parsed = parseISO(value);
      if (isNaN(parsed.getTime())) return null;
      const raw = format(parsed, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
      return raw.charAt(0).toUpperCase() + raw.slice(1);
    } catch {
      return null;
    }
  }, [value]);

  return (
    <div
      className={cn(
        "rounded-[28px] border border-border/40 bg-card p-5 sm:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.02)] select-none transition-all",
        className
      )}
    >
      {/* ── Header: Mês / Ano e Setas de Navegação ── */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-[17px] font-semibold text-foreground tracking-tight">
          {formattedMonthTitle}
        </h3>

        <div className="flex items-center gap-1 sm:gap-1.5">
          <button
            type="button"
            onClick={handlePrevMonth}
            disabled={!canGoPreviousMonth}
            aria-label="Mês anterior"
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center text-foreground hover:bg-muted/70 active:scale-95 transition-all",
              !canGoPreviousMonth && "opacity-25 cursor-not-allowed hover:bg-transparent"
            )}
          >
            <ChevronLeft className="w-4 h-4 stroke-[2.2]" />
          </button>

          <button
            type="button"
            onClick={handleNextMonth}
            aria-label="Próximo mês"
            className="w-8 h-8 rounded-full flex items-center justify-center text-foreground hover:bg-muted/70 active:scale-95 transition-all"
          >
            <ChevronRight className="w-4 h-4 stroke-[2.2]" />
          </button>
        </div>
      </div>

      {/* ── Dias da Semana (D S T Q Q S S) ── */}
      <div className="grid grid-cols-7 text-center mb-2">
        {DIAS_SEMANA.map((dia, idx) => (
          <div
            key={`dia-sem-${idx}`}
            className="text-[13px] font-medium text-muted-foreground/60 py-1"
          >
            {dia}
          </div>
        ))}
      </div>

      {/* ── Grade de Dias ── */}
      <div className="grid grid-cols-7 gap-y-2.5 gap-x-1 sm:gap-2">
        {calendarDays.map((day, index) => {
          if (!day) {
            return <div key={`empty-${index}`} className="w-9 h-9 sm:w-10 sm:h-10 mx-auto" />;
          }

          const dateStr = format(day, "yyyy-MM-dd");
          const isSelected = value === dateStr;
          const isPast = isBefore(day, minEffectiveDate);
          const isCurrentDay = isToday(day);

          return (
            <button
              key={dateStr}
              type="button"
              disabled={isPast}
              onClick={() => onChange(dateStr)}
              className={cn(
                "w-9 h-9 sm:w-10 sm:h-10 mx-auto rounded-full flex items-center justify-center text-sm font-medium transition-all duration-150",
                // Passado desabilitado
                isPast && "opacity-25 cursor-not-allowed text-muted-foreground",
                // Dia selecionado
                isSelected &&
                  "bg-foreground text-background font-semibold shadow-md scale-105 active:scale-95",
                // Hoje não selecionado
                isCurrentDay &&
                  !isSelected &&
                  !isPast &&
                  "border border-foreground/30 font-semibold text-foreground hover:bg-muted/60",
                // Dia futuro regular não selecionado
                !isSelected &&
                  !isPast &&
                  !isCurrentDay &&
                  "text-foreground hover:bg-muted/70 active:scale-95 cursor-pointer"
              )}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>

      {/* ── Feedback de Data Selecionada ── */}
      <div className="mt-5 pt-3.5 border-t border-border/20 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
          {selectedFormattedText ? (
            <span className="text-foreground font-medium truncate">
              {selectedFormattedText}
            </span>
          ) : (
            <span className="text-muted-foreground/60 font-light">
              Nenhum dia selecionado
            </span>
          )}
        </div>
        {value && (
          <span className="text-[10px] font-mono tracking-wider text-muted-foreground/50 shrink-0 uppercase">
            {format(parseISO(value), "dd/MM/yyyy")}
          </span>
        )}
      </div>
    </div>
  );
}
