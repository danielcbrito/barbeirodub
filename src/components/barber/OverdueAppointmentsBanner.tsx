import { Check, Clock } from "lucide-react";

interface OverdueAppointmentsBannerProps {
  count: number;
  hasPastDays?: boolean;
  onOpenModal: () => void;
  className?: string;
}

/**
 * Banner de Finalização de Atendimentos — Estratégico Apple HIG.
 * Preto e branco com detalhe sutil âmbar Apple para destaque visual equilibrado.
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
      className={`w-full p-3 sm:p-3.5 rounded-2xl bg-card border border-border/50 dark:border-white/[0.08] flex items-center justify-between gap-3 cursor-pointer hover:border-border active:opacity-75 transition-all shadow-xs select-none ${className}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0">
          <Clock className="w-4 h-4 text-amber-500 stroke-[2.2]" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-[13px] font-semibold text-foreground truncate tracking-tight">
              {count} {count === 1 ? "atendimento para finalizar" : "atendimentos para finalizar"}
            </p>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/25">
              Pendente
            </span>
          </div>
          <p className="text-[11.5px] text-muted-foreground truncate mt-0.5">
            {hasPastDays
              ? "Confirme para fechar o caixa dos dias anteriores."
              : "Toque para confirmar faturamento e fechar o dia."}
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
