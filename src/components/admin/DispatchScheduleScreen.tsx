import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { TimeWheelPicker } from "@/components/shared/TimeWheelPicker";
import { ScheduleHeader } from "@/components/shared/ScheduleHeader";
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
/* Helpers                                        */
/* ═══════════════════════════════════════════════ */

function getDefaultFutureTime(): string {
  const now = new Date();
  const d = new Date(now.getTime() + 30 * 60 * 1000);
  const m = Math.ceil(d.getMinutes() / 5) * 5;
  if (m === 60) {
    d.setHours(d.getHours() + 1);
    d.setMinutes(0);
  } else {
    d.setMinutes(m);
  }
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
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
      : getDefaultFutureTime()
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

  const isValid = finalDateTime ? finalDateTime > new Date() : false;

  const handleSelectDate = (day: Date) => {
    setSelectedDate(day);
    if (isToday(day)) {
      const [h, m] = selectedTime.split(":").map(Number);
      const testDate = setMinutes(setHours(new Date(day), h), m);
      if (testDate <= new Date()) {
        setSelectedTime(getDefaultFutureTime());
      }
    }
  };

  const handleConfirm = () => {
    if (!finalDateTime || !isValid) return;
    onConfirm(finalDateTime.toISOString());
  };

  const handleGoToTime = () => {
    if (!selectedDate) return;
    if (isToday(selectedDate)) {
      const [h, m] = selectedTime.split(":").map(Number);
      const testDate = setMinutes(setHours(new Date(selectedDate), h), m);
      if (testDate <= new Date()) {
        setSelectedTime(getDefaultFutureTime());
      }
    }
    setInternalStep(1);
  };

  const handleStepBack = () => {
    if (internalStep === 1) {
      setInternalStep(0);
    } else {
      onBack();
    }
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
      className="flex flex-col h-[100dvh] bg-background overflow-hidden relative"
    >
      {/* ── Header Padrão do Sistema ── */}
      <ScheduleHeader
        title={internalStep === 0 ? "Escolha a data" : "Escolha o horário"}
        onBack={handleStepBack}
        right={<StepDots />}
      />

      {/* ── Conteúdo principal ── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col items-center justify-center pb-36">

        {/* Month nav row (only on calendar step) */}
        {internalStep === 0 && (
          <div className="flex items-center justify-between w-full max-w-[400px] px-2 pb-3 shrink-0">
            <button
              type="button"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-secondary/80 hover:bg-secondary active:scale-95 transition-all text-foreground border border-border/30"
              aria-label="Mês anterior"
            >
              <ChevronLeft className="w-4 h-4 text-foreground/80" />
            </button>
            <span className="text-[15px] font-semibold text-foreground capitalize tracking-tight">
              {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
            </span>
            <button
              type="button"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-secondary/80 hover:bg-secondary active:scale-95 transition-all text-foreground border border-border/30"
              aria-label="Próximo mês"
            >
              <ChevronRight className="w-4 h-4 text-foreground/80" />
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
              className="w-full max-w-[400px] flex flex-col"
            >
              <div className="rounded-2xl border border-border/60 dark:border-white/[0.08] bg-card p-4 shadow-xs">
                {/* Weekday headers */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
                    <div key={d} className="text-center text-[11px] font-semibold text-muted-foreground/60 py-1 uppercase tracking-wider">
                      {d}
                    </div>
                  ))}
                </div>

                {/* Days grid */}
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((day, index) => {
                    if (!day) return <div key={`e-${index}`} className="aspect-square" />;

                    const isSelected = selectedDate && isSameDay(day, selectedDate);
                    const isPast = isBefore(day, today);
                    const isCurrentDay = isToday(day);
                    const inMonth = isSameMonth(day, currentMonth);

                    return (
                      <button
                        key={day.toISOString()}
                        type="button"
                        onClick={() => !isPast && handleSelectDate(day)}
                        disabled={isPast}
                        className={cn(
                          "aspect-square rounded-xl text-[13.5px] font-medium transition-all duration-200 flex items-center justify-center relative",
                          !inMonth && "opacity-20",
                          isPast && "opacity-20 cursor-not-allowed",
                          !isPast && !isSelected && "hover:bg-secondary/60 text-foreground",
                          isCurrentDay && !isSelected && "ring-1 ring-foreground/25 font-semibold",
                          isSelected &&
                            "bg-foreground text-background font-bold shadow-md scale-[1.04]"
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
                    className="flex items-center justify-center gap-2 mt-3.5 py-2.5 px-4 rounded-xl bg-secondary/60 border border-border/40"
                  >
                    <CheckCircle2 className="w-4 h-4 text-foreground/80" />
                    <span className="text-[12.5px] font-medium text-foreground capitalize">
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
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-1">
                Horário do disparo
              </span>

              {/* Data selecionada */}
              <span className="text-[13px] text-foreground font-medium capitalize mb-5">
                {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
              </span>

              {/* Wheel picker */}
              <div className="flex items-center justify-center w-full">
                <TimeWheelPicker
                  value={selectedTime}
                  onChange={setSelectedTime}
                  minuteStep={5}
                />
              </div>

              {/* Confirmação ou aviso de horário no passado */}
              {isValid && finalDateTime ? (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-5 py-2.5 px-4 rounded-xl bg-secondary/60 border border-border/40 text-center"
                >
                  <span className="text-[13px] font-semibold text-foreground">
                    Envio às {selectedTime}
                  </span>
                </motion.div>
              ) : (
                <div className="mt-5 py-2.5 px-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-[12px] font-medium text-center">
                  Escolha um horário futuro (após {format(new Date(), "HH:mm")})
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* Máscara de fade e Barra de Ação Inferior    */}
      {/* Apenas botão principal — sem botão voltar duplicado */}
      {/* ═══════════════════════════════════════════ */}
      <>
        {/* Máscara inferior para evitar que o conteúdo passe por baixo */}
        <div
          className="fixed bottom-0 inset-x-0 h-32 pointer-events-none z-[45] bg-gradient-to-t from-background via-background/90 to-transparent"
          aria-hidden="true"
        />

        {/* Container flutuante do botão — 100% centralizado */}
        <div
          className="fixed bottom-0 inset-x-0 z-[50] pointer-events-none flex justify-center items-center px-4 pb-[calc(1.1rem+env(safe-area-inset-bottom,0px))]"
        >
          <div className="w-full max-w-[450px] pointer-events-auto">
            <button
              type="button"
              onClick={internalStep === 0 ? handleGoToTime : handleConfirm}
              disabled={internalStep === 0 ? !selectedDate : !isValid}
              className="w-full h-[52px] px-6 rounded-full bg-foreground text-background font-semibold text-[14px] flex items-center justify-center transition-all shadow-[0_16px_40px_rgba(0,0,0,0.35)] active:scale-[0.98] disabled:opacity-30 disabled:pointer-events-none"
            >
              {internalStep === 0 ? "Continuar" : "Confirmar Agendamento"}
            </button>
          </div>
        </div>
      </>
    </motion.div>
  );
}

