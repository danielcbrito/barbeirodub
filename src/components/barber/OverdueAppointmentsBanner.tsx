import { Check } from "lucide-react";

interface OverdueAppointmentsBannerProps {
  count: number;
  hasPastDays?: boolean;
  onOpenModal: () => void;
  className?: string;
}

/**
 * Banner de Finalização de Atendimentos — 100% Apple HIG.
 * Minimalista, preto e branco, sem cores berrantes.
 */
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
      className={`w-full p-3 sm:p-3.5 rounded-2xl bg-card border border-border/40 flex items-center justify-between gap-3 cursor-pointer hover:bg-secondary/40 active:opacity-75 transition-all shadow-xs select-none ${className}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-2 h-2 rounded-full bg-foreground shrink-0" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground truncate tracking-tight">
            {count} {count === 1 ? "atendimento para finalizar" : "atendimentos para finalizar"}
          </p>
          <p className="text-[11.5px] text-muted-foreground truncate">
            {hasPastDays
              ? "Confirme para fechar o caixa dos dias anteriores."
              : "Horário finalizado. Toque para confirmar faturamento."}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenModal();
        }}
        className="h-8 px-3.5 rounded-full bg-foreground text-background text-[12px] font-semibold flex items-center gap-1.5 hover:opacity-90 active:scale-95 transition-all shrink-0 shadow-xs cursor-pointer"
      >
        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
        <span>Finalizar</span>
      </button>
    </div>
  );
}
