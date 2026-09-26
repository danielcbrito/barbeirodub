import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AnimatePresence } from 'framer-motion';
import { DayScheduleScreen } from '@/components/shared/DayScheduleScreen';
import { ApplyScheduleToWeekScreen } from '@/components/shared/ApplyScheduleToWeekScreen';
import VacationMode from '@/components/admin/VacationMode';
import HorariosExcepcionais from '@/components/admin/HorariosExcepcionais';
import BarberVacationMode from '@/components/barber/BarberVacationMode';
import { useSaveSlotInterval } from '@/hooks/useHorariosMutations';


interface HorarioConfig {
  id: string;
  dia_semana: number;
  aberto: boolean | null;
  hora_abertura: string | null;
  hora_fechamento: string | null;
  hora_almoco_inicio: string | null;
  hora_almoco_fim: string | null;
  delay_entre_servicos: number;
  slot_interval_minutes: number | null;
}

const DEFAULT_OPEN_TIME = '09:00';
const DEFAULT_CLOSE_TIME = '20:00';
const ONBOARDING_ZERO_TIME = '00:00';

const DIAS_SEMANA = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
  'Quinta-feira', 'Sexta-feira', 'Sábado'
];

interface AdminHorariosProps {
  barbeiroId?: string;
  hideTitle?: boolean;
  hideAdvanced?: boolean;
  hideSaveButton?: boolean;
  autoSaveOnDayExit?: boolean;
  onViewModeChange?: (mode: 'list' | 'day' | 'advanced') => void;
  companyMode?: boolean;
  tenantId?: string;
  /** Esconde a seta de voltar no cabeçalho da tela do dia. */
  dayHideBackArrow?: boolean;
  /** Texto do botão principal na tela do dia. */
  daySaveLabel?: string;
  /** Só mostra o botão da tela do dia quando houver alteração. */
  dayHideSaveWhenUnchanged?: boolean;
  /** Força a tela interna a voltar para a lista quando o valor mudar. */
  resetToListSignal?: number;
  /** No onboarding: dias vazios (00:00-00:00) até o barbeiro configurar. */
  forceOnboardingDefaultHours?: boolean;
  /** Esconde a seta visual na lista de dias. */
  hideDayListChevron?: boolean;
  /** Mantém o botão da tela do dia preso no rodapé real da tela. */
  dayFloatingBottomButton?: boolean;
  /** Fluxo onboarding: botão vira "Continuar" e leva para tela de almoço. */
  dayOnboardingFlow?: boolean;
}

const createDefaultConfigs = (zeroed = false): HorarioConfig[] =>
  Array.from({ length: 7 }, (_, i) => ({
    id: `default-${i}`,
    dia_semana: i,
    aberto: true,
    hora_abertura: zeroed ? ONBOARDING_ZERO_TIME : DEFAULT_OPEN_TIME,
    hora_fechamento: zeroed ? ONBOARDING_ZERO_TIME : DEFAULT_CLOSE_TIME,
    hora_almoco_inicio: null,
    hora_almoco_fim: null,
    delay_entre_servicos: 0,
    slot_interval_minutes: null,
  }));

const toTime = (value: string | null | undefined, fallback: string) =>
  value ? value.slice(0, 5) : fallback;

const normalizeConfig = (config: HorarioConfig): HorarioConfig => ({
  ...config,
  hora_abertura: toTime(config.hora_abertura, DEFAULT_OPEN_TIME),
  hora_fechamento: toTime(config.hora_fechamento, DEFAULT_CLOSE_TIME),
  hora_almoco_inicio: config.hora_almoco_inicio ? config.hora_almoco_inicio.slice(0, 5) : null,
  hora_almoco_fim: config.hora_almoco_fim ? config.hora_almoco_fim.slice(0, 5) : null,
  delay_entre_servicos: config.delay_entre_servicos ?? 0,
});

const applyOnboardingDefaults = (rows: HorarioConfig[]): HorarioConfig[] => {
  const byDay = new Map(rows.map((row) => [row.dia_semana, normalizeConfig(row)]));
  return createDefaultConfigs(true).map((fallback) => {
    const existing = byDay.get(fallback.dia_semana);
    return {
      ...(existing || fallback),
      aberto: true,
      hora_abertura: ONBOARDING_ZERO_TIME,
      hora_fechamento: ONBOARDING_ZERO_TIME,
      delay_entre_servicos: existing?.delay_entre_servicos ?? fallback.delay_entre_servicos,
    };
  });
};

