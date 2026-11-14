import { Loader2, ChevronLeft } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { TimeWheelPicker } from './TimeWheelPicker';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const DIAS_SEMANA = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
  'Quinta-feira', 'Sexta-feira', 'Sábado'
];

interface LunchBreakScreenProps {
  diaSemana: number;
  inicioValue: string;
  fimValue: string;
  onUpdateInicio: (value: string) => void;
  onUpdateFim: (value: string) => void;
  onBack: () => void;
  onSave: () => void;
  saving: boolean;
  hasChanges: boolean;
  hideBackArrow?: boolean;
  saveLabel?: string;
  floatingBottomButton?: boolean;
  /** Se há intervalo ativado. Onboarding usa isso para toggle. */
  hasLunch?: boolean;
  /** Callback ao ligar/desligar o intervalo. */
  onToggleLunch?: (enabled: boolean) => void;
  /** Onboarding mode: mostra toggle para desativar almoço. */
  onboardingFlow?: boolean;
}

export function LunchBreakScreen({
  diaSemana,
  inicioValue,
  fimValue,
  onUpdateInicio,
  onUpdateFim,
  onBack,
  onSave,
  saving,
  hideBackArrow = false,
  saveLabel = 'OK',
  floatingBottomButton = true,
  hasLunch = true,
  onToggleLunch,
  onboardingFlow = false,
}: LunchBreakScreenProps) {
  const handleConfirm = () => {
    if (hasLunch) {
      const [h1, m1] = (inicioValue || "12:00").split(':').map(Number);
      const [h2, m2] = (fimValue || "13:00").split(':').map(Number);
      const min1 = (h1 || 0) * 60 + (m1 || 0);
      const min2 = (h2 || 0) * 60 + (m2 || 0);

      if (min1 >= min2) {
        toast.error("O horário de início do almoço deve ser anterior ao de término.");
        return;
      }
    }
    onSave();
  };
  return (
    <div
      className="mx-auto flex min-h-full w-full max-w-md flex-col px-4 sm:px-0 pb-28"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}
    >
      <div className="flex items-center gap-2 min-h-[56px] py-1">
        {!hideBackArrow && (
          <button
            type="button"
            onClick={onBack}
            className="w-9 h-9 rounded-full bg-secondary/80 hover:bg-secondary active:scale-95 transition-all shrink-0 text-foreground flex items-center justify-center border border-border/30"
            aria-label="Voltar"
          >
            <ChevronLeft className="w-5 h-5 stroke-[2.2]" />
          </button>
        )}

        <div className={`flex-1 min-w-0 ${hideBackArrow ? 'pl-0.5' : ''}`}>
          <h2 className="text-[20px] font-semibold text-foreground tracking-tight leading-none truncate">
            Horário de Almoço
          </h2>
          <p className="text-[12px] text-muted-foreground/70 mt-1 truncate">
            {DIAS_SEMANA[diaSemana]}
          </p>
        </div>

        {onToggleLunch && (
          <div className="flex items-center gap-2 shrink-0">
            <span className={cn(
              "text-xs font-medium",
              hasLunch ? "text-emerald-500" : "text-muted-foreground/60"
            )}>
              {hasLunch ? 'Ativo' : 'Sem almoço'}
            </span>
            <Switch
              checked={hasLunch}
              onCheckedChange={onToggleLunch}
              className="data-[state=checked]:bg-emerald-500"
            />
          </div>
        )}
      </div>

      <div className="h-px bg-border/20 mt-2 mb-3" />

      <p className="text-[12px] text-muted-foreground/70 leading-relaxed font-light mb-3">
        {onboardingFlow && !hasLunch
          ? 'Sem intervalo — você trabalhará direto neste dia. Toque em Confirmar para continuar.'
          : 'Defina o início e o fim do intervalo de almoço.'}
      </p>

      {hasLunch ? (
        <div className="rounded-2xl border border-border/40 bg-card/60 backdrop-blur-sm p-4 shadow-xs space-y-3 my-2">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
              Intervalo Programado
            </span>
            <span className="text-xs font-semibold text-amber-500 tabular-nums px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
              {(inicioValue || '12:00').slice(0, 5)} — {(fimValue || '13:00').slice(0, 5)}
            </span>
          </div>

          <div className="flex items-center justify-center gap-4 sm:gap-6 py-2">
            <div className="w-[130px] shrink-0 flex justify-center">
              <TimeWheelPicker
                label="Início"
                value={inicioValue}
                onChange={onUpdateInicio}
                minuteStep={5}
              />
            </div>
            <div className="w-[130px] shrink-0 flex justify-center">
              <TimeWheelPicker
                label="Término"
                value={fimValue}
                onChange={onUpdateFim}
                minuteStep={5}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center py-16">
          <p className="text-sm text-muted-foreground/50 text-center px-6">
            Nenhum intervalo será registrado para este dia.
          </p>
        </div>
      )}

      <div
        className={floatingBottomButton
          ? "fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))] bg-background/95 backdrop-blur-md border-t border-border/20 shadow-lg"
          : "sticky bottom-0 z-30 mt-auto w-full px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))] bg-background/95 backdrop-blur-md border-t border-border/20"
        }
      >
        <Button
          onClick={handleConfirm}
          disabled={saving}
          className="w-full h-[50px] rounded-2xl bg-foreground hover:bg-foreground/90 text-background font-semibold text-base shadow-sm active:scale-[0.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Salvando...
            </>
          ) : (
            saveLabel
          )}
        </Button>
      </div>
    </div>
  );
}
