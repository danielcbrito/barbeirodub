import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSaveBarberSchedule } from '@/hooks/useBarberMutations';
import { toast } from 'sonner';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { DayScheduleScreen } from '@/components/shared/DayScheduleScreen';
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

  const saveConfigs = () => {
    saveScheduleMutation.mutate(
      { barbeiroId: barberContext.barbeiroId, configs },
      {
        onSuccess: () => loadConfigs(),
      }
    );
  };

  const saving = saveScheduleMutation.isPending;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
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
            await saveSlotMutation.mutateAsync({
              barbeiroId: barberContext.barbeiroId,
              minutos,
              dia_semana: selectedConfig.dia_semana,
              aplicarTodosDias,
            });
            await loadConfigs();
          }}
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
      <div className="mx-auto w-full max-w-md pt-2 pb-4 space-y-6">
        <p className="text-[11px] text-muted-foreground/50 leading-relaxed font-light">
          Configure os dias e horários em que você estará disponível para agendamentos. Toque em um dia para ajustar os detalhes.
        </p>

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
