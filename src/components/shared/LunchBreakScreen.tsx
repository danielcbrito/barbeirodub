import { Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { TimeWheelPicker } from './TimeWheelPicker';

const DIAS_SEMANA = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
  'Quinta-feira', 'Sexta-feira', 'Sábado'
];

function CurvedBackArrow({ className }: { className?: string }) {
  return (
    <svg
      width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      className={className}
    >
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a4 4 0 0 1 4 4v1" />
    </svg>
  );
}

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
  floatingBottomButton = false,
  hasLunch = true,
  onToggleLunch,
  onboardingFlow = false,
}: LunchBreakScreenProps) {
  return (
    <div
      className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-5"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 14px)" }}
    >
      <div className="flex items-center gap-1.5 min-h-[52px]">

        {!hideBackArrow && (
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-secondary/50 active:scale-95 transition-all -ml-1 shrink-0"
            aria-label="Voltar"
          >
            <CurvedBackArrow className="text-foreground" />
          </button>
        )}

        <div className={`flex-1 min-w-0 ${hideBackArrow ? 'pl-0.5' : ''}`}>
          <h2 className="text-[20px] font-semibold text-foreground tracking-tight leading-none truncate">
            Horário de Almoço
          </h2>
          <p className="text-[11px] text-muted-foreground/60 mt-2.5">
            {DIAS_SEMANA[diaSemana]}
          </p>
        </div>

        {onToggleLunch && (
          <div className="flex flex-col items-center shrink-0">
            <Switch
              checked={hasLunch}
              onCheckedChange={onToggleLunch}
              className="scale-[0.85] data-[state=checked]:bg-emerald-500"
            />
            <span className="text-[8px] text-muted-foreground font-light mt-1">
              {hasLunch ? 'Ativo' : 'Sem almoço'}
            </span>
          </div>
        )}
      </div>


      <div className="h-px bg-border/30 mt-3" />


      <p className="text-[11px] text-muted-foreground/50 leading-relaxed font-light mt-3 mb-2">
        {onboardingFlow && !hasLunch
          ? 'Sem intervalo — você trabalhará direto neste dia. Toque em Confirmar para continuar.'
          : 'Defina o início e o fim do intervalo. Confirme abaixo para voltar aos horários da semana.'}
      </p>


      <div className="h-px bg-border/20" />

      {hasLunch ? (
        <div className="flex-1 flex items-center justify-center py-4">
          <div className="flex items-center gap-0 w-full">
            <div className="flex-1">
              <TimeWheelPicker
                value={inicioValue}
                onChange={onUpdateInicio}
                minuteStep={5}
              />
            </div>

            <span className="text-sm text-muted-foreground/40 mx-1 select-none self-center mt-6">-</span>

            <div className="flex-1">
              <TimeWheelPicker
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
          ? "fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md px-6 pt-5 pb-[calc(18px+env(safe-area-inset-bottom))] bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90"
          : "sticky bottom-0 z-30 mt-auto w-full pt-5 pb-[calc(18px+env(safe-area-inset-bottom))] bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85"
        }
      >
        <Button
          onClick={onSave}
          disabled={saving}
          className="w-full h-[48px] rounded-xl bg-foreground hover:bg-foreground/90 text-background font-semibold text-sm shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
