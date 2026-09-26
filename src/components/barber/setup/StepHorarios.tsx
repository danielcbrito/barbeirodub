import { useState } from "react";
import AdminHorarios from "@/components/admin/AdminHorarios";
import { Loader2 } from "lucide-react";

type HorariosViewMode = 'list' | 'day' | 'advanced';

interface Props {
  barbeiroId?: string;
  onViewModeChange?: (mode: HorariosViewMode) => void;
  isOnboardingFlow?: boolean;
  resetToListSignal?: number;
}

/**
 * Step 5 — Horários de funcionamento (inline).
 * Reutiliza o componente AdminHorarios com barbeiroId.
 */
export function StepHorarios({ barbeiroId, onViewModeChange, isOnboardingFlow = false, resetToListSignal = 0 }: Props) {
  const [viewMode, setViewMode] = useState<HorariosViewMode>('list');
  const showIntro = viewMode === 'list';

  if (isOnboardingFlow && !barbeiroId) {
    return (
      <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-foreground/70">
        <Loader2 className="h-5 w-5 animate-spin" />
        <p className="text-[13px]">Preparando seus horários...</p>
      </div>
    );
  }

  return (
    <div className={showIntro ? "space-y-4" : "space-y-0"}>
      {showIntro && (
        <div>
          <h2 className="text-[22px] font-semibold text-foreground leading-tight">
            Seu horário de funcionamento
          </h2>
          <p className="text-[13px] text-foreground/90 mt-1">
            Quando os clientes podem reservar com você?
          </p>
        </div>
      )}

      <div className="-mx-2">
        <AdminHorarios
          barbeiroId={barbeiroId}
          hideTitle
          hideAdvanced
          hideSaveButton={isOnboardingFlow}
          autoSaveOnDayExit={false}
          dayHideBackArrow={isOnboardingFlow}
          daySaveLabel={isOnboardingFlow ? 'Continuar' : undefined}
          dayHideSaveWhenUnchanged={false}
          dayFloatingBottomButton={isOnboardingFlow}
          dayOnboardingFlow={isOnboardingFlow}
          resetToListSignal={resetToListSignal}
          forceOnboardingDefaultHours={isOnboardingFlow}
          hideDayListChevron={isOnboardingFlow}
          onViewModeChange={(mode) => {
            setViewMode(mode);
            onViewModeChange?.(mode);
          }}
        />
      </div>
    </div>
  );
}

