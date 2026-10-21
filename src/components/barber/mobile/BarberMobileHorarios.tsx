import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSaveBarberSchedule } from '@/hooks/useBarberMutations';
import { ChevronRight, Clock, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { DayScheduleScreen, type DayConfig } from '@/components/shared/DayScheduleScreen';
import { ApplyScheduleToWeekScreen } from '@/components/shared/ApplyScheduleToWeekScreen';
import { BarberContext } from '@/pages/Barbeiro';
import BarberVacationMode from '@/components/barber/BarberVacationMode';
import BarberHorariosExcepcionais from '@/components/barber/BarberHorariosExcepcionais';
import { useSaveSlotInterval } from '@/hooks/useHorariosMutations';
import { ScreenShell, StickyFooter, PrimaryCta } from '@/components/ui/app-shell';
import { ScheduleHeader } from '@/components/shared/ScheduleHeader';

interface HorarioConfig {
  id: string;
  dia_semana: number;
  aberto: boolean;
  hora_abertura: string;
  hora_fechamento: string;
  hora_almoco_inicio: string | null;
  hora_almoco_fim: string | null;
  delay_entre_servicos: number;
  slot_interval_minutes: number | null;
}

const DIAS_SEMANA = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
  'Quinta-feira', 'Sexta-feira', 'Sábado'
];

interface BarberMobileHorariosProps {
  barberContext: BarberContext;
  basePath?: string;
}

