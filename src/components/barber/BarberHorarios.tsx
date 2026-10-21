import { useState, useRef, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { ChevronRight, Loader2, CalendarDays, Sparkles, Palmtree, CalendarClock, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AnimatePresence } from 'framer-motion';
import { DayScheduleScreen, type DayConfig } from '@/components/shared/DayScheduleScreen';
import { ApplyScheduleToWeekScreen } from '@/components/shared/ApplyScheduleToWeekScreen';
import { BarberContext } from '@/pages/Barbeiro';
import BarberVacationMode from '@/components/barber/BarberVacationMode';
import BarberHorariosExcepcionais from '@/components/barber/BarberHorariosExcepcionais';
import { useBarberHorarioConfig, type HorarioConfig } from '@/hooks/useBarberHorarioConfig';
import { useSaveHorarios, useSaveSlotInterval } from '@/hooks/useHorariosMutations';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { STALE_TIMES } from '@/lib/queryConstants';

const DIAS_SEMANA = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
  'Quinta-feira', 'Sexta-feira', 'Sábado'
];

export const formatTimeClean = (value: string | null | undefined, fallback = '09:00'): string => {
  if (!value) return fallback;
  const trimmed = String(value).trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    const h = match[1].padStart(2, '0');
    const m = match[2].padStart(2, '0');
    return `${h}:${m}`;
  }
  return fallback;
};

const timeToMinutes = (
  value: string | null | undefined,
  fallback = 0,
  isCloseTime = false
): number => {
  if (!value) return fallback;
  const trimmed = String(value).trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    if (isCloseTime && h === 0 && m === 0) {
      return 24 * 60; // 1440 min
    }
    return h * 60 + m;
  }
  return fallback;
};

interface BarberHorariosProps {
  barberContext: BarberContext;
}

