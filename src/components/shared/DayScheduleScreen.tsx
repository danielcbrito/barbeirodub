import { Loader2, ChevronRight } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { TimeWheelPicker } from './TimeWheelPicker';
import { LunchBreakScreen } from './LunchBreakScreen';
import { SlotIntervalScreen } from './SlotIntervalScreen';
import { AnimatePresence } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';

const DIAS_SEMANA = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
  'Quinta-feira', 'Sexta-feira', 'Sábado'
];

function CurvedBackArrow({ className }: { className?: string }) {
  return (
    <svg
      width="26" height="26" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      className={className}
    >
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a4 4 0 0 1 4 4v1" />
    </svg>
  );
}

export interface DayConfig {
  dia_semana: number;
  aberto: boolean | null;
  hora_abertura: string | null;
  hora_fechamento: string | null;
  hora_almoco_inicio: string | null;
  hora_almoco_fim: string | null;
  slot_interval_minutes?: number | null;
}

interface DayScheduleScreenProps {
  config: DayConfig;
  onBack: () => void;
  onUpdate: (field: string, value: any) => void;
  onSave: () => void | boolean | Promise<void | boolean>;
  saving: boolean;
  hasChanges: boolean;
  hideBackArrow?: boolean;
  saveLabel?: string;
  hideSaveWhenUnchanged?: boolean;
  floatingBottomButton?: boolean;
  /** Onboarding: primary button says "Continuar" and goes to lunch step. */
  onboardingFlow?: boolean;
  /** Onboarding: chamado ao confirmar o almoço, ao invés de salvar direto. */
  onOnboardingDayComplete?: () => void;
  /** Valor padrão da barbearia, usado quando slot_interval_minutes do dia é null */
  tenantSlotInterval?: number | null;
  /** Salva o intervalo (dia ou semana toda). Se ausente, o item não aparece. */
  onSaveSlotInterval?: (minutos: number, aplicarTodosDias: boolean) => Promise<void> | void;
  savingSlotInterval?: boolean;
}

const normalizeTime = (value: string | null | undefined) => value ? value.slice(0, 5) : null;

const getDaySignature = (config: DayConfig) => JSON.stringify({
  dia_semana: config.dia_semana,
  aberto: config.aberto ?? null,
  hora_abertura: normalizeTime(config.hora_abertura),
  hora_fechamento: normalizeTime(config.hora_fechamento),
  hora_almoco_inicio: normalizeTime(config.hora_almoco_inicio),
  hora_almoco_fim: normalizeTime(config.hora_almoco_fim),
});

