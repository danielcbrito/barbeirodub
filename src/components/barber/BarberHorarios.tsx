import { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AnimatePresence } from 'framer-motion';
import { DayScheduleScreen } from '@/components/shared/DayScheduleScreen';
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

  /* Configs efetivos: se há edição local, usa local; senão, usa query */
  const configs = localConfigs ?? queryConfigs;

  /* Quando os dados do query carregam, sincronizar referência original */
  const syncOriginal = useCallback(() => {
    if (queryConfigs.length > 0 && !originalRef.current) {
      originalRef.current = JSON.stringify(queryConfigs);
    }
  }, [queryConfigs]);
  syncOriginal();

  const checkChanges = (newConfigs: HorarioConfig[]) => {
    setHasChanges(JSON.stringify(newConfigs) !== (originalRef.current || JSON.stringify(queryConfigs)));
  };

  const updateConfig = (diaSemana: number, field: string, value: any) => {
    const base = localConfigs ?? [...queryConfigs];
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

  const saveConfigs = (targetDiaSemana?: number) => {
    const current = localConfigs ?? queryConfigs;

    // Validar limites da barbearia (específico do dia ou todos)
    const validationError = validateAgainstCompanyHours(current, targetDiaSemana);
    if (validationError) {
      toast.error(validationError, { duration: 5000 });
      return;
    }

    const configsToSave = targetDiaSemana !== undefined
      ? current.filter(c => c.dia_semana === targetDiaSemana)
      : current;

    saveHorariosMutation.mutate(
      {
        barbeiroId: barberContext.barbeiroId,
        configs: configsToSave.map(c => ({
          dia_semana: c.dia_semana,
          aberto: c.aberto,
          hora_abertura: c.hora_abertura,
          hora_fechamento: c.hora_fechamento,
          hora_almoco_inicio: c.hora_almoco_inicio,
          hora_almoco_fim: c.hora_almoco_fim,
          delay_entre_servicos: c.delay_entre_servicos,
        })),
      },
      {
        onSuccess: () => {
          originalRef.current = JSON.stringify(current);
          setHasChanges(false);
          setLocalConfigs(null);
        },
      }
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
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
            }}
            onBack={() => setSelectedDay(null)}
            onUpdate={(field, value) => updateConfig(selectedConfig.dia_semana, field, value)}
            onSave={() => saveConfigs(selectedConfig.dia_semana)}
            saving={saving}
            hasChanges={hasChanges}
            tenantSlotInterval={tenantSlot}
            savingSlotInterval={saveSlotMutation.isPending}
            onSaveSlotInterval={async (minutos, aplicarTodosDias) => {
              await saveSlotMutation.mutateAsync({
                barbeiroId: barberContext.barbeiroId,
                minutos,
                dia_semana: selectedConfig.dia_semana,
                aplicarTodosDias,
              });
            }}
          />
        </AnimatePresence>
      </div>
    );
  }

  if (activeSubScreen === 'ferias') {
    return (
      <div className="max-w-lg space-y-6 animate-fade-in">
        <button onClick={() => setActiveSubScreen(null)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Voltar aos Horários
        </button>
        <BarberVacationMode barbeiroId={barberContext.barbeiroId} />
      </div>
    );
  }

  if (activeSubScreen === 'excecoes') {
    return (
      <div className="max-w-lg space-y-6 animate-fade-in">
        <button onClick={() => setActiveSubScreen(null)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Voltar aos Horários
        </button>
        <BarberHorariosExcepcionais barbeiroId={barberContext.barbeiroId} />
      </div>
    );
  }


  return (
    <div className="space-y-6 max-w-lg animate-fade-in">
      <h2 className="text-2xl font-bold text-foreground">Horário de Funcionamento</h2>

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
      <div>
        <span className="text-[11px] text-muted-foreground/50 font-light uppercase tracking-wider">
          Configurações avançadas
        </span>
        <div className="h-px bg-border/15 mt-2" />

        <button onClick={() => setActiveSubScreen('ferias')} className="flex items-center justify-between py-4 w-full text-left hover:bg-muted/5 active:bg-muted/10 transition-colors">
          <span className="text-sm font-semibold text-foreground">Modo Férias</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
        </button>

        <div className="h-px bg-border/10" />

        <button onClick={() => setActiveSubScreen('excecoes')} className="flex items-center justify-between py-4 w-full text-left hover:bg-muted/5 active:bg-muted/10 transition-colors">
          <span className="text-sm font-semibold text-foreground">Exceções de Horário</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
        </button>

        <div className="h-px bg-border/15" />
      </div>

      {hasChanges && (
        <div className="pt-4">
          <Button onClick={saveConfigs} disabled={saving} className="w-full h-[48px] rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm shadow-sm transition-colors">
            {saving ? (<><Loader2 className="h-4 w-4 animate-spin mr-2" />Salvando...</>) : 'Salvar'}
          </Button>
        </div>
      )}
    </div>
  );
}
