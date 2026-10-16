import { Clock } from "lucide-react";

interface OverdueAppointmentsBannerProps {
  count: number;
  hasPastDays?: boolean;
  onOpenModal: () => void;
  className?: string;
}

/**
 * Banner de Finalização de Atendimentos — 100% Minimalista Apple HIG.
 * Preto e branco, sem cores berrantes, sem caixas de fundo e sem poluição visual.
 */
export function OverdueAppointmentsBanner({
  count,
  onOpenModal,
  className = "",
}: OverdueAppointmentsBannerProps) {
  if (count <= 0) return null;

  return (
    <div
      onClick={onOpenModal}
      className={`w-full px-3.5 py-2.5 rounded-2xl bg-amber-500/[0.08] dark:bg-amber-500/[0.12] border border-amber-500/35 dark:border-amber-500/40 flex items-center justify-between gap-3 cursor-pointer hover:bg-amber-500/[0.12] active:opacity-85 transition-all shadow-xs select-none ${className}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Clock className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0 stroke-[2.3]" />
        <span className="text-[13px] font-medium text-foreground truncate tracking-tight">
          {count} {count === 1 ? "agendamento para finalizar" : "agendamentos para finalizar"}
        </span>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenModal();
        }}
        className="h-7 px-3.5 rounded-full bg-foreground text-background text-[12px] font-semibold flex items-center justify-center hover:opacity-90 active:scale-95 transition-all shrink-0 shadow-xs cursor-pointer"
      >
        <span>Finalizar</span>
      </button>
    </div>
  );
}