export function BarberHorarios({ barberContext }: BarberHorariosProps) {
  /* ── Mutation hook para salvar horários ── */
  const saveHorariosMutation = useSaveHorarios();

  /* ── TanStack Query: configurações de horário ── */
  const { data: queryConfigs = [], isLoading: loading } = useBarberHorarioConfig(barberContext.barbeiroId);

  /* ── Horários da barbearia (unidade/tenant) para validação de limites ── */
  const { data: companyHours } = useQuery({
    queryKey: ['company-hours-tenant', barberContext.tenantId],
    staleTime: STALE_TIMES.HORARIOS,
    queryFn: async () => {
      if (barberContext.tenantId) {
        const { data: unitData } = await (supabase as any)
          .from('configuracoes_horario_unidade')
          .select('dia_semana, aberto, hora_abertura, hora_fechamento')
          .eq('tenant_id', barberContext.tenantId)
          .order('dia_semana');
        if (unitData && unitData.length > 0) return unitData;
      }
      const { data, error } = await supabase
        .from('configuracoes_horario')
        .select('dia_semana, aberto, hora_abertura, hora_fechamento')
        .order('dia_semana');
      if (error) throw error;
      return data ?? [];
    },
  });

  /* ── Estado local para edição otimista ── */
  const [localConfigs, setLocalConfigs] = useState<HorarioConfig[] | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [weeklyConfigState, setWeeklyConfigState] = useState<{
    sourceDay: number;
    selectedDays: number[];
  } | null>(null);
  const [activeSubScreen, setActiveSubScreen] = useState<'ferias' | 'excecoes' | null>(null);
  const saveSlotMutation = useSaveSlotInterval();
  const { data: tenantRow } = useQuery({
    queryKey: ['tenant-slot-interval', barberContext.tenantId],
    enabled: !!barberContext.tenantId,
    staleTime: STALE_TIMES.HORARIOS,
    queryFn: async () => {
      const { data } = await supabase
        .from('tenants')
        .select('slot_interval_minutes')
        .eq('id', barberContext.tenantId!)
        .maybeSingle();
      return data;
    },
  });
  const tenantSlot = (tenantRow as { slot_interval_minutes?: number } | null | undefined)?.slot_interval_minutes ?? null;
  const [hasChanges, setHasChanges] = useState(false);
  const originalRef = useRef<string>('');

  const saving = saveHorariosMutation.isPending;

  const ensureAllSevenDays = useCallback((rows: HorarioConfig[]): HorarioConfig[] => {
    const defaults: HorarioConfig[] = Array.from({ length: 7 }, (_, i) => ({
      id: `default-${i}`,
      dia_semana: i,
      aberto: true,
      hora_abertura: '09:00',
      hora_fechamento: '18:00',
      hora_almoco_inicio: null,
      hora_almoco_fim: null,
      delay_entre_servicos: 0,
      slot_interval_minutes: null,
    }));
    const byDay = new Map<number, HorarioConfig>();
    (rows || []).forEach((c) => {
      if (c && typeof c.dia_semana === 'number') byDay.set(c.dia_semana, c);
    });
    return defaults.map((def) => {
      const existing = byDay.get(def.dia_semana);
      if (!existing) return def;
      return { ...def, ...existing, dia_semana: def.dia_semana };
    });
  }, []);

  /* Configs efetivos: se há edição local, usa local; senão, usa query */
  const configs = useMemo(() => {
    return ensureAllSevenDays(localConfigs ?? queryConfigs);
  }, [localConfigs, queryConfigs, ensureAllSevenDays]);

  /* Quando os dados do query carregam, sincronizar referência original */
  const syncOriginal = useCallback(() => {
    if (queryConfigs.length > 0 && !originalRef.current) {
      originalRef.current = JSON.stringify(ensureAllSevenDays(queryConfigs));
    }
  }, [queryConfigs, ensureAllSevenDays]);
  syncOriginal();

  const existingDaySummaries = useMemo(() => {
    const map: Record<number, string> = {};
    configs.forEach((c) => {
      map[c.dia_semana] = c.aberto
        ? `${(c.hora_abertura || '09:00').slice(0, 5)} - ${(c.hora_fechamento || '18:00').slice(0, 5)}`
        : 'Fechado';
    });
    return map;
  }, [configs]);

  const checkChanges = (newConfigs: HorarioConfig[]) => {
    setHasChanges(JSON.stringify(newConfigs) !== (originalRef.current || JSON.stringify(configs)));
  };

  const updateConfig = (diaSemana: number, field: string, value: any) => {
    const base = localConfigs ?? configs;
    const next = base.map(config =>
      config.dia_semana === diaSemana ? { ...config, [field]: value } : config
    );
    setLocalConfigs(next);
    checkChanges(next);
  };

  /**
   * Valida se os horários do barbeiro estão dentro da janela de funcionamento da barbearia.
   * Se targetDiaSemana for informado, valida APENAS aquele dia específico.
   * Retorna null se OK, ou string de erro descritiva.
   */
  const validateAgainstCompanyHours = (cfgs: HorarioConfig[], targetDiaSemana?: number): string | null => {
    if (!companyHours || companyHours.length === 0) return null; // Sem referência global, libera

    const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

    const configsToValidate = targetDiaSemana !== undefined
      ? cfgs.filter(c => c.dia_semana === targetDiaSemana)
      : cfgs;

    for (const barberCfg of configsToValidate) {
      if (!barberCfg.aberto) continue; // Dia fechado para o barbeiro, OK

      const companyCfg = companyHours.find(c => c.dia_semana === barberCfg.dia_semana);
      if (!companyCfg || !companyCfg.aberto) {
        return `${DIAS[barberCfg.dia_semana]}: a barbearia está fechada neste dia. Você não pode abrir.`;
      }

      const barberOpenMin = timeToMinutes(barberCfg.hora_abertura, 9 * 60, false);
      const barberCloseMin = timeToMinutes(barberCfg.hora_fechamento, 18 * 60, true);
      const companyOpenMin = timeToMinutes(companyCfg.hora_abertura, 9 * 60, false);
      const companyCloseMin = timeToMinutes(companyCfg.hora_fechamento, 20 * 60, true);

      const barberOpen = formatTimeClean(barberCfg.hora_abertura, '09:00');
      const barberClose = formatTimeClean(barberCfg.hora_fechamento, '18:00');
      const companyOpen = formatTimeClean(companyCfg.hora_abertura, '09:00');
      const companyClose = formatTimeClean(companyCfg.hora_fechamento, '20:00');

      if (barberOpenMin < companyOpenMin) {
        return `${DIAS[barberCfg.dia_semana]}: seu horário de abertura (${barberOpen}) é antes do horário da barbearia (${companyOpen}).`;
      }
      if (barberCloseMin > companyCloseMin) {
        return `${DIAS[barberCfg.dia_semana]}: seu horário de fechamento (${barberClose}) é depois do horário da barbearia (${companyClose}).`;
      }
    }

    return null;
  };

  const saveConfigs = async (targetDiaSemana?: number): Promise<boolean> => {
    const current = localConfigs ?? configs;

    // Validar limites da barbearia (específico do dia ou todos)
    const validationError = validateAgainstCompanyHours(current, targetDiaSemana);
    if (validationError) {
      toast.error(validationError, { duration: 5000 });
      return false;
    }

    const configsToSave = targetDiaSemana !== undefined
      ? current.filter(c => c.dia_semana === targetDiaSemana)
      : current;

    try {
      await saveHorariosMutation.mutateAsync({
        barbeiroId: barberContext.barbeiroId,
        configs: configsToSave.map(c => ({
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

      originalRef.current = JSON.stringify(current);
      setHasChanges(false);
      setLocalConfigs(current);
      return true;
    } catch (err: any) {
      console.error('Erro ao salvar horários:', err);
      return false;
    }
  };

  /**
   * Copia e aplica a configuração de um dia para outros dias selecionados
   * Preserva intactos os dias que não foram selecionados!
   */
  const handleApplyToOtherDays = async (sourceConfig: DayConfig, selectedDaysList: number[]) => {
    if (selectedDaysList.length === 0) return;

    const base = localConfigs ?? configs;
    const updated = base.map(cfg => {
      if (selectedDaysList.includes(cfg.dia_semana)) {
        return {
          ...cfg,
          aberto: true,
          hora_abertura: sourceConfig.hora_abertura,
          hora_fechamento: sourceConfig.hora_fechamento,
          hora_almoco_inicio: sourceConfig.hora_almoco_inicio,
          hora_almoco_fim: sourceConfig.hora_almoco_fim,
          slot_interval_minutes: sourceConfig.slot_interval_minutes,
        };
      }
      return cfg;
    });

    // Validar contra limites da barbearia
    const validationError = validateAgainstCompanyHours(updated);
    if (validationError) {
      toast.error(validationError, { duration: 5000 });
      return;
    }

    setLocalConfigs(updated);

    try {
      await saveHorariosMutation.mutateAsync({
        barbeiroId: barberContext.barbeiroId,
        configs: updated
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

      originalRef.current = JSON.stringify(updated);
      setHasChanges(false);
      toast.success(
        selectedDaysList.length === 7
          ? 'Horários aplicados a toda a semana com sucesso!'
          : `Horários aplicados a ${selectedDaysList.length} dias selecionados!`
      );
    } catch (err: any) {
      console.error('Erro ao aplicar horários na semana:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // ── Tela: Configurar semana inteira (em lote) ──
  if (weeklyConfigState) {
    const source = configs.find(c => c.dia_semana === weeklyConfigState.sourceDay) || configs[1] || configs[0];

    return (
      <div className="max-w-lg animate-fade-in">
        <AnimatePresence mode="wait">
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
        </AnimatePresence>
      </div>
    );
  }

  const selectedConfig = selectedDay !== null ? configs.find(c => c.dia_semana === selectedDay) : null;

  if (selectedConfig) {
    return (
      <div className="max-w-lg animate-fade-in">
        <AnimatePresence mode="wait">
          <DayScheduleScreen
            key={selectedDay}
            config={{
              dia_semana: selectedConfig.dia_semana,
              aberto: selectedConfig.aberto || false,
              hora_abertura: selectedConfig.hora_abertura || '09:00',
              hora_fechamento: selectedConfig.hora_fechamento || '18:00',
              hora_almoco_inicio: selectedConfig.hora_almoco_inicio,
              hora_almoco_fim: selectedConfig.hora_almoco_fim,
              slot_interval_minutes: selectedConfig.slot_interval_minutes,
            onBack={async () => {
              if (hasChanges) {
                await saveConfigs(selectedConfig.dia_semana);
              }
              setSelectedDay(null);
            }}
            onUpdate={(field, value) => updateConfig(selectedConfig.dia_semana, field, value)}
            onSave={() => saveConfigs(selectedConfig.dia_semana)}
            saving={saving}
            hasChanges={hasChanges}
            tenantSlotInterval={tenantSlot}
            savingSlotInterval={saveSlotMutation.isPending}
            onSaveSlotInterval={async (minutos, aplicarTodosDias) => {
              // 1. Atualiza estado local imediatamente para refletir na interface
              const base = localConfigs ?? [...queryConfigs];
              const next = base.map(cfg => {
                if (aplicarTodosDias || cfg.dia_semana === selectedConfig.dia_semana) {
                  return { ...cfg, slot_interval_minutes: minutos };
                }
                return cfg;
              });
              setLocalConfigs(next);
              checkChanges(next);

              // 2. Persiste no banco de dados
              await saveSlotMutation.mutateAsync({
                barbeiroId: barberContext.barbeiroId,
                minutos,
                dia_semana: selectedConfig.dia_semana,
                aplicarTodosDias,
              });
            }}
            onApplyToOtherDays={async (srcCfg, targetDays) => {
              await handleApplyToOtherDays(srcCfg, targetDays);
              setSelectedDay(null);
            }}
            existingDaySummaries={existingDaySummaries}
          />
        </AnimatePresence>
      </div>
    );
  }

  if (activeSubScreen === 'ferias') {
    return (
      <div className="w-full max-w-lg space-y-4 animate-fade-in">
        <div className="flex items-center gap-2 min-h-[56px] py-1">
          <button
            type="button"
            onClick={() => setActiveSubScreen(null)}
            aria-label="Voltar"
            className="w-9 h-9 rounded-full bg-secondary/80 hover:bg-secondary active:scale-95 transition-all shrink-0 text-foreground flex items-center justify-center border border-border/30"
          >
            <ChevronLeft className="w-5 h-5 stroke-[2.2]" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-[20px] font-semibold text-foreground tracking-tight leading-none truncate">
              Modo Férias
            </h2>
          </div>
        </div>
        <div className="h-px bg-border/20 mb-2" />
        <BarberVacationMode barbeiroId={barberContext.barbeiroId} />
      </div>
    );
  }

  if (activeSubScreen === 'excecoes') {
    return (
      <div className="w-full max-w-lg space-y-4 animate-fade-in">
        <div className="flex items-center gap-2 min-h-[56px] py-1">
          <button
            type="button"
            onClick={() => setActiveSubScreen(null)}
            aria-label="Voltar"
            className="w-9 h-9 rounded-full bg-secondary/80 hover:bg-secondary active:scale-95 transition-all shrink-0 text-foreground flex items-center justify-center border border-border/30"
          >
            <ChevronLeft className="w-5 h-5 stroke-[2.2]" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-[20px] font-semibold text-foreground tracking-tight leading-none truncate">
              Exceções de Horário
            </h2>
          </div>
        </div>
        <div className="h-px bg-border/20 mb-2" />
        <BarberHorariosExcepcionais barbeiroId={barberContext.barbeiroId} />
      </div>
    );
  }


  return (
    <div className="space-y-6 max-w-lg animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Horário de Funcionamento</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configure seus horários de atendimento semanal
        </p>
      </div>

      <div className="divide-y divide-border/10">
        {configs.map((config) => {
          const resumo = config.aberto
            ? `${(config.hora_abertura || '09:00').slice(0, 5)} - ${(config.hora_fechamento || '18:00').slice(0, 5)}`
            : 'Fechado';

          return (
            <button
              key={config.dia_semana}
              onClick={() => setSelectedDay(config.dia_semana)}
              className="flex items-center justify-between py-4 w-full text-left hover:bg-muted/5 active:bg-muted/10 transition-colors"
            >
              <span className={cn(
                'text-sm font-semibold',
                config.aberto ? 'text-foreground' : 'text-muted-foreground/50'
              )}>
                {DIAS_SEMANA[config.dia_semana]}
              </span>
              <div className="flex items-center gap-2.5">
                <span className={cn(
                  'text-sm',
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
      <div className="space-y-3 pt-2">
        <span className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
          Configurações avançadas
        </span>

        <div className="rounded-2xl border border-border/40 bg-card/60 backdrop-blur-sm divide-y divide-border/20 overflow-hidden shadow-xs">
          <button
            type="button"
            onClick={() => setActiveSubScreen('ferias')}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/10 active:bg-muted/15 transition-all group"
          >
            <div className="min-w-0 pr-3">
              <p className="text-[14.5px] font-semibold text-foreground leading-snug">
                Modo Férias
              </p>
              <p className="text-[12px] text-muted-foreground/75 mt-0.5 leading-relaxed">
                Pausa seus agendamentos no período selecionado
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => setActiveSubScreen('excecoes')}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/10 active:bg-muted/15 transition-all group"
          >
            <div className="min-w-0 pr-3">
              <p className="text-[14.5px] font-semibold text-foreground leading-snug">
                Exceções de Horário
              </p>
              <p className="text-[12px] text-muted-foreground/75 mt-0.5 leading-relaxed">
                Feriados, folgas e datas com horários especiais personalizados
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0" />
          </button>
        </div>
      </div>
    </div>
  );
}
