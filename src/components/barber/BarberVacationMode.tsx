import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSaveVacation, useRemoveVacation, useRemoveAllVacations, useSaveVacationForUnits } from '@/hooks/useBarberMutations';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Loader2, UserRound, Building2, ChevronLeft } from 'lucide-react';
import { format, eachDayOfInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { getWhatsAppInstance } from '@/lib/whatsappInstanceHelper';
import { QUERY_KEYS } from '@/lib/queryKeys';
import { STALE_TIMES } from '@/lib/queryConstants';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface VacationPeriod {
  id: string;
  startDate: string;
  endDate: string;
  createdAt: string;
}

interface BarberVacationModeProps {
  barbeiroId: string;
}

interface BarbeariaOption {
  id: string;
  nome: string;
  source: 'tenant' | 'unidade';
}

/**
 * Agrupa registros de férias em períodos contíguos.
 */
function groupIntoPeriods(data: any[]): VacationPeriod[] {
  const periods: VacationPeriod[] = [];
  let currentPeriod: { start: string; end: string; id: string; createdAt: string } | null = null;

  (data || []).forEach((item, index) => {
    const itemDate = item.data;
    if (!currentPeriod) {
      currentPeriod = { start: itemDate, end: itemDate, id: item.id, createdAt: item.created_at || new Date().toISOString() };
    } else {
      const prevDate = new Date(currentPeriod.end + 'T12:00:00');
      const currDate = new Date(itemDate + 'T12:00:00');
      const diffDays = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        currentPeriod.end = itemDate;
      } else {
        periods.push({ id: currentPeriod.id, startDate: currentPeriod.start, endDate: currentPeriod.end, createdAt: currentPeriod.createdAt });
        currentPeriod = { start: itemDate, end: itemDate, id: item.id, createdAt: item.created_at || new Date().toISOString() };
      }
    }
    if (index === (data || []).length - 1 && currentPeriod) {
      periods.push({ id: currentPeriod.id, startDate: currentPeriod.start, endDate: currentPeriod.end, createdAt: currentPeriod.createdAt });
    }
  });

  return periods;
}