export default function AdminHorarios({
  barbeiroId,
  hideTitle,
  hideAdvanced,
  hideSaveButton,
  autoSaveOnDayExit,
  onViewModeChange,
  companyMode,
  tenantId,
  dayHideBackArrow,
  daySaveLabel,
  dayHideSaveWhenUnchanged,
  resetToListSignal = 0,
  forceOnboardingDefaultHours = false,
  hideDayListChevron = false,
  dayFloatingBottomButton = false,
  dayOnboardingFlow = false,
}: AdminHorariosProps = {}) {
  const [configs, setConfigs] = useState<HorarioConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [activeSubScreen, setActiveSubScreen] = useState<'ferias' | 'excecoes' | null>(null);
  const saveSlotMutation = useSaveSlotInterval();
  const [tenantSlot, setTenantSlot] = useState<number | null>(null);
  useEffect(() => {
    if (!tenantId) return;
    supabase.from('tenants').select('slot_interval_minutes').eq('id', tenantId).maybeSingle()
      .then(({ data }) => {
        const v = (data as { slot_interval_minutes?: number } | null)?.slot_interval_minutes;
        if (typeof v === 'number') setTenantSlot(v);
      });
  }, [tenantId]);
  const [hasChanges, setHasChanges] = useState(false);
  const originalRef = useRef<string>('');
  const [companyHoursCache, setCompanyHoursCache] = useState<Array<{dia_semana: number; aberto: boolean; hora_abertura: string; hora_fechamento: string}>>([]);
  const [applyToWeek, setApplyToWeek] = useState<{ sourceDay: number; selectedDays: number[] } | null>(null);

  // Carregar horários globais da barbearia para validação (quando barbeiro pessoal)
  useEffect(() => {
    if (barbeiroId && !companyMode) {
      supabase
        .from('configuracoes_horario')
        .select('dia_semana, aberto, hora_abertura, hora_fechamento')
        .order('dia_semana')
        .then(({ data }) => {
          if (data) setCompanyHoursCache(data);
        });
    }
  }, [barbeiroId, companyMode]);

  useEffect(() => { loadConfigs(); }, [barbeiroId, companyMode]);

  useEffect(() => {
    if (!resetToListSignal) return;

    const resetToList = async () => {
      if (autoSaveOnDayExit && selectedDay !== null && hasChanges) {
        const saved = await saveConfigs();
        if (!saved) return;
      }

      setSelectedDay(null);
      setActiveSubScreen(null);
    };

    resetToList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToListSignal]);

  useEffect(() => {
    if (selectedDay !== null) {
      onViewModeChange?.('day');
      return;
    }

    if (activeSubScreen !== null) {
      onViewModeChange?.('advanced');
      return;
    }

    onViewModeChange?.('list');
  }, [selectedDay, activeSubScreen, onViewModeChange]);

  const loadConfigs = async () => {
    try {
      let data: any[] | null = null;
      let error: any = null;

      if (barbeiroId) {
        const res = await supabase
          .from('configuracoes_horario_barbeiro')
          .select('id, dia_semana, aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, delay_entre_servicos, slot_interval_minutes')
          .eq('barbeiro_id', barbeiroId)
          .order('dia_semana');
        data = res.data;
        error = res.error;
      } else {
        const res = await supabase
          .from('configuracoes_horario')
          .select('id, dia_semana, aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, delay_entre_servicos, slot_interval_minutes')
          .order('dia_semana');
        data = res.data;
        error = res.error;
      }

      if (error) throw error;
      if (data && data.length > 0) {
        const normalized = forceOnboardingDefaultHours
          ? applyOnboardingDefaults(data as HorarioConfig[])
          : (data as HorarioConfig[]).map(normalizeConfig);

        setConfigs(normalized);
        originalRef.current = JSON.stringify(normalized);
        setHasChanges(false);
      } else {
        // Sem configs salvas ainda: no onboarding começa 00:00-00:00 (força configurar);
        // fora do onboarding, defaults 09:00 - 20:00.
        const defaults = createDefaultConfigs(forceOnboardingDefaultHours);
        setConfigs(defaults);
        originalRef.current = JSON.stringify(defaults);
        setHasChanges(false);
      }
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
      toast.error('Erro ao carregar configurações de horário');
    } finally {
      setLoading(false);
    }
  };

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

  /**
   * Valida se os horários do barbeiro estão dentro da janela da barbearia.
   */
  const validateAgainstCompanyHours = (): string | null => {
    if (forceOnboardingDefaultHours) return null;
    if (!barbeiroId || companyMode || companyHoursCache.length === 0) return null;

    const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

    for (const cfg of configs) {
      if (!cfg.aberto) continue;
      const company = companyHoursCache.find(c => c.dia_semana === cfg.dia_semana);
      if (!company || !company.aberto) {
        return `${DIAS[cfg.dia_semana]}: a barbearia está fechada neste dia.`;
      }
      const open = cfg.hora_abertura || '09:00';
      const close = cfg.hora_fechamento || '18:00';
      if (open < company.hora_abertura) {
        return `${DIAS[cfg.dia_semana]}: abertura (${open}) antes do horário da barbearia (${company.hora_abertura}).`;
      }
      if (close > company.hora_fechamento) {
        return `${DIAS[cfg.dia_semana]}: fechamento (${close}) após o horário da barbearia (${company.hora_fechamento}).`;
      }
    }
    return null;
  };

  /**
   * Salva apenas o contexto atual: ou horário fixo da barbearia, ou horário pessoal do barbeiro.
   * Nunca propaga automaticamente o horário da empresa para os barbeiros.
   */
  const handleSaveClick = async (): Promise<boolean> => {
    // Validar limites da barbearia para barbeiros individuais
    const validationError = validateAgainstCompanyHours();
    if (validationError) {
      toast.error(validationError, { duration: 5000 });
      return false;
    }

    return saveConfigs();
  };

  const saveConfigs = async (): Promise<boolean> => {
    setSaving(true);
    try {
      const sanitize = (val: string | null) => (val === '' || val === null) ? null : val;

      // Salvar todos os dias em paralelo para máxima velocidade
      const promises = configs.map(config => {
        const payload = {
          aberto: config.aberto,
          hora_abertura: config.hora_abertura || DEFAULT_OPEN_TIME,
          hora_fechamento: config.hora_fechamento || DEFAULT_CLOSE_TIME,
          hora_almoco_inicio: sanitize(config.hora_almoco_inicio),
          hora_almoco_fim: sanitize(config.hora_almoco_fim),
          delay_entre_servicos: config.delay_entre_servicos
        };

        if (barbeiroId) {
          return supabase
            .from('configuracoes_horario_barbeiro')
            .upsert({ ...payload, barbeiro_id: barbeiroId, dia_semana: config.dia_semana } as any, {
              onConflict: 'barbeiro_id,dia_semana',
            })
            .select();
        } else {
          return supabase
            .from('configuracoes_horario')
            .upsert({ ...payload, dia_semana: config.dia_semana } as any, {
              onConflict: 'dia_semana',
            })
            .select();
        }
      });

      const results = await Promise.all(promises);

      for (const res of results) {
        if (res.error) throw res.error;
        if (!res.data || res.data.length === 0) {
          throw new Error('Falha ao salvar: nenhuma linha atualizada (verifique permissões)');
        }
      }

      // Atualizar referência local sem re-fetch (update otimista)
      const normalizedConfigs = configs.map(normalizeConfig);
      setConfigs(normalizedConfigs);
      originalRef.current = JSON.stringify(normalizedConfigs);
      setHasChanges(false);
      if (!hideSaveButton) toast.success('Configurações salvas com sucesso!');
      return true;
    } catch (error: any) {
      console.error('Erro ao salvar configurações:', error);
      toast.error(error?.message || 'Erro ao salvar configurações');
      return false;
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const selectedConfig = selectedDay !== null ? configs.find(c => c.dia_semana === selectedDay) : null;

  // ── Tela: Aplicar horário aos dias da semana (onboarding) ──
  if (applyToWeek) {
    const source = configs.find(c => c.dia_semana === applyToWeek.sourceDay);
    if (!source) {
      setApplyToWeek(null);
      return null;
    }

    const handleToggleDay = (dia: number) => {
      setApplyToWeek(prev => {
        if (!prev) return prev;
        const selected = prev.selectedDays.includes(dia)
          ? prev.selectedDays.filter(d => d !== dia)
          : [...prev.selectedDays, dia].sort();
        return { ...prev, selectedDays: selected };
      });
    };

    const handleApplyAndSave = async () => {
      const nextConfigs = configs.map(cfg => {
        if (applyToWeek.selectedDays.includes(cfg.dia_semana)) {
          return {
            ...cfg,
            aberto: true,
            hora_abertura: source.hora_abertura,
            hora_fechamento: source.hora_fechamento,
            hora_almoco_inicio: source.hora_almoco_inicio,
            hora_almoco_fim: source.hora_almoco_fim,
          };
        }
        return { ...cfg, aberto: false };
      });
      setConfigs(nextConfigs);
      checkChanges(nextConfigs);
      // Aguarda o próximo tick para garantir estado antes de salvar
      await new Promise(r => setTimeout(r, 0));
      setSaving(true);
      try {
        const sanitize = (val: string | null) => (val === '' || val === null) ? null : val;
        const promises = nextConfigs.map(config => {
          const payload = {
            aberto: config.aberto,
            hora_abertura: config.hora_abertura || DEFAULT_OPEN_TIME,
            hora_fechamento: config.hora_fechamento || DEFAULT_CLOSE_TIME,
            hora_almoco_inicio: sanitize(config.hora_almoco_inicio),
            hora_almoco_fim: sanitize(config.hora_almoco_fim),
            delay_entre_servicos: config.delay_entre_servicos,
          };
          if (barbeiroId) {
            return supabase
              .from('configuracoes_horario_barbeiro')
              .upsert({ ...payload, barbeiro_id: barbeiroId, dia_semana: config.dia_semana } as any, { onConflict: 'barbeiro_id,dia_semana' })
              .select();
          }
          return supabase
            .from('configuracoes_horario')
            .upsert({ ...payload, dia_semana: config.dia_semana } as any, { onConflict: 'dia_semana' })
            .select();
        });
        const results = await Promise.all(promises);
        for (const r of results) if (r.error) throw r.error;
        const normalized = nextConfigs.map(normalizeConfig);
        setConfigs(normalized);
        originalRef.current = JSON.stringify(normalized);
        setHasChanges(false);
        setApplyToWeek(null);
        setSelectedDay(null);
      } catch (err: any) {
        console.error(err);
        toast.error(err?.message || 'Erro ao salvar horários');
      } finally {
        setSaving(false);
      }
    };

    return (
      <div className="max-w-lg">
        <AnimatePresence mode="wait">
          <ApplyScheduleToWeekScreen
            horaAbertura={(source.hora_abertura || DEFAULT_OPEN_TIME).slice(0, 5)}
            horaFechamento={(source.hora_fechamento || DEFAULT_CLOSE_TIME).slice(0, 5)}
            horaAlmocoInicio={source.hora_almoco_inicio ? source.hora_almoco_inicio.slice(0, 5) : null}
            horaAlmocoFim={source.hora_almoco_fim ? source.hora_almoco_fim.slice(0, 5) : null}
            selectedDays={applyToWeek.selectedDays}
            onToggleDay={handleToggleDay}
            onSave={handleApplyAndSave}
            saving={saving}
            floatingBottomButton={dayFloatingBottomButton}
          />
        </AnimatePresence>
      </div>
    );
  }

  if (selectedConfig) {
    const handleBackFromDay = async () => {
      if (autoSaveOnDayExit && hasChanges) {
        const saved = await saveConfigs();
        if (!saved) return;
      }
      setSelectedDay(null);
    };

    const handleConfirmDay = async () => {
      const saved = await handleSaveClick();
      if (!saved) return false;
      setSelectedDay(null);
      return true;
    };

    const handleOnboardingDayComplete = () => {
      // Abre a tela "Aplicar aos dias da semana" com todos pré-selecionados
      setApplyToWeek({
        sourceDay: selectedConfig.dia_semana,
        selectedDays: [0, 1, 2, 3, 4, 5, 6],
      });
    };

    return (
      <div className="max-w-lg">
        <AnimatePresence mode="wait">
          <DayScheduleScreen
            key={selectedDay}
            config={selectedConfig}
            onBack={handleBackFromDay}
            onUpdate={(field, value) => updateConfig(selectedConfig.dia_semana, field, value)}
            onSave={handleConfirmDay}
            saving={saving}
            hasChanges={hasChanges}
            hideBackArrow={dayHideBackArrow}
            saveLabel={daySaveLabel}
            hideSaveWhenUnchanged={dayHideSaveWhenUnchanged}
            floatingBottomButton={dayFloatingBottomButton}
            onboardingFlow={dayOnboardingFlow}
            onOnboardingDayComplete={dayOnboardingFlow ? handleOnboardingDayComplete : undefined}
            tenantSlotInterval={tenantSlot}
            savingSlotInterval={saveSlotMutation.isPending}
            onSaveSlotInterval={barbeiroId && !companyMode ? async (minutos, aplicarTodosDias) => {
              await saveSlotMutation.mutateAsync({
                barbeiroId,
                minutos,
                dia_semana: selectedConfig.dia_semana,
                aplicarTodosDias,
              });
              await loadConfigs();
            } : undefined}
          />
        </AnimatePresence>
      </div>
    );
  }

  if (activeSubScreen === 'ferias') {
    return (
      <div className="max-w-lg space-y-6">
        <button onClick={() => setActiveSubScreen(null)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Voltar aos Horários
        </button>
        {barbeiroId ? <BarberVacationMode barbeiroId={barbeiroId} /> : <VacationMode />}
      </div>
    );
  }

  if (activeSubScreen === 'excecoes') {
    return (
      <div className="max-w-lg space-y-6">
        <button onClick={() => setActiveSubScreen(null)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Voltar aos Horários
        </button>
        <HorariosExcepcionais barbeiroId={barbeiroId} />
      </div>
    );
  }


  return (
    <div className="space-y-6 max-w-lg">
      {!hideTitle && <h2 className="text-2xl font-bold text-foreground">Horário de Funcionamento</h2>}
      <p className="text-sm text-muted-foreground/60 leading-relaxed font-light">
        Configure os dias e horários em que a barbearia estará disponível para agendamentos. Toque em um dia para ajustar os detalhes.
      </p>

      <div className="space-y-1">
        {configs.map((config) => {
          const isUnset = config.aberto === null || config.aberto === undefined;
          const resumo = isUnset
            ? 'Não configurado'
            : config.aberto
              ? `${config.hora_abertura?.slice(0, 5)} - ${config.hora_fechamento?.slice(0, 5)}`
              : 'Fechado';

          return (
            <button
              key={config.dia_semana}
              onClick={() => setSelectedDay(config.dia_semana)}
              className="flex items-center justify-between py-4 px-1 w-full text-left hover:bg-muted/5 active:bg-muted/10 transition-colors border-b border-border/10 last:border-b-0"
            >
              <span className={cn(
                'text-[15px] font-semibold',
                isUnset ? 'text-foreground' : config.aberto ? 'text-foreground' : 'text-muted-foreground/50'
              )}>
                {DIAS_SEMANA[config.dia_semana]}
              </span>
              <div className="flex items-center gap-3">
                <span className={cn(
                  'text-[15px] font-medium',
                  isUnset ? 'text-destructive/80' : config.aberto ? 'text-foreground/70' : 'text-muted-foreground/35'
                )}>
                  {resumo}
                </span>
                {!hideDayListChevron && <ChevronRight className="h-4 w-4 text-muted-foreground/30" />}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Configurações Avançadas ── */}
      {!hideAdvanced && (
        <div>
          <span className="text-[11px] text-muted-foreground/50 font-light uppercase tracking-wider">
            Configurações avançadas
          </span>
          <div className="h-px bg-border/15 mt-2" />

          <button
            onClick={() => setActiveSubScreen('ferias')}
            className="flex items-center justify-between py-4 w-full text-left hover:bg-muted/5 active:bg-muted/10 transition-colors"
          >
            <div className="min-w-0 pr-3">
              <p className="text-sm font-semibold text-foreground">Modo Férias</p>
              <p className="text-[11px] font-light text-muted-foreground/70 mt-0.5">
                {companyMode ? 'Pausa toda a barbearia no período' : 'Pausa seus agendamentos no período'}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/30 flex-shrink-0" />
          </button>

          <div className="h-px bg-border/10" />

          <button
            onClick={() => setActiveSubScreen('excecoes')}
            className="flex items-center justify-between py-4 w-full text-left hover:bg-muted/5 active:bg-muted/10 transition-colors"
          >
            <div className="min-w-0 pr-3">
              <p className="text-sm font-semibold text-foreground">Exceções de Horário</p>
              <p className="text-[11px] font-light text-muted-foreground/70 mt-0.5">
                {companyMode ? 'Feriados e datas especiais para toda a barbearia' : 'Feriados e datas especiais para você'}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/30 flex-shrink-0" />
          </button>


          <div className="h-px bg-border/15" />
        </div>
      )}

      {hasChanges && !hideSaveButton && (
        <div className="pt-4">
          <Button
            onClick={handleSaveClick}
            disabled={saving}
            className="w-full h-[48px] rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm shadow-sm transition-colors"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Salvando...
              </>
            ) : (
              'Salvar'
            )}
          </Button>
        </div>
      )}

    </div>
  );
}