export function DayScheduleScreen({
  config, onBack, onUpdate, onSave, saving, hasChanges,
  hideBackArrow = false, saveLabel = 'OK', hideSaveWhenUnchanged = false,
  floatingBottomButton = false, onboardingFlow = false,
  onOnboardingDayComplete,
  tenantSlotInterval, onSaveSlotInterval, savingSlotInterval = false,
}: DayScheduleScreenProps) {
  const [showLunchScreen, setShowLunchScreen] = useState(false);
  const [showSlotScreen, setShowSlotScreen] = useState(false);
  const initialDaySignatureRef = useRef(getDaySignature(config));

  useEffect(() => {
    initialDaySignatureRef.current = getDaySignature(config);
    setShowLunchScreen(false);
    setShowSlotScreen(false);
  }, [config.dia_semana]);

  const localHasChanges = useMemo(
    () => getDaySignature(config) !== initialDaySignatureRef.current,
    [config]
  );
  const shouldShowConfirmButton = onboardingFlow || !hideSaveWhenUnchanged || hasChanges || localHasChanges;

  const hasLunch = !!(config.hora_almoco_inicio && config.hora_almoco_fim);
  const lunchResumo = hasLunch
    ? `${config.hora_almoco_inicio?.slice(0, 5)} - ${config.hora_almoco_fim?.slice(0, 5)}`
    : 'Não configurado';

  const effectiveSaveLabel = onboardingFlow ? 'Continuar' : saveLabel;

  const handlePrimary = async () => {
    if (onboardingFlow && config.aberto) {
      setShowLunchScreen(true);
      return;
    }
    const result = await onSave();
    if (result === false) return;
    if (result === true) return;
    onBack();
  };

  // Chamado pelo LunchBreakScreen ao confirmar.
  const handleLunchConfirm = async () => {
    if (onboardingFlow && onOnboardingDayComplete) {
      onOnboardingDayComplete();
      return;
    }
    const result = await onSave();
    if (result === false) return;
    onBack();
  };

  const handleUpdate = (field: string, value: any) => {
    onUpdate(field, value);
  };

  if (showLunchScreen) {
    return (
      <AnimatePresence mode="wait">
        <LunchBreakScreen
          key="lunch"
          diaSemana={config.dia_semana}
          inicioValue={config.hora_almoco_inicio || '12:00'}
          fimValue={config.hora_almoco_fim || '13:00'}
          hasLunch={hasLunch}
          onToggleLunch={(enabled) => {
            if (enabled) {
              if (!config.hora_almoco_inicio) handleUpdate('hora_almoco_inicio', '12:00');
              if (!config.hora_almoco_fim) handleUpdate('hora_almoco_fim', '13:00');
            } else {
              handleUpdate('hora_almoco_inicio', null);
              handleUpdate('hora_almoco_fim', null);
            }
          }}
          onUpdateInicio={(v) => handleUpdate('hora_almoco_inicio', v)}
          onUpdateFim={(v) => handleUpdate('hora_almoco_fim', v)}
          onBack={() => setShowLunchScreen(false)}
          onSave={handleLunchConfirm}
          saving={saving}
          hasChanges={hasChanges}
          hideBackArrow={onboardingFlow}
          saveLabel={onboardingFlow ? 'Confirmar' : saveLabel}
          floatingBottomButton={floatingBottomButton}
          onboardingFlow={onboardingFlow}
        />
      </AnimatePresence>
    );
  }

  if (showSlotScreen && onSaveSlotInterval) {
    const currentSlot = config.slot_interval_minutes ?? tenantSlotInterval ?? 15;
    return (
      <AnimatePresence mode="wait">
        <SlotIntervalScreen
          key="slot"
          diaSemana={config.dia_semana}
          currentValue={currentSlot}
          saving={savingSlotInterval}
          onBack={() => setShowSlotScreen(false)}
          onConfirm={async (minutos, aplicarTodos) => {
            await onSaveSlotInterval(minutos, aplicarTodos);
            setShowSlotScreen(false);
          }}
          floatingBottomButton={floatingBottomButton}
        />
      </AnimatePresence>
    );
  }

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

        <h2 className={`text-[20px] font-semibold text-foreground tracking-tight flex-1 truncate ${hideBackArrow ? 'pl-0.5' : ''}`}>
          {DIAS_SEMANA[config.dia_semana]}
        </h2>


        {config.aberto !== null && config.aberto !== undefined && (
          <div className="flex flex-col items-center shrink-0 mt-4">


            <Switch
              checked={!!config.aberto}
              onCheckedChange={(checked) => handleUpdate('aberto', checked)}
              className="scale-[0.85] data-[state=checked]:bg-emerald-500"
            />
            <span className="text-[8px] text-muted-foreground font-light mt-1">
              {config.aberto ? 'Aberto' : 'Fechado'}
            </span>
          </div>
        )}
      </div>

      <div className="h-px bg-border/25 mt-3" />


      {config.aberto === null || config.aberto === undefined ? (
        <div className="flex-1 flex flex-col items-center justify-center py-16 px-4">
          <p className="text-[14px] text-foreground/90 font-medium mb-2 text-center">
            Este dia ainda não foi configurado
          </p>
          <p className="text-[12px] text-muted-foreground/70 mb-8 text-center max-w-[280px]">
            Selecione se a barbearia estará aberta ou fechada neste dia.
          </p>
          <div className="flex gap-3 w-full max-w-[320px]">
            <Button
              onClick={() => handleUpdate('aberto', false)}
              variant="outline"
              className="flex-1 h-[48px] rounded-xl font-semibold text-sm"
            >
              Fechado
            </Button>
            <Button
              onClick={() => {
                handleUpdate('aberto', true);
                if (!config.hora_abertura) handleUpdate('hora_abertura', '09:00');
                if (!config.hora_fechamento) handleUpdate('hora_fechamento', '20:00');
              }}
              className="flex-1 h-[48px] rounded-xl bg-emerald-500 hover:bg-emerald-600 text-foreground font-semibold text-sm"
            >
              Aberto
            </Button>
          </div>
        </div>
      ) : config.aberto ? (
        <div className="flex-1 flex flex-col mt-3">
          <p className="text-[11px] text-muted-foreground/50 leading-relaxed font-light mb-3">
            {onboardingFlow
              ? 'Defina o seu horário de trabalho. Depois toque em Continuar para configurar o horário de almoço.'
              : 'Defina o seu horário de trabalho aqui. Se mexer no horário, confirme no botão abaixo para salvar e voltar para a semana.'}
          </p>


          <div className="h-px bg-border/20" />

          <div className="flex items-center justify-center gap-0 py-2">
            <div className="flex-1">
              <TimeWheelPicker
                value={config.hora_abertura || (onboardingFlow ? '00:00' : '09:00')}
                onChange={(v) => handleUpdate('hora_abertura', v)}
                minuteStep={5}
              />
            </div>
            <span className="text-sm text-muted-foreground/40 mx-1 select-none self-center mt-6">-</span>
            <div className="flex-1">
              <TimeWheelPicker
                value={config.hora_fechamento || (onboardingFlow ? '00:00' : '20:00')}
                onChange={(v) => handleUpdate('hora_fechamento', v)}
                minuteStep={5}
              />
            </div>
          </div>

          <div className="h-px bg-border/20" />

          {/* Fora do onboarding: acesso rápido ao intervalo direto daqui */}
          {!onboardingFlow && (
            <div className="mt-3">
              <span className="text-[11px] text-muted-foreground/50 font-light uppercase tracking-wider">
                Intervalos
              </span>
              <div className="h-px bg-border/15 mt-2" />

              <button
                onClick={() => {
                  if (!config.hora_almoco_inicio) handleUpdate('hora_almoco_inicio', '12:00');
                  if (!config.hora_almoco_fim) handleUpdate('hora_almoco_fim', '13:00');
                  setShowLunchScreen(true);
                }}
                className="flex items-center gap-3 py-3.5 w-full text-left active:bg-muted/5 transition-colors"
              >
                {hasLunch ? (
                  <>
                    <span className="text-[13px] text-foreground font-medium">Horário de Almoço</span>
                    <span className="text-[13px] text-muted-foreground/50 ml-auto">{lunchResumo}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/25 flex-shrink-0" />
                  </>
                ) : (
                  <>
                    <span className="text-base text-muted-foreground/40">+</span>
                    <span className="text-[13px] text-foreground font-medium">Adicionar intervalo</span>
                  </>
                )}
              </button>
              <div className="h-px bg-border/15" />

              {onSaveSlotInterval && (
                <>
                  <button
                    onClick={() => setShowSlotScreen(true)}
                    className="flex items-center gap-3 py-3.5 w-full text-left active:bg-muted/5 transition-colors"
                  >
                    <span className="text-[13px] text-foreground font-medium">Intervalo de horários</span>
                    <span className="text-[13px] text-muted-foreground/50 ml-auto">
                      {(config.slot_interval_minutes ?? tenantSlotInterval ?? 15)} min
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/25 flex-shrink-0" />
                  </button>
                  <div className="h-px bg-border/15" />
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center py-16">
          <p className="text-sm text-muted-foreground/50">
            Este dia está marcado como fechado
          </p>
        </div>
      )}

      {shouldShowConfirmButton && (
        <div
          className={floatingBottomButton
            ? "fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md px-6 pt-5 pb-[calc(18px+env(safe-area-inset-bottom))] bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90"
            : "sticky bottom-0 z-30 mt-auto w-full pt-5 pb-[calc(18px+env(safe-area-inset-bottom))] bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85"
          }
        >
          <Button
            onClick={handlePrimary}
            disabled={config.aberto === null || config.aberto === undefined || saving}
            className="w-full h-[48px] rounded-xl bg-foreground hover:bg-foreground/90 text-background font-semibold text-sm shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Salvando...
              </>
            ) : (
              effectiveSaveLabel
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