export default function BarberVacationMode({ barbeiroId }: BarberVacationModeProps) {
  const queryClient = useQueryClient();

  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  // Drawer de escopo (Só pra mim / Para as unidades)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'scope' | 'units'>('scope');
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);

  const [notifyDialogOpen, setNotifyDialogOpen] = useState(false);
  const [savedPeriodLabel, setSavedPeriodLabel] = useState('');
  const [sendingNotification, setSendingNotification] = useState(false);

  /** Busca nome + tenant do barbeiro */
  const { data: barberData } = useQuery({
    queryKey: [...QUERY_KEYS.barbeiro.perfil(barbeiroId), 'apelido-tenant'],
    queryFn: async () => {
      const { data } = await supabase
        .from('barbeiros')
        .select('apelido, tenant_id')
        .eq('id', barbeiroId)
        .single();
      return { apelido: data?.apelido || '', tenantId: data?.tenant_id || null };
    },
    staleTime: STALE_TIMES.PERFIL_BARBEIRO,
    enabled: !!barbeiroId,
  });

  const barberName = barberData?.apelido || '';
  const tenantId = barberData?.tenantId || null;

  /** Busca tenant + unidades para o drawer "Para as unidades" */
  const { data: scopeOptions } = useQuery({
    queryKey: ['barber-vacation-scope', tenantId],
    queryFn: async (): Promise<{ tenantNome: string | null; unidades: BarbeariaOption[] }> => {
      if (!tenantId) return { tenantNome: null, unidades: [] };
      const [tenantRes, unidadesRes] = await Promise.all([
        supabase.from('tenants').select('nome').eq('id', tenantId).maybeSingle(),
        supabase.from('tenant_unidades').select('id, nome').eq('tenant_id', tenantId).eq('ativo', true).order('nome'),
      ]);
      return {
        tenantNome: (tenantRes.data as { nome?: string } | null)?.nome ?? null,
        unidades: (unidadesRes.data || []).map(u => ({ id: u.id, nome: u.nome, source: 'unidade' as const })),
      };
    },
    enabled: !!tenantId,
    staleTime: STALE_TIMES.HORARIOS,
  });

  /** Lista combinada: tenant + unidades */
  const barbearias: BarbeariaOption[] = useMemo(() => {
    const list: BarbeariaOption[] = [];
    if (tenantId && scopeOptions?.tenantNome) {
      list.push({ id: tenantId, nome: scopeOptions.tenantNome, source: 'tenant' });
    }
    (scopeOptions?.unidades || []).forEach(u => {
      if (u.id !== tenantId) list.push(u);
    });
    return list;
  }, [tenantId, scopeOptions]);

  /** Busca períodos de férias (próprios) */
  const { data: vacationRaw = [], isLoading: loading } = useQuery({
    queryKey: [...QUERY_KEYS.barbeiro.horariosExcepcionais(barbeiroId), 'ferias'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('horarios_excepcionais_barbeiro')
        .select('id, data, aberto, created_at')
        .eq('barbeiro_id', barbeiroId)
        .eq('aberto', false)
        .ilike('motivo', '%férias%')
        .order('data', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    staleTime: STALE_TIMES.HORARIOS,
    enabled: !!barbeiroId,
  });

  const vacationPeriods = useMemo(() => groupIntoPeriods(vacationRaw), [vacationRaw]);

  const saveVacationMutation = useSaveVacation();
  const saveVacationForUnitsMutation = useSaveVacationForUnits();
  const removeVacationMutation = useRemoveVacation();
  const removeAllVacationsMutation = useRemoveAllVacations();

  /** Abre o drawer de escopo */
  const handleActivateClick = () => {
    if (!dateRange?.from || !dateRange?.to) {
      toast.error('Selecione o período de férias no calendário');
      return;
    }
    setSelectedUnits([]);
    setDrawerMode('scope');
    setDrawerOpen(true);
  };

  /** Salva férias só pra mim */
  const handleSaveForMe = () => {
    if (!dateRange?.from || !dateRange?.to) return;
    const days = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
    const periodLabel = formatPeriod(format(dateRange.from, 'yyyy-MM-dd'), format(dateRange.to, 'yyyy-MM-dd'));

    saveVacationMutation.mutate(
      { barbeiroId, days },
      {
        onSuccess: () => {
          setSavedPeriodLabel(periodLabel);
          setDateRange(undefined);
          setDrawerOpen(false);
          setNotifyDialogOpen(true);
        },
      }
    );
  };

  /** Salva férias para as unidades selecionadas (afeta todos os barbeiros) */
  const handleSaveForUnits = () => {
    if (!dateRange?.from || !dateRange?.to) return;
    if (!tenantId) { toast.error('Não foi possível identificar a barbearia'); return; }
    if (selectedUnits.length === 0) { toast.error('Selecione pelo menos uma barbearia'); return; }

    const days = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
    const periodLabel = formatPeriod(format(dateRange.from, 'yyyy-MM-dd'), format(dateRange.to, 'yyyy-MM-dd'));
    const isTenantWide = selectedUnits.includes(tenantId);
    const unidadeIds = selectedUnits.filter(id => id !== tenantId);

    saveVacationForUnitsMutation.mutate(
      { unidadeIds, tenantId, isTenantWide, days },
      {
        onSuccess: () => {
          setSavedPeriodLabel(periodLabel);
          setDateRange(undefined);
          setSelectedUnits([]);
          setDrawerOpen(false);
          setNotifyDialogOpen(true);
        },
      }
    );
  };

  const toggleUnit = (id: string) => {
    setSelectedUnits(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  };

  const handleSendVacationNotification = async () => {
    setSendingNotification(true);
    try {
      const { data: config, error: configError } = await supabase
        .from('webhook_config')
        .select('disparo_webhook_url, disparo_ativo')
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (configError || !config?.disparo_webhook_url || !config?.disparo_ativo) {
        toast.error('Webhook de disparo não configurado.');
        setSendingNotification(false);
        return;
      }
      const { data: clients, error: clientsError } = await supabase
        .from('profiles')
        .select('id, nome, telefone')
        .not('telefone', 'is', null)
        .neq('telefone', '');
      if (clientsError || !clients || clients.length === 0) {
        toast.error('Nenhum cliente com telefone encontrado');
        setSendingNotification(false);
        return;
      }
      const formatPhone = (phone: string): string => {
        let cleaned = phone.replace(/\D/g, '');
        if (!cleaned.startsWith('55')) cleaned = '55' + cleaned;
        return `${cleaned}@s.whatsapp.net`;
      };
      const nome = barberName || 'seu barbeiro';
      const mensagem = `Olá {nome}! Informamos que ${nome} estará de férias no período de ${savedPeriodLabel}. Durante esse período, não será possível agendar com este profissional. Agradecemos a compreensão!`;
      const contatos = clients.filter(c => c.telefone).map(client => ({
        cliente_id: client.id,
        cliente_nome: client.nome || 'Cliente',
        cliente_telefone: client.telefone,
        cliente_telefone_whatsapp: formatPhone(client.telefone!),
        mensagem: mensagem.replace('{nome}', client.nome || 'Cliente')
      }));
      if (contatos.length === 0) { toast.error('Nenhum cliente válido encontrado'); setSendingNotification(false); return; }
      const whatsappInstance = await getWhatsAppInstance(barbeiroId);

      const response = await fetch(config.disparo_webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evento: 'disparo_mensagem_lote', tipo: 'aviso_ferias_barbeiro', barbeiro_id: barbeiroId, barbeiro_nome: barberName, total_contatos: contatos.length, contatos, timestamp: new Date().toISOString(), whatsapp_instance: whatsappInstance }),
      });
      if (response.ok) { toast.success(`Aviso enviado para ${contatos.length} cliente(s)`); } else { toast.error('Erro ao enviar notificações.'); }
      await supabase.from('system_logs').insert({ level: 'info', category: 'disparo', message: `Aviso de férias (barbeiro ${barberName}) enviado para ${contatos.length} clientes`, details: { tipo: 'aviso_ferias_barbeiro', barbeiro_id: barbeiroId, periodo: savedPeriodLabel, total: contatos.length } });
      setNotifyDialogOpen(false);
    } catch (error) {
      console.error('Erro ao enviar notificações:', error);
      toast.error('Erro ao enviar notificações');
    } finally {
      setSendingNotification(false);
    }
  };

  const handleRemoveVacation = (startDate: string, endDate: string) => {
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    const days = eachDayOfInterval({ start, end });
    removeVacationMutation.mutate({ barbeiroId, days });
  };

  const handleRemoveAllVacations = () => {
    if (!confirm('Tem certeza que deseja remover TODOS os períodos de férias?')) return;
    removeAllVacationsMutation.mutate({ barbeiroId });
  };

  const saving =
    saveVacationMutation.isPending ||
    saveVacationForUnitsMutation.isPending ||
    removeVacationMutation.isPending ||
    removeAllVacationsMutation.isPending;

  const vacationDays = vacationPeriods.flatMap(period => {
    const start = parseISO(period.startDate);
    const end = parseISO(period.endDate);
    return eachDayOfInterval({ start, end });
  });

  const formatPeriod = (startDate: string, endDate: string) => {
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    const days = eachDayOfInterval({ start, end }).length;
    if (startDate === endDate) return `${format(start, "dd 'de' MMMM", { locale: ptBR })} (1 dia)`;
    return `${format(start, "dd/MM")} até ${format(end, "dd/MM/yyyy")} (${days} dias)`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-200px)]">
      <div className="flex flex-1 flex-col gap-5 px-1 pb-28">
        {/* Períodos Ativos */}
        {vacationPeriods.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-widest">Ativos</p>
              <button
                onClick={handleRemoveAllVacations}
                disabled={saving}
                className="text-[10px] text-muted-foreground/40 hover:text-destructive transition-colors"
              >
                Limpar
              </button>
            </div>

            <div className="divide-y divide-border/20">
              {vacationPeriods.map((period) => {
                const start = parseISO(period.startDate);
                const end = parseISO(period.endDate);
                const totalDays = eachDayOfInterval({ start, end }).length;
                const isActive = new Date() >= start && new Date() <= end;

                return (
                  <div
                    key={period.id}
                    className="group flex items-center justify-between py-3"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-medium text-foreground">
                        {format(start, "dd/MM")} — {format(end, "dd/MM/yy")}
                      </span>
                      <span className="text-[10px] text-muted-foreground/40">{totalDays}d</span>
                      {isActive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      )}
                    </div>
                    <button
                      onClick={() => handleRemoveVacation(period.startDate, period.endDate)}
                      disabled={saving}
                      className="text-[10px] text-muted-foreground/0 group-hover:text-muted-foreground hover:text-destructive transition-all"
                    >
                      Remover
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Seleção de Período */}
        <div
          className={cn(
            'flex w-full flex-col items-center space-y-3',
            vacationPeriods.length > 0 ? 'pt-6 md:pt-8' : 'mt-auto justify-end pb-10'
          )}
        >
          <p className="w-full max-w-sm text-[11px] font-medium text-muted-foreground/60 uppercase tracking-widest">
            {vacationPeriods.length > 0 ? 'Novo período' : 'Selecione o período'}
          </p>
          <Calendar
            mode="range"
            selected={dateRange}
            onSelect={setDateRange}
            numberOfMonths={1}
            locale={ptBR}
            disabled={(date) => date < new Date()}
            modifiers={{ vacation: vacationDays }}
            modifiersStyles={{
                vacation: {
                  backgroundColor: 'hsl(var(--destructive) / 0.15)',
                  color: 'hsl(var(--destructive))',
                  fontWeight: '600'
                }
              }}
            className={cn("w-full max-w-sm rounded-xl border border-border/40 bg-background/50 p-4 pointer-events-auto")}
            classNames={{
              months: "flex flex-col w-full",
              month: "space-y-4 w-full",
                caption: "flex justify-center pt-1 relative items-center",
                caption_label: "text-sm font-medium",
                table: "w-full border-collapse",
                head_row: "flex w-full",
                head_cell: "text-muted-foreground rounded-md flex-1 font-normal text-[0.8rem] text-center",
                row: "flex w-full mt-1",
                cell: "flex-1 aspect-square text-center text-sm p-0.5 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                day: "h-full w-full rounded-md font-normal aria-selected:opacity-100 hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center transition-colors",
                day_range_end: "day-range-end",
                day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                day_today: "bg-accent text-accent-foreground",
                day_outside: "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
                day_disabled: "text-muted-foreground opacity-50",
                day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
                day_hidden: "invisible",
            }}
          />

          {/* Preview do período selecionado */}
          {dateRange?.from && (
            <div className="flex w-full max-w-sm items-center justify-between rounded-xl border border-border/20 bg-muted/5 px-4 py-3">
              <p className="text-sm font-medium text-foreground">
                {dateRange.from && dateRange.to 
                  ? formatPeriod(format(dateRange.from, 'yyyy-MM-dd'), format(dateRange.to, 'yyyy-MM-dd'))
                  : format(dateRange.from, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                }
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Botão fixo no fundo */}
      <div className="fixed bottom-0 left-0 right-0 p-4 pb-6 bg-gradient-to-t from-background via-background to-transparent z-10">
        <Button
          onClick={handleActivateClick}
          disabled={saving || !dateRange?.from || !dateRange?.to}
          className="w-full h-[48px] rounded-xl bg-foreground hover:bg-foreground/90 text-background font-semibold text-sm shadow-sm transition-colors"
        >
          {saving ? (<><Loader2 className="h-4 w-4 animate-spin mr-2" />Salvando...</>) : 'Ativar Férias'}
        </Button>
      </div>

      {/* ═══ Drawer de Escopo (Só pra mim / Para as unidades) ═══ */}
      <VacationScopeDrawer
        open={drawerOpen}
        mode={drawerMode}
        onClose={() => { setDrawerOpen(false); setDrawerMode('scope'); }}
        onSaveForMe={handleSaveForMe}
        onGoToUnits={() => setDrawerMode('units')}
        onBackToScope={() => setDrawerMode('scope')}
        barbearias={barbearias}
        selectedUnits={selectedUnits}
        toggleUnit={toggleUnit}
        onSaveForUnits={handleSaveForUnits}
        isSaving={saving}
        periodLabel={dateRange?.from && dateRange?.to ? formatPeriod(format(dateRange.from, 'yyyy-MM-dd'), format(dateRange.to, 'yyyy-MM-dd')) : ''}
      />

      {/* Dialog de Notificação */}
      <Dialog open={notifyDialogOpen} onOpenChange={setNotifyDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-medium">Notificar clientes?</DialogTitle>
            <DialogDescription className="text-xs font-extralight">
              Férias ativadas para o período de {savedPeriodLabel}
            </DialogDescription>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <p className="text-sm text-muted-foreground font-extralight leading-relaxed">
              Deseja enviar uma mensagem automática para todos os clientes avisando sobre seu período de férias?
            </p>
            <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
              <p className="text-[11px] text-muted-foreground/60 mb-1.5 uppercase tracking-wider font-medium">Prévia</p>
              <p className="text-xs text-foreground/70 leading-relaxed italic font-extralight">
                "Olá [nome]! Informamos que {barberName || 'seu barbeiro'} estará de férias no período de {savedPeriodLabel}. Durante esse período, não será possível agendar com este profissional. Agradecemos a compreensão!"
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setNotifyDialogOpen(false)} className="flex-1" disabled={sendingNotification}>
              Não, obrigado
            </Button>
            <Button size="sm" onClick={handleSendVacationNotification} disabled={sendingNotification} className="flex-1">
              {sendingNotification ? (<><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Enviando...</>) : 'Sim, notificar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// COMPONENTE: Drawer de Escopo (Só pra mim / Unidades)
// ═══════════════════════════════════════════════════════════

interface VacationScopeDrawerProps {
  open: boolean;
  mode: 'scope' | 'units';
  onClose: () => void;
  onSaveForMe: () => void;
  onGoToUnits: () => void;
  onBackToScope: () => void;
  barbearias: BarbeariaOption[];
  selectedUnits: string[];
  toggleUnit: (id: string) => void;
  onSaveForUnits: () => void;
  isSaving: boolean;
  periodLabel: string;
}

function VacationScopeDrawer({
  open, mode, onClose, onSaveForMe, onGoToUnits, onBackToScope,
  barbearias, selectedUnits, toggleUnit, onSaveForUnits, isSaving, periodLabel,
}: VacationScopeDrawerProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-background/60 backdrop-blur-sm z-50"
          />

          <motion.div
            key="drawer"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 350, damping: 35 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl border-t border-border/30 shadow-2xl max-h-[85vh] flex flex-col"
          >
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
            </div>

            <AnimatePresence mode="wait">
              {mode === 'scope' ? (
                <motion.div
                  key="scope-view"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.15 }}
                  className="px-5 pb-6 space-y-4 overflow-y-auto"
                >
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold text-foreground">Aplicar férias</h3>
                    <p className="text-[11px] text-muted-foreground/50 font-extralight">
                      Escolha se as férias valem só pra você ou para as barbearias.
                    </p>
                  </div>

                  {periodLabel && (
                    <div className="rounded-xl border border-border/20 bg-muted/5 p-3">
                      <p className="text-sm font-medium text-foreground">{periodLabel}</p>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={onSaveForMe}
                    disabled={isSaving}
                    className="flex items-center gap-3.5 w-full rounded-xl border border-border/30 bg-muted/5 p-4 text-left hover:border-foreground/20 hover:bg-muted/10 transition-all"
                  >
                    <div className="w-9 h-9 rounded-full bg-muted/30 border border-border/30 flex items-center justify-center shrink-0">
                      <UserRound className="w-4 h-4 text-foreground/70" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-foreground block">Só pra mim</span>
                      <p className="text-[11px] text-muted-foreground/50 font-extralight">
                        Aplicar apenas na minha agenda pessoal
                      </p>
                    </div>
                    {isSaving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />}
                  </button>

                  <button
                    type="button"
                    onClick={onGoToUnits}
                    disabled={isSaving || barbearias.length === 0}
                    className="flex items-center gap-3.5 w-full rounded-xl border border-border/30 bg-muted/5 p-4 text-left hover:border-foreground/20 hover:bg-muted/10 transition-all disabled:opacity-50"
                  >
                    <div className="w-9 h-9 rounded-full bg-muted/30 border border-border/30 flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4 text-foreground/70" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-foreground block">Para as barbearias</span>
                      <p className="text-[11px] text-muted-foreground/50 font-extralight">
                        Coloca todos os barbeiros das unidades em férias
                      </p>
                    </div>
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="units-view"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.15 }}
                  className="px-5 pb-6 space-y-4 overflow-y-auto flex-1"
                >
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={onBackToScope}
                      className="w-8 h-8 rounded-full border border-border/40 bg-muted/10 flex items-center justify-center hover:bg-muted/30 active:scale-95 transition-all"
                      aria-label="Voltar"
                    >
                      <ChevronLeft className="w-4 h-4 text-foreground" />
                    </button>
                    <h3 className="text-base font-semibold text-foreground">Selecionar barbearia</h3>
                  </div>

                  <div className="rounded-xl border border-border/30 bg-muted/5 divide-y divide-border/20 overflow-hidden">
                    {barbearias.map(b => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => toggleUnit(b.id)}
                        className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-muted/10 transition-colors"
                      >
                        <Checkbox
                          checked={selectedUnits.includes(b.id)}
                          className="data-[state=checked]:bg-foreground data-[state=checked]:border-foreground"
                        />
                        <span className="text-sm font-medium text-foreground block truncate">{b.nome}</span>
                      </button>
                    ))}

                    {barbearias.length === 0 && (
                      <div className="px-4 py-6 text-center">
                        <p className="text-sm text-muted-foreground/50">Nenhuma barbearia encontrada</p>
                      </div>
                    )}
                  </div>

                  <Button
                    onClick={onSaveForUnits}
                    disabled={isSaving || selectedUnits.length === 0}
                    className="w-full h-[48px] rounded-xl bg-foreground hover:bg-foreground/90 text-background font-semibold text-sm shadow-sm transition-colors"
                  >
                    {isSaving ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" />Aplicando...</>
                    ) : (
                      'Aplicar férias'
                    )}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
