import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ChevronRight } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { DayScheduleScreen } from '@/components/shared/DayScheduleScreen';
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
  const unitIds = useMemo(() => {
    const raw = searchParams.get('unit_ids');
    return raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];
  }, [searchParams]);
  const scopeUnits = scope === 'units' && unitIds.length > 0;

  const [configs, setConfigs] = useState<HorarioConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [activeSubScreen, setActiveSubScreen] = useState<'ferias' | 'excecoes' | null>(null);
  const saveSlotMutation = useSaveSlotInterval();
  const [tenantSlot, setTenantSlot] = useState<number | null>(null);

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
  // - scope=units  → horários DA BARBEARIA (configuracoes_horario_unidade),
  //   sem tocar no horário pessoal de nenhum barbeiro.
  // - scope=self   → horário pessoal do barbeiro (configuracoes_horario_barbeiro).
  // - companyMode  → tabela global legada.
  const useUnitTable = scopeUnits && !companyMode;
  const usePerBarber = !!barbeiroId && !companyMode && !useUnitTable;
  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(tenantId ?? null);

  useEffect(() => {
    loadConfigs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barbeiroId, companyMode, useUnitTable, unitIds.join(',')]);

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
    return null;
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
        await resolveTenantId();
        const res = await (supabase as any).from('configuracoes_horario_unidade')
          .select('id, dia_semana, aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, delay_entre_servicos, slot_interval_minutes')
          .eq('unidade_id', unitIds[0])
          .order('dia_semana');
        if (res.error) throw res.error;
        data = res.data && res.data.length > 0 ? res.data : defaultUnitConfigs();
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
        const res = await supabase
          .from('configuracoes_horario')
          .select('id, dia_semana, aberto, hora_abertura, hora_fechamento, hora_almoco_inicio, hora_almoco_fim, delay_entre_servicos, slot_interval_minutes')
          .order('dia_semana');
        data = res.data;
        error = res.error;
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

      // ── Escopo BARBEARIA: grava só o horário da unidade ──
      if (useUnitTable) {
        const tId = await resolveTenantId();
        if (!tId) throw new Error('Não foi possível identificar a barbearia');

        for (const unidadeId of unitIds) {
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

        toast.success('Horário da barbearia atualizado! O horário pessoal de cada barbeiro continua o mesmo.');
        await loadConfigs();
        return;
      }

      const targetBarberIds: string[] = usePerBarber ? [barbeiroId as string] : [];

      for (const config of configs) {
        const payload = {
          aberto: config.aberto,
          hora_abertura: config.hora_abertura || '09:00',
          hora_fechamento: config.hora_fechamento || '20:00',
          hora_almoco_inicio: sanitize(config.hora_almoco_inicio),
          hora_almoco_fim: sanitize(config.hora_almoco_fim),
          delay_entre_servicos: config.delay_entre_servicos
        };

        if (usePerBarber) {
          for (const bId of targetBarberIds) {
            const res = await supabase
              .from('configuracoes_horario_barbeiro')
              .update(payload)
              .eq('barbeiro_id', bId)
              .eq('dia_semana', config.dia_semana)
              .select();
            if (res.error) throw res.error;
            if (!res.data || res.data.length === 0) {
              await supabase.rpc('initialize_barber_hours', { p_barbeiro_id: bId });
              const retry = await supabase
                .from('configuracoes_horario_barbeiro')
                .update(payload)
                .eq('barbeiro_id', bId)
                .eq('dia_semana', config.dia_semana)
                .select();
              if (retry.error) throw retry.error;
            }
          }
        } else {
          const res = await supabase
            .from('configuracoes_horario')
            .update(payload)
            .eq('dia_semana', config.dia_semana)
            .select();
          if (res.error) throw res.error;
          if (!res.data || res.data.length === 0) {
            throw new Error(`Falha ao salvar dia ${config.dia_semana}: nenhuma linha atualizada (verifique permissões)`);
          }
        }
      }
      toast.success('Configurações salvas com sucesso!');
      await loadConfigs();

    } catch (error: any) {
      console.error('Erro ao salvar configurações:', error);
      toast.error(error?.message || 'Erro ao salvar configurações');
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
          onSaveSlotInterval={usePerBarber && barbeiroId ? async (minutos, aplicarTodosDias) => {
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
      <div className="mx-auto w-full max-w-md pt-2 pb-4 space-y-6">
        <p className="text-[11px] text-muted-foreground/50 leading-relaxed font-light">
          {useUnitTable
            ? 'Estes são os horários da barbearia. Eles não alteram o horário pessoal de nenhum barbeiro — cada barbeiro continua com o horário dele.'
            : 'Configure os dias e horários em que você estará disponível para agendamentos. Toque em um dia para ajustar os detalhes.'}
        </p>


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
