import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ChevronRight, Loader2, CalendarDays } from 'lucide-react';
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
  unidadeId?: string;
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

export const timeToMinutes = (
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
      return 24 * 60; // 1440 min (meia-noite / fim do dia)
    }
    return h * 60 + m;
  }
  return fallback;
};

const toTime = (value: string | null | undefined, fallback: string) =>
  formatTimeClean(value, fallback);

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
  unidadeId,
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
  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(tenantId ?? null);
  const [resolvedUnidadeId, setResolvedUnidadeId] = useState<string | null>(unidadeId ?? null);

  useEffect(() => {
    if (tenantId) setResolvedTenantId(tenantId);
  }, [tenantId]);

  useEffect(() => {
    if (unidadeId) setResolvedUnidadeId(unidadeId);
  }, [unidadeId]);

  const resolveTenantAndUnit = async (): Promise<{ tId: string | null; uId: string | null }> => {
    let tId = resolvedTenantId || tenantId || null;
    let uId = resolvedUnidadeId || unidadeId || null;

    if (!tId && barbeiroId) {
      const { data } = await supabase
        .from('barbeiros')
        .select('tenant_id, unidade_id')
        .eq('id', barbeiroId)
        .maybeSingle();
      if (data?.tenant_id) {
        tId = data.tenant_id;
        if (!uId && data.unidade_id) uId = data.unidade_id;
      }
    }

    if (!tId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        const { data: barb } = await supabase
          .from('barbeiros')
          .select('tenant_id, unidade_id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (barb?.tenant_id) {
          tId = barb.tenant_id;
          if (!uId && barb.unidade_id) uId = barb.unidade_id;
        } else {
          const { data: ten } = await supabase
            .from('tenants')
            .select('id')
            .eq('owner_user_id', user.id)
            .maybeSingle();
          if (ten?.id) tId = ten.id;
        }
      }
    }

    if (tId && !uId) {
      const { data: units } = await supabase
        .from('tenant_unidades')
        .select('id')
        .eq('tenant_id', tId)
        .order('is_sede', { ascending: false })
        .limit(1);
      if (units && units.length > 0) {
        uId = units[0].id;
      }
    }

    if (tId && tId !== resolvedTenantId) setResolvedTenantId(tId);
    if (uId && uId !== resolvedUnidadeId) setResolvedUnidadeId(uId);

    return { tId, uId };
  };

  useEffect(() => {
    const effectiveTId = tenantId || resolvedTenantId;
    if (!effectiveTId) return;
    supabase.from('tenants').select('slot_interval_minutes').eq('id', effectiveTId).maybeSingle()
      .then(({ data }) => {
        const v = (data as { slot_interval_minutes?: number } | null)?.slot_interval_minutes;
        if (typeof v === 'number') setTenantSlot(v);
      });
  }, [tenantId, resolvedTenantId]);

  const [hasChanges, setHasChanges] = useState(false);
  const originalRef = useRef<string>('');
  const [companyHoursCache, setCompanyHoursCache] = useState<Array<{dia_semana: number; aberto: boolean; hora_abertura: string; hora_fechamento: string}>>([]);
  const [applyToWeek, setApplyToWeek] = useState<{ sourceDay: number; selectedDays: number[] } | null>(null);

  const existingDaySummaries = useMemo(() => {
    const map: Record<number, string> = {};
    configs.forEach((c) => {
      map[c.dia_semana] = c.aberto
        ? `${(c.hora_abertura || DEFAULT_OPEN_TIME).slice(0, 5)} - ${(c.hora_fechamento || DEFAULT_CLOSE_TIME).slice(0, 5)}`
        : 'Fechado';
    });
    return map;
  }, [configs]);

  // Carregar horários da barbearia (unidade/tenant) para validação (quando barbeiro pessoal)
  useEffect(() => {
    if (barbeiroId && !companyMode) {
      (async () => {
        const { tId, uId } = await resolveTenantAndUnit();
        let list: any[] | null = null;
        if (uId) {
          const { data } = await (supabase as any)
            .from('configuracoes_horario_unidade')
            .select('dia_semana, aberto, hora_abertura, hora_fechamento')
            .eq('unidade_id', uId)
            .order('dia_semana');
          if (data && data.length > 0) list = data;
        }
        if (!list && tId) {
          const { data } = await (supabase as any)
            .from('configuracoes_horario_unidade')
            .select('dia_semana, aberto, hora_abertura, hora_fechamento')
            .eq('tenant_id', tId)
            .order('dia_semana');
          if (data && data.length > 0) list = data;
        }
        if (list && list.length > 0) {
          setCompanyHoursCache(list.map((c: any) => ({
            ...c,
            hora_abertura: formatTimeClean(c.hora_abertura, '09:00'),
            hora_fechamento: formatTimeClean(c.hora_fechamento, '20:00'),
          })));
          return;
        }
        supabase
          .from('configuracoes_horario')
          .select('dia_semana, aberto, hora_abertura, hora_fechamento')
          .order('dia_semana')
          .then(({ data }) => {
            if (data) {
              setCompanyHoursCache(data.map((c: any) => ({
                ...c,
                hora_abertura: formatTimeClean(c.hora_abertura, '09:00'),
                hora_fechamento: formatTimeClean(c.hora_fechamento, '20:00'),
              })));
            }
          });
      })();
    }
  }, [barbeiroId, companyMode, tenantId, unidadeId]);

  useEffect(() => { loadConfigs(); }, [barbeiroId, companyMode, tenantId, unidadeId]);

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

      if (barbeiroId && !companyMode) {
        // Horário individual do barbeiro
        const res = await supabase
          .from('configuracoes_horario_barbeiro')
          .select('id, dia_semana, aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, delay_entre_servicos, slot_interval_minutes')
          .eq('barbeiro_id', barbeiroId)
          .order('dia_semana');
        data = res.data;
        error = res.error;
      } else {
        // Horário da barbearia (unidade / tenant)
        const { tId, uId } = await resolveTenantAndUnit();
        let res: any = null;

        if (uId) {
          res = await (supabase as any)
            .from('configuracoes_horario_unidade')
            .select('id, dia_semana, aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, delay_entre_servicos, slot_interval_minutes')
            .eq('unidade_id', uId)
            .order('dia_semana');
        }

        if ((!res || !res.data || res.data.length === 0) && tId) {
          res = await (supabase as any)
            .from('configuracoes_horario_unidade')
            .select('id, dia_semana, aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, delay_entre_servicos, slot_interval_minutes')
            .eq('tenant_id', tId)
            .order('dia_semana');
        }

        if (res?.data && res.data.length > 0) {
          data = res.data;
          error = res.error;
        } else {
          // Se ainda não há linhas na barbearia, exibe defaults baseados no template global
          const defaultRes = await supabase
            .from('configuracoes_horario')
            .select('id, dia_semana, aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, delay_entre_servicos')
            .order('dia_semana');
          data = defaultRes.data;
          error = defaultRes.error;
        }
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
        // Sem configs salvas ainda: no onboarding começa 00:00-00:00; fora dele, 09:00 - 20:00.
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
   * Se targetDiaSemana for informado, valida APENAS aquele dia específico,
   * evitando que eventuais divergências em outros dias bloqueiem a edição do dia atual.
   */
  const validateAgainstCompanyHours = (targetDiaSemana?: number): string | null => {
    if (forceOnboardingDefaultHours) return null;
    if (!barbeiroId || companyMode || companyHoursCache.length === 0) return null;

    const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

    const configsToValidate = targetDiaSemana !== undefined
      ? configs.filter(c => c.dia_semana === targetDiaSemana)
      : configs;

    for (const cfg of configsToValidate) {
      if (!cfg.aberto) continue;
      const company = companyHoursCache.find(c => c.dia_semana === cfg.dia_semana);
      if (!company || !company.aberto) {
        return `${DIAS[cfg.dia_semana]}: a barbearia está fechada neste dia.`;
      }
      const barberOpenMin = timeToMinutes(cfg.hora_abertura, 9 * 60, false);
      const barberCloseMin = timeToMinutes(cfg.hora_fechamento, 18 * 60, true);
      const companyOpenMin = timeToMinutes(company.hora_abertura, 9 * 60, false);
      const companyCloseMin = timeToMinutes(company.hora_fechamento, 20 * 60, true);

      const openStr = formatTimeClean(cfg.hora_abertura, '09:00');
      const closeStr = formatTimeClean(cfg.hora_fechamento, '18:00');
      const companyOpenStr = formatTimeClean(company.hora_abertura, '09:00');
      const companyCloseStr = formatTimeClean(company.hora_fechamento, '20:00');

      if (barberOpenMin < companyOpenMin) {
        return `${DIAS[cfg.dia_semana]}: abertura (${openStr}) antes do horário da barbearia (${companyOpenStr}).`;
      }
      if (barberCloseMin > companyCloseMin) {
        return `${DIAS[cfg.dia_semana]}: fechamento (${closeStr}) após o horário da barbearia (${companyCloseStr}).`;
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

  /**
   * Salva exclusivamente o dia selecionado, garantindo isolamento total contra outros dias.
   */
  const saveSingleDay = async (config: HorarioConfig): Promise<boolean> => {
    setSaving(true);
    try {
      const sanitize = (val: string | null) => (val === '' || val === null) ? null : val;

      if (barbeiroId && !companyMode) {
        // ── Salvar horário PESSOAL do barbeiro (apenas este dia) ──
        const payload = {
          aberto: config.aberto,
          hora_abertura: config.hora_abertura || DEFAULT_OPEN_TIME,
          hora_fechamento: config.hora_fechamento || DEFAULT_CLOSE_TIME,
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

        if (!hideSaveButton) toast.success('Seu horário pessoal foi salvo com sucesso!');
      } else {
        // ── Salvar horário da BARBEARIA (apenas este dia) ──
        const { tId, uId } = await resolveTenantAndUnit();
        if (!tId) throw new Error('Não foi possível identificar a barbearia');

        const payload = {
          aberto: config.aberto,
          hora_abertura: config.hora_abertura || DEFAULT_OPEN_TIME,
          hora_fechamento: config.hora_fechamento || DEFAULT_CLOSE_TIME,
          hora_almoco_inicio: sanitize(config.hora_almoco_inicio),
          hora_almoco_fim: sanitize(config.hora_almoco_fim),
          delay_entre_servicos: config.delay_entre_servicos,
          updated_at: new Date().toISOString(),
        };

        let upd = null;
        if (uId) {
          upd = await (supabase as any)
            .from('configuracoes_horario_unidade')
            .update(payload)
            .eq('unidade_id', uId)
            .eq('dia_semana', config.dia_semana)
            .select();
        } else {
          upd = await (supabase as any)
            .from('configuracoes_horario_unidade')
            .update(payload)
            .eq('tenant_id', tId)
            .eq('dia_semana', config.dia_semana)
            .select();
        }

        if (upd?.error) throw upd.error;

        if (!upd?.data || upd.data.length === 0) {
          const ins = await (supabase as any)
            .from('configuracoes_horario_unidade')
            .insert({
              tenant_id: tId,
              unidade_id: uId || null,
              dia_semana: config.dia_semana,
              ...payload,
            })
            .select();
          if (ins.error) throw ins.error;
        }

        if (!hideSaveButton) {
          toast.success('Horário da barbearia atualizado com sucesso!');
        }
      }

      setConfigs(prev => {
        const next = prev.map(c => c.dia_semana === config.dia_semana ? normalizeConfig(config) : c);
        originalRef.current = JSON.stringify(next);
        setHasChanges(false);
        return next;
      });
      return true;
    } catch (error: any) {
      console.error('Erro ao salvar dia:', error);
      toast.error(error?.message || 'Erro ao salvar configurações');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveConfigs = async (): Promise<boolean> => {
    setSaving(true);
    try {
      const sanitize = (val: string | null) => (val === '' || val === null) ? null : val;

      if (barbeiroId && !companyMode) {
        // ── Salvar horário PESSOAL do barbeiro (apenas este barbeiro) ──
        const promises = configs.map(async (config) => {
          const payload = {
            aberto: config.aberto,
            hora_abertura: config.hora_abertura || DEFAULT_OPEN_TIME,
            hora_fechamento: config.hora_fechamento || DEFAULT_CLOSE_TIME,
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

        if (!hideSaveButton) toast.success('Seu horário pessoal foi salvo com sucesso!');
      } else {
        // ── Salvar horário da BARBEARIA (apenas configuracoes_horario_unidade) ──
        const { tId, uId } = await resolveTenantAndUnit();
        if (!tId) throw new Error('Não foi possível identificar a barbearia');

        for (const config of configs) {
          const payload = {
            aberto: config.aberto,
            hora_abertura: config.hora_abertura || DEFAULT_OPEN_TIME,
            hora_fechamento: config.hora_fechamento || DEFAULT_CLOSE_TIME,
            hora_almoco_inicio: sanitize(config.hora_almoco_inicio),
            hora_almoco_fim: sanitize(config.hora_almoco_fim),
            delay_entre_servicos: config.delay_entre_servicos,
            updated_at: new Date().toISOString(),
          };

          let upd = null;
          if (uId) {
            upd = await (supabase as any)
              .from('configuracoes_horario_unidade')
              .update(payload)
              .eq('unidade_id', uId)
              .eq('dia_semana', config.dia_semana)
              .select();
          } else {
            upd = await (supabase as any)
              .from('configuracoes_horario_unidade')
              .update(payload)
              .eq('tenant_id', tId)
              .eq('dia_semana', config.dia_semana)
              .select();
          }

          if (upd?.error) throw upd.error;

          if (!upd?.data || upd.data.length === 0) {
            const ins = await (supabase as any)
              .from('configuracoes_horario_unidade')
              .insert({
                tenant_id: tId,
                unidade_id: uId || null,
                dia_semana: config.dia_semana,
                ...payload,
              })
              .select();
            if (ins.error) throw ins.error;
          }
        }

        if (!hideSaveButton) {
          toast.success('Horário da barbearia atualizado com sucesso! Os horários pessoais de cada barbeiro permanecem intactos.');
        }
      }

      // Atualizar referência local sem re-fetch (update otimista)
      const normalizedConfigs = configs.map(normalizeConfig);
      setConfigs(normalizedConfigs);
      originalRef.current = JSON.stringify(normalizedConfigs);
      setHasChanges(false);
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
            slot_interval_minutes: source.slot_interval_minutes ?? tenantSlot ?? 15,
          };
        }
        return cfg; // Preserva intactos os dias não selecionados!
      });
      setConfigs(nextConfigs);
      checkChanges(nextConfigs);
      // Aguarda o próximo tick para garantir estado antes de salvar
      await new Promise(r => setTimeout(r, 0));
      setSaving(true);
      try {
        const sanitize = (val: string | null) => (val === '' || val === null) ? null : val;

        if (barbeiroId && !companyMode) {
          const promises = nextConfigs
            .filter(c => applyToWeek.selectedDays.includes(c.dia_semana))
            .map(async (config) => {
              const payload = {
                aberto: config.aberto,
                hora_abertura: config.hora_abertura || DEFAULT_OPEN_TIME,
                hora_fechamento: config.hora_fechamento || DEFAULT_CLOSE_TIME,
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
          const { tId, uId } = await resolveTenantAndUnit();
          if (!tId) throw new Error('Não foi possível identificar a barbearia');

          const configsToSave = nextConfigs.filter(c => applyToWeek.selectedDays.includes(c.dia_semana));

          for (const config of configsToSave) {
            const payload = {
              aberto: config.aberto,
              hora_abertura: config.hora_abertura || DEFAULT_OPEN_TIME,
              hora_fechamento: config.hora_fechamento || DEFAULT_CLOSE_TIME,
              hora_almoco_inicio: sanitize(config.hora_almoco_inicio),
              hora_almoco_fim: sanitize(config.hora_almoco_fim),
              delay_entre_servicos: config.delay_entre_servicos,
              slot_interval_minutes: config.slot_interval_minutes,
              updated_at: new Date().toISOString(),
            };

            let upd = null;
            if (uId) {
              upd = await (supabase as any)
                .from('configuracoes_horario_unidade')
                .update(payload)
                .eq('unidade_id', uId)
                .eq('dia_semana', config.dia_semana)
                .select();
            } else {
              upd = await (supabase as any)
                .from('configuracoes_horario_unidade')
                .update(payload)
                .eq('tenant_id', tId)
                .eq('dia_semana', config.dia_semana)
                .select();
            }
            if (upd?.error) throw upd.error;

            if (!upd?.data || upd.data.length === 0) {
              const ins = await (supabase as any)
                .from('configuracoes_horario_unidade')
                .insert({
                  tenant_id: tId,
                  unidade_id: uId || null,
                  dia_semana: config.dia_semana,
                  ...payload,
                })
                .select();
              if (ins.error) throw ins.error;
            }
          }
        }
        const normalized = nextConfigs.map(normalizeConfig);
        setConfigs(normalized);
        originalRef.current = JSON.stringify(normalized);
        setHasChanges(false);
        setApplyToWeek(null);
        setSelectedDay(null);
        toast.success(
          applyToWeek.selectedDays.length === 7
            ? 'Horários aplicados a toda a semana com sucesso!'
            : `Horários aplicados a ${applyToWeek.selectedDays.length} dias selecionados!`
        );
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
            slotIntervalMinutes={source.slot_interval_minutes ?? tenantSlot ?? 15}
            selectedDays={applyToWeek.selectedDays}
            onToggleDay={handleToggleDay}
            onSetSelectedDays={(days) => setApplyToWeek(prev => (prev ? { ...prev, selectedDays: days } : prev))}
            onSave={handleApplyAndSave}
            onBack={() => setApplyToWeek(null)}
            saving={saving}
            floatingBottomButton={dayFloatingBottomButton}
            existingDaySummaries={existingDaySummaries}
          />
        </AnimatePresence>
      </div>
    );
  }

  if (selectedConfig) {
    const handleBackFromDay = async () => {
      if (autoSaveOnDayExit && hasChanges) {
        const validationError = validateAgainstCompanyHours(selectedConfig.dia_semana);
        if (validationError) {
          toast.error(validationError, { duration: 5000 });
          return;
        }
        const saved = await saveSingleDay(selectedConfig);
        if (!saved) return;
      }
      setSelectedDay(null);
    };

    const handleConfirmDay = async () => {
      const validationError = validateAgainstCompanyHours(selectedConfig.dia_semana);
      if (validationError) {
        toast.error(validationError, { duration: 5000 });
        return false;
      }
      const saved = await saveSingleDay(selectedConfig);
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

              const effectiveTId = tenantId || resolvedTenantId;
              await saveSlotMutation.mutateAsync({
                barbeiroId: (barbeiroId && !companyMode) ? barbeiroId : undefined,
                tenantId: effectiveTId || undefined,
                unidadeId: resolvedUnidadeId || undefined,
                minutos,
                dia_semana: selectedConfig.dia_semana,
                aplicarTodosDias,
              });
              await loadConfigs();
            }}
            onApplyToOtherDays={(srcCfg, targetDays) => {
              setApplyToWeek({
                sourceDay: srcCfg.dia_semana,
                selectedDays: targetDays,
              });
            }}
            existingDaySummaries={existingDaySummaries}
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

      {/* ── Banner: Configuração da Semana Inteira ── */}
      <div className="flex items-center justify-between p-3.5 rounded-2xl bg-card border border-border/40 shadow-xs gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <CalendarDays className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Configurar semana inteira
            </p>
            <p className="text-[11.5px] text-muted-foreground/80 leading-snug">
              Aplique horários e intervalos a todos os dias da semana em uma ação única
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => {
            const firstOpen = configs.find(c => c.aberto) || configs[1] || configs[0];
            setApplyToWeek({
              sourceDay: firstOpen?.dia_semana ?? 1,
              selectedDays: [0, 1, 2, 3, 4, 5, 6],
            });
          }}
          className="shrink-0 h-9 px-3.5 rounded-xl text-xs font-semibold shadow-xs"
        >
          Configurar
        </Button>
      </div>

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