export function BarberMobileHorarios({ barberContext, basePath = "/barbeiro" }: BarberMobileHorariosProps) {
  const [configs, setConfigs] = useState<HorarioConfig[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [weeklyConfigState, setWeeklyConfigState] = useState<{
    sourceDay: number;
    selectedDays: number[];
  } | null>(null);
  const [activeSubScreen, setActiveSubScreen] = useState<'ferias' | 'excecoes' | null>(null);
  const saveSlotMutation = useSaveSlotInterval();
  const [tenantSlot, setTenantSlot] = useState<number | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const originalRef = useRef<string>('');

  const loadConfigs = async (mountedRef?: { current: boolean }) => {
    try {
      const { data, error } = await supabase
        .from('configuracoes_horario_barbeiro')
        .select('id, dia_semana, aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, delay_entre_servicos, slot_interval_minutes')
        .eq('barbeiro_id', barberContext.barbeiroId)
        .order('dia_semana');
      if (mountedRef && !mountedRef.current) return;
      if (error) throw error;
      if (data && data.length > 0) {
        setConfigs(data as HorarioConfig[]);
        originalRef.current = JSON.stringify(data);
        setHasChanges(false);
      } else {
        try {
          await supabase.rpc('initialize_barber_hours', { p_barbeiro_id: barberContext.barbeiroId });
          if (mountedRef && !mountedRef.current) return;
          const { data: d2 } = await supabase
            .from('configuracoes_horario_barbeiro')
            .select('id, dia_semana, aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, delay_entre_servicos, slot_interval_minutes')
            .eq('barbeiro_id', barberContext.barbeiroId)
            .order('dia_semana');
          if (mountedRef && !mountedRef.current) return;
          if (d2 && d2.length > 0) {
            setConfigs(d2 as HorarioConfig[]);
            originalRef.current = JSON.stringify(d2);
          }
        } catch {
          console.error('Erro ao inicializar horários');
        }
      }
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
      if (!mountedRef || mountedRef.current) toast.error('Erro ao carregar configurações de horário');
    } finally {
      if (!mountedRef || mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    const mountedRef = { current: true };
    loadConfigs(mountedRef);
    return () => { mountedRef.current = false; };
  }, [barberContext.barbeiroId]);

  useEffect(() => {
    if (!barberContext.tenantId) return;
    supabase
      .from('tenants')
      .select('slot_interval_minutes')
      .eq('id', barberContext.tenantId)
      .maybeSingle()
      .then(({ data }) => {
        const v = (data as { slot_interval_minutes?: number } | null)?.slot_interval_minutes;
        if (typeof v === 'number') setTenantSlot(v);
      });
  }, [barberContext.tenantId]);

  const existingDaySummaries = useMemo(() => {
    const map: Record<number, string> = {};
    configs.forEach((c) => {
      map[c.dia_semana] = c.aberto
        ? `${c.hora_abertura?.slice(0, 5) || '09:00'} - ${c.hora_fechamento?.slice(0, 5) || '18:00'}`
        : 'Fechado';
    });
    return map;
  }, [configs]);

  const checkChanges = (newConfigs: HorarioConfig[]) => {
    setHasChanges(JSON.stringify(newConfigs) !== originalRef.current);
  };

  const updateConfig = (diaSemana: number, field: string, value: any) => {
    setConfigs(prev => {
      const next = prev.map(config =>
        config.dia_semana === diaSemana ? { ...config, [field]: value } : config
      );
      checkChanges(next);
      return next;
    });
  };

  const saveScheduleMutation = useSaveBarberSchedule();

  const saveConfigs = async (): Promise<boolean> => {
    try {
      await saveScheduleMutation.mutateAsync({
        barbeiroId: barberContext.barbeiroId,
        configs: configs.map(c => ({
          dia_semana: c.dia_semana,
          aberto: c.aberto,
          hora_abertura: c.hora_abertura,
          hora_fechamento: c.hora_fechamento,
          hora_almoco_inicio: c.hora_almoco_inicio,
          hora_almoco_fim: c.hora_almoco_fim,
          delay_entre_servicos: c.delay_entre_servicos,
          slot_interval_minutes: c.slot_interval_minutes,
        })),
      });
      originalRef.current = JSON.stringify(configs);
      setHasChanges(false);
      return true;
    } catch {
      return false;
    }
  };

  const handleApplyToOtherDays = async (sourceConfig: DayConfig, selectedDaysList: number[]) => {
    if (selectedDaysList.length === 0) return;

    const nextConfigs = configs.map(cfg => {
      if (selectedDaysList.includes(cfg.dia_semana)) {
        return {
          ...cfg,
          aberto: true,
          hora_abertura: sourceConfig.hora_abertura || '09:00',
          hora_fechamento: sourceConfig.hora_fechamento || '18:00',
          hora_almoco_inicio: sourceConfig.hora_almoco_inicio,
          hora_almoco_fim: sourceConfig.hora_almoco_fim,
          slot_interval_minutes: sourceConfig.slot_interval_minutes ?? tenantSlot ?? 15,
        };
      }
      return cfg;
    });

    setConfigs(nextConfigs);
    checkChanges(nextConfigs);

    try {
      await saveScheduleMutation.mutateAsync({
        barbeiroId: barberContext.barbeiroId,
        configs: nextConfigs
          .filter(c => selectedDaysList.includes(c.dia_semana))
          .map(c => ({
            dia_semana: c.dia_semana,
            aberto: c.aberto,
            hora_abertura: c.hora_abertura,
            hora_fechamento: c.hora_fechamento,
            hora_almoco_inicio: c.hora_almoco_inicio,
            hora_almoco_fim: c.hora_almoco_fim,
            delay_entre_servicos: c.delay_entre_servicos,
            slot_interval_minutes: c.slot_interval_minutes,
          })),
      });
      originalRef.current = JSON.stringify(nextConfigs);
      setHasChanges(false);
      toast.success(
        selectedDaysList.length === 7
          ? 'Horários aplicados a toda a semana com sucesso!'
          : `Horários aplicados a ${selectedDaysList.length} dias selecionados!`
      );
    } catch (err: any) {
      console.error('Erro ao aplicar horários:', err);
    }
  };

  const saving = saveScheduleMutation.isPending;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  // ── Sub-tela: Aplicar / Configurar semana inteira ──
  if (weeklyConfigState) {
    const source = configs.find(c => c.dia_semana === weeklyConfigState.sourceDay) || configs[1] || configs[0];

    return (
      <ScreenShell header={<ScheduleHeader title="Semana inteira" onBack={() => setWeeklyConfigState(null)} />}>
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'tween', duration: 0.22, ease: 'easeOut' }}
          className="pt-2 pb-6 px-1"
        >
          <ApplyScheduleToWeekScreen
            horaAbertura={(source?.hora_abertura || '09:00').slice(0, 5)}
            horaFechamento={(source?.hora_fechamento || '18:00').slice(0, 5)}
            horaAlmocoInicio={source?.hora_almoco_inicio ? source.hora_almoco_inicio.slice(0, 5) : null}
            horaAlmocoFim={source?.hora_almoco_fim ? source.hora_almoco_fim.slice(0, 5) : null}
            slotIntervalMinutes={source?.slot_interval_minutes ?? tenantSlot ?? 15}
            selectedDays={weeklyConfigState.selectedDays}
            onToggleDay={(dia) => {
              setWeeklyConfigState(prev => {
                if (!prev) return prev;
                const next = prev.selectedDays.includes(dia)
                  ? prev.selectedDays.filter(d => d !== dia)
                  : [...prev.selectedDays, dia].sort();
                return { ...prev, selectedDays: next };
              });
            }}
            onSetSelectedDays={(days) => {
              setWeeklyConfigState(prev => (prev ? { ...prev, selectedDays: days } : prev));
            }}
            onBack={() => setWeeklyConfigState(null)}
            onSave={async () => {
              await handleApplyToOtherDays(
                {
                  dia_semana: source.dia_semana,
                  aberto: true,
                  hora_abertura: source.hora_abertura,
                  hora_fechamento: source.hora_fechamento,
                  hora_almoco_inicio: source.hora_almoco_inicio,
                  hora_almoco_fim: source.hora_almoco_fim,
                  slot_interval_minutes: source.slot_interval_minutes ?? tenantSlot ?? 15,
                },
                weeklyConfigState.selectedDays
              );
              setWeeklyConfigState(null);
            }}
            saving={saving}
            existingDaySummaries={existingDaySummaries}
            title="Configurar semana inteira"
            description="Selecione todos os dias da semana para aplicar o mesmo horário ou desmarque os dias específicos para mantê-los inalterados."
          />
        </motion.div>
      </ScreenShell>
    );
  }

  const selectedConfig = selectedDay !== null ? configs.find(c => c.dia_semana === selectedDay) : null;

  if (selectedConfig) {
    return (
      <AnimatePresence mode="wait">
        <DayScheduleScreen
          key={selectedDay}
          config={{
            dia_semana: selectedConfig.dia_semana,
            aberto: selectedConfig.aberto,
            hora_abertura: selectedConfig.hora_abertura,
            hora_fechamento: selectedConfig.hora_fechamento,
            hora_almoco_inicio: selectedConfig.hora_almoco_inicio,
            hora_almoco_fim: selectedConfig.hora_almoco_fim,
            slot_interval_minutes: selectedConfig.slot_interval_minutes,
          }}
          onBack={() => setSelectedDay(null)}
          onUpdate={(field, value) => updateConfig(selectedConfig.dia_semana, field, value)}
          onSave={saveConfigs}
          saving={saving}
          hasChanges={hasChanges}
          tenantSlotInterval={tenantSlot}
          savingSlotInterval={saveSlotMutation.isPending}
          onSaveSlotInterval={async (minutos, aplicarTodosDias) => {
            // 1. Atualizar estado local imediatamente
            setConfigs(prev => {
              const next = prev.map(cfg => {
                if (aplicarTodosDias || cfg.dia_semana === selectedConfig.dia_semana) {
                  return { ...cfg, slot_interval_minutes: minutos };
                }
                return cfg;
              });
              checkChanges(next);
              return next;
            });

            // 2. Persistir no banco
            await saveSlotMutation.mutateAsync({
              barbeiroId: barberContext.barbeiroId,
              minutos,
              dia_semana: selectedConfig.dia_semana,
              aplicarTodosDias,
            });
            await loadConfigs();
          }}
          onApplyToOtherDays={(srcCfg, targetDays) => handleApplyToOtherDays(srcCfg, targetDays)}
          existingDaySummaries={existingDaySummaries}
        />
      </AnimatePresence>
    );
  }

  if (activeSubScreen === 'ferias') {
    return (
      <ScreenShell header={<ScheduleHeader title="Modo Férias" onBack={() => setActiveSubScreen(null)} />}>
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'tween', duration: 0.22, ease: 'easeOut' }}
          className="pt-4 pb-6"
        >
          <BarberVacationMode barbeiroId={barberContext.barbeiroId} />
        </motion.div>
      </ScreenShell>
    );
  }

  if (activeSubScreen === 'excecoes') {
    return (
      <ScreenShell header={<ScheduleHeader title="Exceções de Horário" onBack={() => setActiveSubScreen(null)} />}>
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'tween', duration: 0.22, ease: 'easeOut' }}
          className="pt-4 pb-6"
        >
          <BarberHorariosExcepcionais barbeiroId={barberContext.barbeiroId} />
        </motion.div>
      </ScreenShell>
    );
  }


  return (
    <ScreenShell
      header={<ScheduleHeader title="Horário de funcionamento" backTo={basePath} />}
      bottomReserve={hasChanges ? 96 : 0}
    >
      <div className="w-full max-w-lg mx-auto pt-2 pb-6 space-y-4 px-1 sm:px-0">
        {/* Aviso de que a configuração é exclusivamente do barbeiro */}
        <div className="rounded-2xl border border-border/40 bg-secondary/35 p-3.5 flex items-start gap-3 shadow-xs">
          <div className="w-8 h-8 rounded-xl bg-foreground/10 flex items-center justify-center shrink-0 mt-0.5">
            <Clock className="w-4 h-4 text-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-foreground">
              Seus horários individuais de trabalho
            </p>
            <p className="text-[11.5px] text-muted-foreground/80 mt-0.5 leading-relaxed">
              Esta configuração define exclusivamente a sua disponibilidade na agenda pessoal e não altera os horários de outros profissionais.
            </p>
          </div>
        </div>

        {/* Banner: Configurar semana inteira (Ação rápida) */}
        <div className="rounded-2xl border border-primary/25 bg-primary/5 p-3.5 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <CalendarDays className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-foreground">
                Configurar semana inteira
              </p>
              <p className="text-[11px] text-muted-foreground/80 leading-snug">
                Aplique horários e intervalos a todos os dias com 1 toque
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => {
              const firstOpen = configs.find(c => c.aberto) || configs[1] || configs[0];
              setWeeklyConfigState({
                sourceDay: firstOpen?.dia_semana ?? 1,
                selectedDays: [0, 1, 2, 3, 4, 5, 6],
              });
            }}
            className="shrink-0 h-8 px-3 rounded-xl text-xs font-semibold shadow-xs"
          >
            Configurar
          </Button>
        </div>

        <div className="divide-y divide-border/10">
          {configs.map((config) => {
            const resumo = config.aberto
              ? `${config.hora_abertura?.slice(0, 5)} - ${config.hora_fechamento?.slice(0, 5)}`
              : 'Fechado';

            return (
              <button
                key={config.dia_semana}
                onClick={() => setSelectedDay(config.dia_semana)}
                className="flex items-center justify-between py-4 w-full text-left active:bg-muted/10 transition-colors"
              >
                <span className={cn(
                  'text-sm font-semibold',
                  config.aberto ? 'text-foreground' : 'text-muted-foreground/50'
                )}>
                  {DIAS_SEMANA[config.dia_semana]}
                </span>
                <div className="flex items-center gap-2.5">
                  <span className={cn(
                    'text-sm tabular-nums',
                    config.aberto ? 'text-foreground/70' : 'text-muted-foreground/35'
                  )}>
                    {resumo}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Configurações Avançadas ── */}
        <div>
          <span className="text-[11px] text-muted-foreground/50 font-light uppercase tracking-wider">
            Configurações avançadas
          </span>
          <div className="h-px bg-border/15 mt-2" />

          <button onClick={() => setActiveSubScreen('ferias')} className="flex items-center justify-between py-4 w-full text-left active:bg-muted/10 transition-colors">
            <span className="text-sm font-semibold text-foreground">Modo Férias</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
          </button>

          <div className="h-px bg-border/10" />

          <button onClick={() => setActiveSubScreen('excecoes')} className="flex items-center justify-between py-4 w-full text-left active:bg-muted/10 transition-colors">
            <span className="text-sm font-semibold text-foreground">Exceções de Horário</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
          </button>

          <div className="h-px bg-border/15" />
        </div>
      </div>

      <StickyFooter show={hasChanges} aboveBottomNav>
        <PrimaryCta onClick={saveConfigs} loading={saving}>
          {saving ? 'Salvando…' : 'Salvar alterações'}
        </PrimaryCta>
      </StickyFooter>
    </ScreenShell>
  );
}
