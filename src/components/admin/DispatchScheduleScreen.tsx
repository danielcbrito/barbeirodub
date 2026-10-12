import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { TimeWheelPicker } from "@/components/shared/TimeWheelPicker";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  addMonths,
  subMonths,
  isToday,
  isBefore,
  startOfDay,
  setHours,
  setMinutes,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";

/* ═══════════════════════════════════════════════ */
/* Props                                          */
/* ═══════════════════════════════════════════════ */

interface DispatchScheduleScreenProps {
  onConfirm: (isoDate: string) => void;
  onBack: () => void;
  initialDate?: string;
}

/* ═══════════════════════════════════════════════ */
/* Curved back arrow                              */
/* ═══════════════════════════════════════════════ */

function CurvedBackArrow({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      className={cn("pointer-events-none", className)}
    >
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a4 4 0 0 1 4 4v1" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════ */
/* Component                                      */
/* ═══════════════════════════════════════════════ */

export function DispatchScheduleScreen({ onConfirm, onBack, initialDate }: DispatchScheduleScreenProps) {
  const isMobile = useIsMobile();

  const parsedInitial = initialDate ? new Date(initialDate) : null;

  const [selectedDate, setSelectedDate] = useState<Date | null>(
    parsedInitial && !isNaN(parsedInitial.getTime()) ? startOfDay(parsedInitial) : null
  );
  const [selectedTime, setSelectedTime] = useState<string>(
    parsedInitial && !isNaN(parsedInitial.getTime())
      ? `${String(parsedInitial.getHours()).padStart(2, "0")}:${String(parsedInitial.getMinutes()).padStart(2, "0")}`
      : "10:00"
  );
  const [currentMonth, setCurrentMonth] = useState(parsedInitial || new Date());

  /** Etapa: 0 = calendário, 1 = horário */
  const [internalStep, setInternalStep] = useState(0);

  /* ── Calendar days ── */
  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });
    const firstDayOfWeek = start.getDay();
    const paddingDays: (Date | null)[] = Array(firstDayOfWeek).fill(null);
    return [...paddingDays, ...days];
  }, [currentMonth]);

  const today = startOfDay(new Date());

  /* ── Computed final datetime ── */
  const finalDateTime = useMemo(() => {
    if (!selectedDate || !selectedTime) return null;
    const [h, m] = selectedTime.split(":").map(Number);
    return setMinutes(setHours(new Date(selectedDate), h), m);
  }, [selectedDate, selectedTime]);

  const isValid = finalDateTime && finalDateTime > new Date();

  const handleConfirm = () => {
    if (!finalDateTime || !isValid) return;
    onConfirm(finalDateTime.toISOString());
  };

  const handleGoToTime = () => {
    if (!selectedDate) return;
    setInternalStep(1);
  };

  /* ── Step dots ── */
  const StepDots = () => (
    <div className="flex items-center gap-1.5">
      {[0, 1].map((s) => (
        <div
          key={s}
          className={cn(
            "rounded-full transition-all duration-300",
            s === internalStep
              ? "w-5 h-1.5 bg-foreground"
              : s < internalStep
              ? "w-1.5 h-1.5 bg-foreground/40"
              : "w-1.5 h-1.5 bg-foreground/15"
          )}
        />
      ))}
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col h-[100dvh] overflow-hidden"
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        {/* Seta voltar — centralizada verticalmente com título */}
        <button
          onClick={() => {
            if (internalStep === 1) setInternalStep(0);
            else onBack();
          }}
          className="relative z-10 w-10 h-10 rounded-xl flex items-center justify-center hover:bg-secondary/50 active:scale-95 transition-all shrink-0"
          aria-label="Voltar"
        >
          <CurvedBackArrow className="text-foreground w-[22px] h-[22px]" />
        </button>

        {/* Título — menor que a seta, alinhado ao centro vertical */}
        <h2 className="flex-1 text-[15px] font-semibold text-foreground tracking-tight leading-none">
          {internalStep === 0 ? "Escolha a data" : "Escolha o horário"}
        </h2>

        {/* Step dots — canto direito */}
        <div className="flex items-center mr-1 shrink-0">
          <StepDots />
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="h-px bg-border/20 mx-1" />

      {/* ── Conteúdo principal — centralizado verticalmente ── */}
      <div className={cn(
        "flex-1 flex flex-col items-center",
        internalStep === 0
          ? (isMobile ? "justify-center px-4 -mt-24" : "justify-center -mt-16")
          : (isMobile ? "justify-center px-4 -mt-24" : "justify-center -mt-16")
      )}>

        {/* Month nav row (only on calendar step) */}
        {internalStep === 0 && (
          <div className="flex items-center justify-between w-full max-w-[430px] px-2 pb-4">
            <button
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary/40 active:scale-95 transition-all"
              aria-label="Mês anterior"
            >
              <ChevronLeft className="w-4 h-4 text-foreground/60" />
            </button>
            <span className="text-[14px] font-bold text-foreground capitalize tracking-tight">
              {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
            </span>
            <button
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary/40 active:scale-95 transition-all"
              aria-label="Próximo mês"
            >
              <ChevronRight className="w-4 h-4 text-foreground/60" />
            </button>
          </div>
        )}
        <AnimatePresence mode="wait">
          {/* ═══════════════════════════════════════ */}
          {/* STEP 0: Calendar                       */}
          {/* ═══════════════════════════════════════ */}
          {internalStep === 0 && (
            <motion.div
              key="calendar-step"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-[430px] flex flex-col"
            >
              <div className="rounded-2xl border border-border/15 bg-secondary/5 p-4">

                {/* Weekday headers */}
                <div className="grid grid-cols-7 gap-0.5 mb-1">
                  {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
                    <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground/30 py-2 uppercase tracking-wider">
                      {d}
                    </div>
                  ))}
                </div>

                {/* Days grid — cells mais compactas e preenchidas */}
                <div className="grid grid-cols-7 gap-0.5">
                  {calendarDays.map((day, index) => {
                    if (!day) return <div key={`e-${index}`} className="aspect-square" />;

                    const isSelected = selectedDate && isSameDay(day, selectedDate);
                    const isPast = isBefore(day, today);
                    const isCurrentDay = isToday(day);
                    const inMonth = isSameMonth(day, currentMonth);

                    return (
                      <button
                        key={day.toISOString()}
                        onClick={() => !isPast && setSelectedDate(day)}
                        disabled={isPast}
                        className={cn(
                          "aspect-square rounded-xl text-[13px] font-medium transition-all duration-200 flex items-center justify-center relative",
                          !inMonth && "opacity-20",
                          isPast && "opacity-20 cursor-not-allowed",
                          !isPast && !isSelected && "hover:bg-secondary/30 text-foreground/70",
                          isCurrentDay && !isSelected && "ring-1 ring-foreground/25",
                          isSelected &&
                            "bg-foreground text-background font-bold shadow-lg shadow-foreground/15 scale-[1.05]"
                        )}
                      >
                        {format(day, "d")}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Selected date badge */}
              <AnimatePresence>
                {selectedDate && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="flex items-center justify-center gap-2 mt-4 py-2.5 rounded-xl bg-foreground/[0.06] border border-foreground/15"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-foreground/50" />
                    <span className="text-[11px] font-semibold text-foreground/70 capitalize">
                      {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ═══════════════════════════════════════ */}
          {/* STEP 1: Time Wheel Picker              */}
          {/* ═══════════════════════════════════════ */}
          {internalStep === 1 && selectedDate && (
            <motion.div
              key="time-step"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col items-center justify-center w-full max-w-[320px]"
            >
              {/* Label sutil */}
              <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/35 font-semibold mb-1">
                Horário do disparo
              </span>

              {/* Data selecionada — pequena e discreta */}
              <span className="text-[11px] text-muted-foreground/40 capitalize mb-6">
                {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
              </span>

              {/* Wheel picker — grande e centralizado */}
              <div className="flex items-center justify-center w-full">
                <TimeWheelPicker
                  value={selectedTime}
                  onChange={setSelectedTime}
                  minuteStep={5}
                />
              </div>

              {/* Confirmação sutil */}
              {isValid && finalDateTime && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6 py-2 px-4 rounded-xl bg-foreground/[0.04] border border-border/10"
                >
                  <span className="text-[12px] font-semibold text-foreground/60">
                    Envio às {selectedTime}
                  </span>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ═══════════════════════════════════════ */}
      {/* Bottom Action — fixo na base           */}
      {/* ═══════════════════════════════════════ */}
      <div className={cn(
        "px-4",
        isMobile
          ? "fixed bottom-0 left-0 right-0 z-40 pb-[calc(16px+env(safe-area-inset-bottom))] bg-gradient-to-t from-background via-background to-transparent pt-8"
          : "mt-auto pb-6"
      )}>
        {internalStep === 0 ? (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleGoToTime}
            disabled={!selectedDate}
            className="w-full py-4 rounded-2xl bg-foreground text-background text-[14px] font-semibold hover:bg-foreground/90 transition-all duration-300 disabled:opacity-25 text-center"
          >
            Continuar
          </motion.button>
        ) : (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleConfirm}
            disabled={!isValid}
            className="w-full py-4 rounded-2xl bg-foreground text-background text-[14px] font-semibold hover:bg-foreground/90 transition-all duration-300 disabled:opacity-25 text-center"
          >
            Confirmar Agendamento
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}
