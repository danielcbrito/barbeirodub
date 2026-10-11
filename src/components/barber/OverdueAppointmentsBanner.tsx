import { CheckCheck, AlertCircle } from "lucide-react";

interface OverdueAppointmentsBannerProps {
  count: number;
  hasPastDays?: boolean;
  onOpenModal: () => void;
  className?: string;
}

export function OverdueAppointmentsBanner({
  count,
  hasPastDays = false,
  onOpenModal,
  className = "",
}: OverdueAppointmentsBannerProps) {
  if (count <= 0) return null;

  return (
    <div
      onClick={onOpenModal}
      className={`w-full p-3 sm:p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between gap-3 cursor-pointer hover:bg-amber-500/15 active:scale-[0.99] transition-all group shadow-2xs ${className}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 animate-pulse" />
        <div className="min-w-0">
          <p className="text-[12.5px] sm:text-[13px] font-semibold text-foreground truncate">
            {count} {count === 1 ? "atendimento pendente" : "atendimentos pendentes"}
          </p>
          <p className="text-[11px] text-muted-foreground truncate">
            {hasPastDays
              ? "Agendamentos em atraso aguardando fechamento."
              : "Horário finalizado. Confirme para computar seu faturamento."}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenModal();
        }}
        className="h-8 px-3 rounded-full bg-foreground text-background text-[11.5px] font-semibold flex items-center gap-1.5 hover:opacity-90 active:scale-95 transition-all shrink-0 shadow-xs"
      >
        <CheckCheck className="w-3.5 h-3.5" />
        <span>Confirmar todos</span>
      </button>
    </div>
  );
}
