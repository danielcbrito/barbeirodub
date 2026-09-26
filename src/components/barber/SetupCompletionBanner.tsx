import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { CheckCircle2, ChevronRight, AlertCircle } from "lucide-react";
import { useState } from "react";
import type { SetupStep } from "@/hooks/useSetupCompletion";

interface SetupCompletionBannerProps {
  percentage: number;
  steps: SetupStep[];
  loading: boolean;
  /** Modo compacto para dashboard, expandido para perfil */
  variant?: "compact" | "detailed";
}

/**
 * Banner de progresso de configuração da barbearia.
 * Compact: barra + percentual + CTA (para dashboard)
 * Detailed: card colapsável elegante (para perfil)
 */
export function SetupCompletionBanner({
  percentage,
  steps,
  loading,
  variant = "compact",
}: SetupCompletionBannerProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  // Não mostrar se 100% ou carregando
  if (loading || percentage === 100) return null;

  const pendingSteps = steps.filter((s) => !s.completed);
  const completedCount = steps.filter((s) => s.completed).length;

  // ── Cor dinâmica baseada no progresso ──
  const progressColor =
    percentage < 40 ? "text-amber-500" : percentage < 70 ? "text-blue-500" : "text-emerald-500";
  const progressBg =
    percentage < 40 ? "bg-amber-500" : percentage < 70 ? "bg-blue-500" : "bg-emerald-500";

  // ══════════════════════════════════════════════
  // ── COMPACT — para dashboard ──
  // ══════════════════════════════════════════════
  if (variant === "compact") {
    return (
      <button
        onClick={() => {
          const firstPending = pendingSteps[0];
          if (firstPending?.route) navigate(firstPending.route);
        }}
        className="w-full rounded-xl bg-card border border-border/40 p-4 text-left active:scale-[0.99] transition-all"
      >
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <span className="text-[13px] font-semibold text-foreground">
              Configure sua barbearia
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-bold text-foreground tabular-nums">
              {percentage}%
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
          </div>
        </div>

        <div className="w-full h-2 rounded-full bg-secondary/60 overflow-hidden">
          <div
            style={{ width: `${percentage}%` }}
            className={cn("h-full rounded-full", progressBg)}
          />
        </div>

        <p className="text-[11px] text-muted-foreground mt-2">
          {pendingSteps.length === 1
            ? `Falta apenas: ${pendingSteps[0].label}`
            : `${pendingSteps.length} itens pendentes`}
        </p>
      </button>
    );
  }

  // ══════════════════════════════════════════════
  // ── DETAILED — para perfil (redesign premium) ──
  // ══════════════════════════════════════════════
  return (
    <div
      className="rounded-2xl border border-border/30 bg-card/80 backdrop-blur-sm overflow-hidden"
    >
      {/* ── Header clicável — sempre visível ── */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left active:opacity-80 transition-opacity"
      >
        {/* Indicador circular de progresso */}
        <div className="relative w-11 h-11 shrink-0">
          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
            <circle
              cx="18" cy="18" r="15.5"
              fill="none"
              stroke="hsl(var(--secondary))"
              strokeWidth="3"
              opacity="0.3"
            />
            <circle
              cx="18" cy="18" r="15.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${percentage * 0.974} 100`}
              className={progressColor}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={cn("text-[11px] font-bold tabular-nums", progressColor)}>
              {percentage}%
            </span>
          </div>
        </div>

        {/* Texto */}
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-foreground leading-tight">
            Configuração
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {completedCount}/{steps.length} concluídos · {pendingSteps.length} {pendingSteps.length === 1 ? "pendente" : "pendentes"}
          </p>
        </div>

        {/* Chevron animado */}
        <div
          style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
        </div>
      </button>

      {/* ── Lista colapsável de steps ── */}
      {expanded && (
          <div className="overflow-hidden">
            <div className="px-4 pb-4 pt-0.5 space-y-1">
              {/* Separador sutil */}
              <div className="h-px bg-border/30 mb-2" />

              {steps.map((step) => (
                <button
                  key={step.id}
                  onClick={() => step.route && navigate(step.route)}
                  disabled={step.completed}
                  className={cn(
                    "w-full flex items-center gap-2.5 py-2 px-2 text-left rounded-xl transition-all",
                    step.completed
                      ? "opacity-45 cursor-default"
                      : "hover:bg-secondary/20 active:scale-[0.98]"
                  )}
                >
                  {step.completed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-[1.5px] border-muted-foreground/25 shrink-0" />
                  )}
                  <span
                    className={cn(
                      "text-[13px] flex-1",
                      step.completed
                        ? "text-muted-foreground line-through"
                        : "text-foreground font-medium"
                    )}
                  >
                    {step.label}
                  </span>
                  {!step.completed && step.route && (
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>
      )}
    </div>
  );
}
