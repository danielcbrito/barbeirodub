import { Loader2, ChevronRight, ChevronLeft, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { TimeWheelPicker } from './TimeWheelPicker';
import { LunchBreakScreen } from './LunchBreakScreen';
import { SlotIntervalScreen } from './SlotIntervalScreen';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const DIAS_SEMANA = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
  'Quinta-feira', 'Sexta-feira', 'Sábado'
];

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
  /** Permite copiar e aplicar o horário deste dia a outros dias da semana */
  onApplyToOtherDays?: (sourceConfig: DayConfig, selectedDays: number[]) => Promise<void> | void;
  /** Resumos existentes dos outros dias para exibição na gaveta de aplicação */
  existingDaySummaries?: Record<number, string>;
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
  floatingBottomButton = true, onboardingFlow = false,
  onOnboardingDayComplete,
  tenantSlotInterval, onSaveSlotInterval, savingSlotInterval = false,
  onApplyToOtherDays, existingDaySummaries,
}: DayScheduleScreenProps) {
  const [showLunchScreen, setShowLunchScreen] = useState(false);
  const [showSlotScreen, setShowSlotScreen] = useState(false);
  const [showApplyDrawer, setShowApplyDrawer] = useState(false);
  const [drawerSaving, setDrawerSaving] = useState(false);
  const [drawerSelectedDays, setDrawerSelectedDays] = useState<number[]>(
    [0, 1, 2, 3, 4, 5, 6].filter(d => d !== config.dia_semana)
  );
  const initialDaySignatureRef = useRef(getDaySignature(config));

  useEffect(() => {
    initialDaySignatureRef.current = getDaySignature(config);
    setShowLunchScreen(false);
    setShowSlotScreen(false);
    setShowApplyDrawer(false);
    setDrawerSelectedDays([0, 1, 2, 3, 4, 5, 6].filter(d => d !== config.dia_semana));
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

    // Se temos suporte a aplicar para os outros dias e o dia está aberto, abre a gaveta
    if (onApplyToOtherDays && config.aberto) {
      setShowApplyDrawer(true);
      return;
    }

    // Caso contrário, salva diretamente e volta
    const result = await onSave();
    if (result === false) return;
    onBack();
  };

  const handleSaveOnlyCurrentDay = async () => {
    setShowApplyDrawer(false);
    const result = await onSave();
    if (result === false) return;
    onBack();
  };

  const handleConfirmApplyToDays = async () => {
    if (!onApplyToOtherDays) {
      await handleSaveOnlyCurrentDay();
      return;
    }

    if (drawerSelectedDays.length === 0) {
      await handleSaveOnlyCurrentDay();
      return;
    }

    setDrawerSaving(true);
    try {
      await onApplyToOtherDays(config, drawerSelectedDays);
      setShowApplyDrawer(false);
      onBack();
    } catch (err) {
      console.error(err);
    } finally {
      setDrawerSaving(false);
    }
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
            handleUpdate('slot_interval_minutes', minutos);
            await onSaveSlotInterval(minutos, aplicarTodos);
            setShowSlotScreen(false);
          }}
          floatingBottomButton={floatingBottomButton}
        />
      </AnimatePresence>
    );
  }

  return (
    <div className="w-full max-w-lg mx-auto flex-1 flex flex-col min-h-full pb-28">
      {/* ── Header: Seta alinhada à esquerda + Título do dia + Switch Aberto/Fechado ── */}
      <div className="flex items-center gap-2 min-h-[56px] py-1 border-b border-border/15 mb-3">
        {!hideBackArrow && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Voltar"
            className="w-9 h-9 rounded-full bg-secondary/80 hover:bg-secondary active:scale-95 transition-all shrink-0 text-foreground flex items-center justify-center border border-border/30"
          >
            <ChevronLeft className="w-5 h-5 stroke-[2.2]" />
          </button>
        )}

        <div className="flex-1 min-w-0">
          <h2 className="text-[20px] font-semibold text-foreground tracking-tight truncate leading-none">
            {DIAS_SEMANA[config.dia_semana]}
          </h2>
        </div>

        {config.aberto !== null && config.aberto !== undefined && (
          <div className="flex items-center gap-2 shrink-0">
            <span className={cn(
              "text-xs font-medium",
              config.aberto ? "text-emerald-500" : "text-muted-foreground/60"
            )}>
              {config.aberto ? 'Aberto' : 'Fechado'}
            </span>
            <Switch
              checked={!!config.aberto}
              onCheckedChange={(checked) => handleUpdate('aberto', checked)}
              className="data-[state=checked]:bg-emerald-500"
            />
          </div>
        )}
      </div>

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
        <div className="flex-1 flex flex-col space-y-6 pt-4">
          {/* Carrosséis centralizados no centro da tela */}
          <div className="flex items-center justify-center gap-5 sm:gap-6 py-4 w-full">
            <div className="w-[130px] shrink-0 flex justify-center">
              <TimeWheelPicker
                value={config.hora_abertura || (onboardingFlow ? '00:00' : '09:00')}
                onChange={(v) => handleUpdate('hora_abertura', v)}
                minuteStep={5}
              />
            </div>
            <div className="w-[130px] shrink-0 flex justify-center">
              <TimeWheelPicker
                value={config.hora_fechamento || (onboardingFlow ? '00:00' : '20:00')}
                onChange={(v) => handleUpdate('hora_fechamento', v)}
                minuteStep={5}
              />
            </div>
          </div>

          {/* ── Intervalos e Pausas (Minimalista e sem ícones nas laterais) ── */}
          {!onboardingFlow && (
            <div className="space-y-2 pt-2">
              <span className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider px-1">
                Intervalos e Pausas
              </span>

              <div className="rounded-2xl border border-border/40 bg-card/60 backdrop-blur-sm divide-y divide-border/20 overflow-hidden shadow-xs">
                {/* Horário de Almoço */}
                <button
                  type="button"
                  onClick={() => {
                    if (!config.hora_almoco_inicio) handleUpdate('hora_almoco_inicio', '12:00');
                    if (!config.hora_almoco_fim) handleUpdate('hora_almoco_fim', '13:00');
                    setShowLunchScreen(true);
                  }}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/10 active:bg-muted/15 transition-all group"
                >
                  <div className="min-w-0 pr-3">
                    <p className="text-[14.5px] font-semibold text-foreground leading-snug">
                      Horário de Almoço
                    </p>
                    <p className="text-[12px] text-muted-foreground/75 mt-0.5 leading-tight">
                      {hasLunch ? 'Pausa programada no expediente' : 'Nenhum intervalo configurado'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn(
                      "text-xs font-medium px-2.5 py-1 rounded-full tabular-nums border",
                      hasLunch
                        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                        : "bg-muted/50 text-muted-foreground/70 border-border/40"
                    )}>
                      {lunchResumo}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground transition-colors" />
                  </div>
                </button>

                {/* Intervalo entre horários */}
                {onSaveSlotInterval && (
                  <button
                    type="button"
                    onClick={() => setShowSlotScreen(true)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/10 active:bg-muted/15 transition-all group"
                  >
                    <div className="min-w-0 pr-3">
                      <p className="text-[14.5px] font-semibold text-foreground leading-snug">
                        Intervalo entre horários
                      </p>
                      <p className="text-[12px] text-muted-foreground/75 mt-0.5 leading-tight">
                        Duração de cada bloco de agendamento
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-secondary text-foreground tabular-nums border border-border/40">
                        {(config.slot_interval_minutes ?? tenantSlotInterval ?? 15)} min
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground transition-colors" />
                    </div>
                  </button>
                )}
              </div>
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

      {/* Botão de confirmação/salvar na parte inferior */}
      {shouldShowConfirmButton && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-lg px-4 pt-3 pb-[calc(18px+env(safe-area-inset-bottom))] bg-background/95 backdrop-blur-md border-t border-border/20 shadow-lg"
        >
          <Button
            onClick={handlePrimary}
            disabled={config.aberto === null || config.aberto === undefined || saving}
            className="w-full h-[52px] rounded-2xl bg-foreground hover:bg-foreground/90 text-background font-semibold text-base shadow-sm active:scale-[0.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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

      {/* ── Gaveta (Bottom Sheet Drawer): Aplicar a outros dias da semana ── */}
      <AnimatePresence>
        {showApplyDrawer && (
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleSaveOnlyCurrentDay}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            />

            {/* Painel da gaveta */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="relative z-50 w-full max-w-lg rounded-t-[28px] border-t border-border/40 bg-card p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-2xl space-y-4 max-h-[85vh] flex flex-col"
            >
              {/* Alça superior */}
              <div className="w-10 h-1.5 rounded-full bg-muted-foreground/20 mx-auto shrink-0" />

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[17px] font-semibold text-foreground tracking-tight">
                    Aplicar a outros dias?
                  </h3>
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    Deseja replicar este horário para outros dias da semana?
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSaveOnlyCurrentDay}
                  className="w-8 h-8 rounded-full bg-secondary/80 hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Fechar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Ações rápidas */}
              <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
                <span>Dias selecionados</span>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setDrawerSelectedDays([0, 1, 2, 3, 4, 5, 6].filter(d => d !== config.dia_semana))}
                    className="hover:text-foreground font-medium transition-colors"
                  >
                    Selecionar todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setDrawerSelectedDays([])}
                    className="hover:text-foreground font-medium transition-colors"
                  >
                    Limpar
                  </button>
                </div>
              </div>

              {/* Lista dos dias com checkboxes */}
              <div className="overflow-y-auto space-y-1.5 flex-1 pr-1 max-h-[40vh]">
                {DIAS_SEMANA.map((diaNome, diaIdx) => {
                  if (diaIdx === config.dia_semana) return null;
                  const isSelected = drawerSelectedDays.includes(diaIdx);
                  const currentSummary = existingDaySummaries?.[diaIdx];

                  return (
                    <button
                      key={diaIdx}
                      type="button"
                      onClick={() => {
                        setDrawerSelectedDays(prev =>
                          prev.includes(diaIdx) ? prev.filter(d => d !== diaIdx) : [...prev, diaIdx].sort()
                        );
                      }}
                      className={cn(
                        "w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all",
                        isSelected
                          ? "bg-secondary/70 border-foreground/30 text-foreground"
                          : "bg-card/40 border-border/20 text-muted-foreground hover:bg-muted/10"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => {}}
                          className="pointer-events-none"
                        />
                        <span className="text-[13.5px] font-medium text-foreground">
                          {diaNome}
                        </span>
                      </div>
                      {currentSummary && (
                        <span className="text-xs text-muted-foreground/60 tabular-nums">
                          {currentSummary}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Botões do rodapé da gaveta */}
              <div className="space-y-2 pt-2">
                <Button
                  onClick={handleConfirmApplyToDays}
                  disabled={drawerSaving || saving}
                  className="w-full h-[48px] rounded-xl bg-foreground hover:bg-foreground/90 text-background font-semibold text-sm transition-colors"
                >
                  {drawerSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Aplicando...
                    </>
                  ) : (
                    drawerSelectedDays.length > 0
                      ? `Aplicar a ${drawerSelectedDays.length} ${drawerSelectedDays.length === 1 ? 'dia' : 'dias'}`
                      : 'Salvar apenas este dia'
                  )}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleSaveOnlyCurrentDay}
                  disabled={drawerSaving || saving}
                  className="w-full h-[40px] rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Salvar apenas para {DIAS_SEMANA[config.dia_semana]}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
