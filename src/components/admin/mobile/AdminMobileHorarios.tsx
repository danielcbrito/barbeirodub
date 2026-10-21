import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ChevronRight, Clock, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { DayScheduleScreen } from '@/components/shared/DayScheduleScreen';
import { ApplyScheduleToWeekScreen } from '@/components/shared/ApplyScheduleToWeekScreen';
import VacationMode from '@/components/admin/VacationMode';
import HorariosExcepcionais from '@/components/admin/HorariosExcepcionais';
import BarberVacationMode from '@/components/barber/BarberVacationMode';
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

interface AdminMobileHorariosProps {
  basePath?: string;
  barbeiroId?: string;
  companyMode?: boolean;
  tenantId?: string;
  hideAdvanced?: boolean;
}

export function AdminMobileHorarios({
  basePath = "/admin",
  barbeiroId,
  companyMode = false,
  tenantId,
  hideAdvanced = false,
}: AdminMobileHorariosProps) {
  const [searchParams] = useSearchParams();
  const scope = searchParams.get('scope'); // 'self' | 'units' | null
  const isEmpresaParam = searchParams.get('empresa') === '1' || searchParams.get('scope') === 'company';
  const effectiveCompanyMode = companyMode || isEmpresaParam;
  const unitIds = useMemo(() => {
    const raw = searchParams.get('unit_ids');
    return raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];
  }, [searchParams]);
  const scopeUnits = (scope === 'units' && unitIds.length > 0) || effectiveCompanyMode;

  const [configs, setConfigs] = useState<HorarioConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [weeklyConfigState, setWeeklyConfigState] = useState<{ sourceDay: number; selectedDays: number[] } | null>(null);
  const [activeSubScreen, setActiveSubScreen] = useState<'ferias' | 'excecoes' | null>(null);
  const saveSlotMutation = useSaveSlotInterval();
  const [tenantSlot, setTenantSlot] = useState<number | null>(null);

  const existingDaySummaries = useMemo(() => {
    const map: Record<number, string> = {};
    configs.forEach((c) => {
      map[c.dia_semana] = c.aberto
        ? `${(c.hora_abertura || '09:00').slice(0, 5)} - ${(c.hora_fechamento || '20:00').slice(0, 5)}`
        : 'Fechado';
    });
    return map;
  }, [configs]);

  useEffect(() => {
    if (!tenantId) return;
    supabase
      .from('tenants')
      .select('slot_interval_minutes')
      .eq('id', tenantId)
      .maybeSingle()
      .then(({ data }) => {
        const v = (data as { slot_interval_minutes?: number } | null)?.slot_interval_minutes;
        if (typeof v === 'number') setTenantSlot(v);
      });
  }, [tenantId]);
  const [hasChanges, setHasChanges] = useState(false);
  const originalRef = useRef<string>('');

  // Decide qual tabela usar:
  // - scope=units / companyMode / isEmpresaParam / !barbeiroId → horários DA BARBEARIA (configuracoes_horario_unidade),
  //   sem tocar no horário pessoal de nenhum barbeiro.
  // - scope=self / barbeiro pessoal → horário pessoal do barbeiro (configuracoes_horario_barbeiro).
  const useUnitTable = (scopeUnits || effectiveCompanyMode || !barbeiroId);
  const usePerBarber = !!barbeiroId && !effectiveCompanyMode && !useUnitTable;
  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(tenantId ?? null);

  useEffect(() => {
    loadConfigs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barbeiroId, effectiveCompanyMode, useUnitTable, unitIds.join(',')]);

  const resolveTenantId = async (): Promise<string | null> => {
    if (resolvedTenantId) return resolvedTenantId;
    if (tenantId) { setResolvedTenantId(tenantId); return tenantId; }
    if (unitIds.length > 0) {
      const { data } = await supabase
        .from('tenant_unidades')
        .select('tenant_id')
        .eq('id', unitIds[0])
        .maybeSingle();
      if (data?.tenant_id) { setResolvedTenantId(data.tenant_id); return data.tenant_id; }
    }
    if (barbeiroId) {
      const { data } = await supabase
        .from('barbeiros')
        .select('tenant_id')
        .eq('id', barbeiroId)
        .maybeSingle();
      if (data?.tenant_id) { setResolvedTenantId(data.tenant_id); return data.tenant_id; }
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      const { data: barb } = await supabase
        .from('barbeiros')
        .select('tenant_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (barb?.tenant_id) { setResolvedTenantId(barb.tenant_id); return barb.tenant_id; }
      const { data: ten } = await supabase
        .from('tenants')
        .select('id')
        .eq('owner_user_id', user.id)
        .maybeSingle();
      if (ten?.id) { setResolvedTenantId(ten.id); return ten.id; }
    }
    return null;
  };

  const resolveDefaultUnitId = async (tId: string | null): Promise<string | null> => {
    if (!tId) return null;
    const { data } = await supabase
      .from('tenant_unidades')
      .select('id')
      .eq('tenant_id', tId)
      .order('is_sede', { ascending: false })
      .limit(1);
    return data && data.length > 0 ? data[0].id : null;
  };

  const defaultUnitConfigs = (): HorarioConfig[] =>
    Array.from({ length: 7 }, (_, dia) => ({
      id: `novo-${dia}`,
      dia_semana: dia,
      aberto: dia !== 0,
      hora_abertura: '09:00',
      hora_fechamento: '20:00',
      hora_almoco_inicio: null,
      hora_almoco_fim: null,
      delay_entre_servicos: 10,
      slot_interval_minutes: null,
    }));

  const loadConfigs = async () => {
    try {
      let data: any[] | null = null;
      let error: any = null;

      if (useUnitTable) {
        const tId = await resolveTenantId();
        const targetUnitId = unitIds[0] || (await resolveDefaultUnitId(tId));
        let res: any = null;

        if (targetUnitId) {
          res = await (supabase as any).from('configuracoes_horario_unidade')
            .select('id, dia_semana, aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, delay_entre_servicos, slot_interval_minutes')
            .eq('unidade_id', targetUnitId)
            .order('dia_semana');
        }

        if ((!res || !res.data || res.data.length === 0) && tId) {
          res = await (supabase as any).from('configuracoes_horario_unidade')
            .select('id, dia_semana, aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, delay_entre_servicos, slot_interval_minutes')
            .eq('tenant_id', tId)
            .order('dia_semana');
        }

        if (res?.error) throw res.error;
        data = res?.data && res.data.length > 0 ? res.data : defaultUnitConfigs();
      } else if (usePerBarber) {
        const res = await supabase
          .from('configuracoes_horario_barbeiro')
          .select('id, dia_semana, aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, delay_entre_servicos, slot_interval_minutes')
          .eq('barbeiro_id', barbeiroId as string)
          .order('dia_semana');
        data = res.data;
        error = res.error;

        // Inicializa se estiver vazio
        if (!error && (!data || data.length === 0)) {
          await supabase.rpc('initialize_barber_hours', { p_barbeiro_id: barbeiroId as string });
          const retry = await supabase
            .from('configuracoes_horario_barbeiro')
            .select('id, dia_semana, aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, delay_entre_servicos, slot_interval_minutes')
            .eq('barbeiro_id', barbeiroId as string)
            .order('dia_semana');
          data = retry.data;
          error = retry.error;
        }
      } else {
        const tId = await resolveTenantId();
        let res: any = null;
        if (tId) {
          res = await (supabase as any)
            .from('configuracoes_horario_unidade')
            .select('id, dia_semana, aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, delay_entre_servicos, slot_interval_minutes')
            .eq('tenant_id', tId)
            .order('dia_semana');
        }
        data = res?.data && res.data.length > 0 ? res.data : defaultUnitConfigs();
      }

      if (error) throw error;
      if (data && data.length > 0) {
        setConfigs(data as HorarioConfig[]);
        originalRef.current = JSON.stringify(data);
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

  const saveConfigs = async () => {
    setSaving(true);
    try {
      const sanitize = (val: string | null) => (val === '' || val === null) ? null : val;

      if (usePerBarber && barbeiroId) {
        // ── Escopo HORÁRIO PESSOAL DO BARBEIRO ──
        for (const config of configs) {
          const payload = {
            aberto: config.aberto,
            hora_abertura: config.hora_abertura || '09:00',
            hora_fechamento: config.hora_fechamento || '20:00',
            hora_almoco_inicio: sanitize(config.hora_almoco_inicio),
            hora_almoco_fim: sanitize(config.hora_almoco_fim),
            delay_entre_servicos: config.delay_entre_servicos
          };

          const res = await supabase
            .from('configuracoes_horario_barbeiro')
            .update(payload)
            .eq('barbeiro_id', barbeiroId)
            .eq('dia_semana', config.dia_semana)
            .select();
          if (res.error) throw res.error;
          if (!res.data || res.data.length === 0) {
            await supabase.rpc('initialize_barber_hours', { p_barbeiro_id: barbeiroId });
            const retry = await supabase
              .from('configuracoes_horario_barbeiro')
              .update(payload)
              .eq('barbeiro_id', barbeiroId)
              .eq('dia_semana', config.dia_semana)
              .select();
            if (retry.error) throw retry.error;
          }
        }

        toast.success('Horário pessoal salvo com sucesso!');
        await loadConfigs();
        return;
      }

      // ── Escopo BARBEARIA: grava só o horário da unidade / tenant ──
      const tId = await resolveTenantId();
      if (!tId) throw new Error('Não foi possível identificar a barbearia');
      const defaultUId = await resolveDefaultUnitId(tId);
      const targetUnitIds = unitIds.length > 0 ? unitIds : (defaultUId ? [defaultUId] : []);

      if (targetUnitIds.length > 0) {
        for (const unidadeId of targetUnitIds) {
          for (const config of configs) {
            const payload = {
              aberto: config.aberto,
              hora_abertura: config.hora_abertura || '09:00',
              hora_fechamento: config.hora_fechamento || '20:00',
              hora_almoco_inicio: sanitize(config.hora_almoco_inicio),
              hora_almoco_fim: sanitize(config.hora_almoco_fim),
              delay_entre_servicos: config.delay_entre_servicos,
              updated_at: new Date().toISOString(),
            };

            const upd = await (supabase as any).from('configuracoes_horario_unidade')
              .update(payload)
              .eq('unidade_id', unidadeId)
              .eq('dia_semana', config.dia_semana)
              .select();
            if (upd.error) throw upd.error;

            if (!upd.data || upd.data.length === 0) {
              const ins = await (supabase as any).from('configuracoes_horario_unidade')
                .insert({
                  tenant_id: tId,
                  unidade_id: unidadeId,
                  dia_semana: config.dia_semana,
                  ...payload,
                })
                .select();
              if (ins.error) throw ins.error;
            }
          }
        }
      } else {
        for (const config of configs) {
          const payload = {
            aberto: config.aberto,
            hora_abertura: config.hora_abertura || '09:00',
            hora_fechamento: config.hora_fechamento || '20:00',
            hora_almoco_inicio: sanitize(config.hora_almoco_inicio),
            hora_almoco_fim: sanitize(config.hora_almoco_fim),
            delay_entre_servicos: config.delay_entre_servicos,
            updated_at: new Date().toISOString(),
          };

          const upd = await (supabase as any).from('configuracoes_horario_unidade')
            .update(payload)
            .eq('tenant_id', tId)
            .eq('dia_semana', config.dia_semana)
            .select();
          if (upd.error) throw upd.error;

          if (!upd.data || upd.data.length === 0) {
            const ins = await (supabase as any).from('configuracoes_horario_unidade')
              .insert({
                tenant_id: tId,
                dia_semana: config.dia_semana,
                ...payload,
              })
              .select();
            if (ins.error) throw ins.error;
          }
        }
      }

      toast.success('Horário da barbearia atualizado! O horário pessoal de cada barbeiro continua o mesmo.');
      await loadConfigs();
    } catch (error: any) {
      console.error('Erro ao salvar configurações:', error);
      toast.error(error?.message || 'Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const handleApplyToOtherDays = async (sourceConfig: HorarioConfig, selectedDaysList: number[]) => {
    if (selectedDaysList.length === 0) return;

    const nextConfigs = configs.map(cfg => {
      if (selectedDaysList.includes(cfg.dia_semana)) {
        return {
          ...cfg,
          aberto: true,
          hora_abertura: sourceConfig.hora_abertura || '09:00',
          hora_fechamento: sourceConfig.hora_fechamento || '20:00',
          hora_almoco_inicio: sourceConfig.hora_almoco_inicio,
          hora_almoco_fim: sourceConfig.hora_almoco_fim,
          slot_interval_minutes: sourceConfig.slot_interval_minutes ?? tenantSlot ?? 15,
        };
      }
      return cfg; // Preserva intactos os dias não selecionados
    });

    setConfigs(nextConfigs);
    checkChanges(nextConfigs);
    setSaving(true);

    try {
      const sanitize = (val: string | null) => (val === '' || val === null) ? null : val;

      if (usePerBarber && barbeiroId) {
        const promises = nextConfigs
          .filter(c => selectedDaysList.includes(c.dia_semana))
          .map(async (config) => {
            const payload = {
              aberto: config.aberto,
              hora_abertura: config.hora_abertura || '09:00',
              hora_fechamento: config.hora_fechamento || '20:00',
              hora_almoco_inicio: sanitize(config.hora_almoco_inicio),
              hora_almoco_fim: sanitize(config.hora_almoco_fim),
              delay_entre_servicos: config.delay_entre_servicos,
              ...(config.slot_interval_minutes !== undefined ? { slot_interval_minutes: config.slot_interval_minutes } : {}),
            };
            const upd = await (supabase as any)
              .from('configuracoes_horario_barbeiro')
              .update(payload)
              .eq('barbeiro_id', barbeiroId)
              .eq('dia_semana', config.dia_semana)
              .select();
            if (upd.error) throw upd.error;
            if (!upd.data || upd.data.length === 0) {
              const ins = await (supabase as any)
                .from('configuracoes_horario_barbeiro')
                .insert({ ...payload, barbeiro_id: barbeiroId, dia_semana: config.dia_semana })
                .select();
              if (ins.error) throw ins.error;
            }
          });
        await Promise.all(promises);
      } else {
        const tId = await resolveTenantId();
        if (!tId) throw new Error('Não foi possível identificar a barbearia');
        const defaultUId = await resolveDefaultUnitId(tId);
        const targetUnitIds = unitIds.length > 0 ? unitIds : (defaultUId ? [defaultUId] : []);
        const configsToSave = nextConfigs.filter(c => selectedDaysList.includes(c.dia_semana));

        if (targetUnitIds.length > 0) {
          for (const uId of targetUnitIds) {
            for (const config of configsToSave) {
              const payload = {
                aberto: config.aberto,
                hora_abertura: config.hora_abertura || '09:00',
                hora_fechamento: config.hora_fechamento || '20:00',
                hora_almoco_inicio: sanitize(config.hora_almoco_inicio),
                hora_almoco_fim: sanitize(config.hora_almoco_fim),
                delay_entre_servicos: config.delay_entre_servicos,
                updated_at: new Date().toISOString(),
              };
              const upd = await (supabase as any)
                .from('configuracoes_horario_unidade')
                .update(payload)
                .eq('unidade_id', uId)
                .eq('dia_semana', config.dia_semana)
                .select();
              if (upd.error) throw upd.error;
              if (!upd.data || upd.data.length === 0) {
                const ins = await (supabase as any)
                  .from('configuracoes_horario_unidade')
                  .insert({ tenant_id: tId, unidade_id: uId, dia_semana: config.dia_semana, ...payload })
                  .select();
                if (ins.error) throw ins.error;
              }
            }
          }
        } else {
          for (const config of configsToSave) {
            const payload = {
              aberto: config.aberto,
              hora_abertura: config.hora_abertura || '09:00',
              hora_fechamento: config.hora_fechamento || '20:00',
              hora_almoco_inicio: sanitize(config.hora_almoco_inicio),
              hora_almoco_fim: sanitize(config.hora_almoco_fim),
              delay_entre_servicos: config.delay_entre_servicos,
              updated_at: new Date().toISOString(),
            };
            const upd = await (supabase as any)
              .from('configuracoes_horario_unidade')
              .update(payload)
              .eq('tenant_id', tId)
              .eq('dia_semana', config.dia_semana)
              .select();
            if (upd.error) throw upd.error;
            if (!upd.data || upd.data.length === 0) {
              const ins = await (supabase as any)
                .from('configuracoes_horario_unidade')
                .insert({ tenant_id: tId, dia_semana: config.dia_semana, ...payload })
                .select();
              if (ins.error) throw ins.error;
            }
          }
        }
      }

      originalRef.current = JSON.stringify(nextConfigs);
      setHasChanges(false);
      toast.success(
        selectedDaysList.length === 7
          ? 'Horários aplicados a toda a semana com sucesso!'
          : `Horários aplicados a ${selectedDaysList.length} dias selecionados!`
      );
      setWeeklyConfigState(null);
    } catch (err: any) {
      console.error('Erro ao aplicar horários:', err);
      toast.error(err?.message || 'Erro ao aplicar horários');
    } finally {
      setSaving(false);
    }
  };

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
            horaFechamento={(source?.hora_fechamento || '20:00').slice(0, 5)}
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
                  id: source?.id || '',
                  dia_semana: source?.dia_semana ?? 1,
                  aberto: true,
                  hora_abertura: source?.hora_abertura || '09:00',
                  hora_fechamento: source?.hora_fechamento || '20:00',
                  hora_almoco_inicio: source?.hora_almoco_inicio ?? null,
                  hora_almoco_fim: source?.hora_almoco_fim ?? null,
                  delay_entre_servicos: source?.delay_entre_servicos ?? 0,
                  slot_interval_minutes: source?.slot_interval_minutes ?? tenantSlot ?? 15,
                },
                weeklyConfigState.selectedDays
              );
            }}
            saving={saving}
            existingDaySummaries={existingDaySummaries}
          />
        </motion.div>
      </ScreenShell>
    );
  }

  const selectedConfig = selectedDay !== null ? configs.find(c => c.dia_semana === selectedDay) : null;

  /* ── Sub-tela: Dia da semana ── */
  if (selectedConfig) {
    return (
      <AnimatePresence mode="wait">
        <DayScheduleScreen
          key={selectedDay}
          config={selectedConfig}
          onBack={() => setSelectedDay(null)}
          onUpdate={(field, value) => updateConfig(selectedConfig.dia_semana, field, value)}
          onSave={saveConfigs}
          saving={saving}
          hasChanges={hasChanges}
          tenantSlotInterval={tenantSlot}
          savingSlotInterval={saveSlotMutation.isPending}
          onSaveSlotInterval={async (minutos, aplicarTodosDias) => {
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

            const tId = await resolveTenantId();
            const defaultUId = tId ? await resolveDefaultUnitId(tId) : null;
            const effectiveUId = unitIds[0] || defaultUId || undefined;

            await saveSlotMutation.mutateAsync({
              barbeiroId: usePerBarber && barbeiroId ? barbeiroId : undefined,
              tenantId: tId || undefined,
              unidadeId: effectiveUId,
              minutos,
              dia_semana: selectedConfig.dia_semana,
              aplicarTodosDias,
            });
            await loadConfigs();
          }}
          onApplyToOtherDays={(srcCfg, targetDays) => {
            setWeeklyConfigState({
              sourceDay: srcCfg.dia_semana,
              selectedDays: targetDays,
            });
          }}
          existingDaySummaries={existingDaySummaries}
        />
      </AnimatePresence>
    );
  }

  /* ── Sub-tela: Modo Férias ── */
  if (activeSubScreen === 'ferias' && !hideAdvanced) {
    return (
      <ScreenShell header={<ScheduleHeader title="Modo Férias" onBack={() => setActiveSubScreen(null)} />}>
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'tween', duration: 0.22, ease: 'easeOut' }}
          className="pt-4 pb-6"
        >
          {barbeiroId ? <BarberVacationMode barbeiroId={barbeiroId} /> : <VacationMode />}
        </motion.div>
      </ScreenShell>
    );
  }

  /* ── Sub-tela: Exceções de Horário ── */
  if (activeSubScreen === 'excecoes' && !hideAdvanced) {
    return (
      <ScreenShell header={<ScheduleHeader title="Exceções de Horário" onBack={() => setActiveSubScreen(null)} />}>
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'tween', duration: 0.22, ease: 'easeOut' }}
          className="pt-4 pb-6"
        >
          <HorariosExcepcionais barbeiroId={barbeiroId} />
        </motion.div>
      </ScreenShell>
    );
  }


  /* ── Tela principal: Lista de dias + navegação avançada ── */
  return (
    <ScreenShell
      header={<ScheduleHeader title="Horário de funcionamento" backTo={basePath} />}
      bottomReserve={hasChanges ? 96 : 0}
    >
      <div className="w-full max-w-lg mx-auto pt-2 pb-6 space-y-4 px-1 sm:px-0">
        {/* Aviso de escopo de horários */}
        <div className="rounded-2xl border border-border/40 bg-secondary/35 p-3.5 flex items-start gap-3 shadow-xs">
          <div className="w-8 h-8 rounded-xl bg-foreground/10 flex items-center justify-center shrink-0 mt-0.5">
            <Clock className="w-4 h-4 text-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-foreground">
              {useUnitTable ? 'Horários de funcionamento da barbearia' : 'Seus horários individuais de trabalho'}
            </p>
            <p className="text-[11.5px] text-muted-foreground/80 mt-0.5 leading-relaxed">
              {useUnitTable
                ? 'Estes são os horários da barbearia. Eles não alteram o horário pessoal de nenhum barbeiro — cada profissional mantém sua própria escala.'
                : 'Esta configuração define exclusivamente a sua disponibilidade na agenda pessoal e não altera os horários de outros profissionais.'}
            </p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground/60 leading-relaxed font-light">
          {useUnitTable
            ? 'Defina o período geral de funcionamento do estabelecimento. Toque em um dia para configurar.'
            : 'Configure os dias e horários em que você estará disponível para agendamentos. Toque em um dia para ajustar os detalhes.'}
        </p>


        {/* Banner: Configuração da Semana Inteira */}
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-card border border-border/40 shadow-xs gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <CalendarDays className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-foreground">
                Configurar semana inteira
              </p>
              <p className="text-[11px] text-muted-foreground/80 leading-snug">
                Aplique horários e intervalos a todos os dias em uma ação única
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

        {/* Lista de dias */}
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
        {!hideAdvanced && (
          <div>
            <span className="text-[11px] text-muted-foreground/50 font-light uppercase tracking-wider">
              Configurações avançadas
            </span>
            <div className="h-px bg-border/15 mt-2" />

            <button
              onClick={() => setActiveSubScreen('ferias')}
              className="flex items-center justify-between py-4 w-full text-left active:bg-muted/10 transition-colors"
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
              className="flex items-center justify-between py-4 w-full text-left active:bg-muted/10 transition-colors"
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
      </div>

      <StickyFooter show={hasChanges} aboveBottomNav>
        <PrimaryCta onClick={saveConfigs} loading={saving}>
          {saving ? 'Salvando…' : 'Salvar alterações'}
        </PrimaryCta>
      </StickyFooter>
    </ScreenShell>
  );
}
