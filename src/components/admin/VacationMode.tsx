import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { format, eachDayOfInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { getWhatsAppInstance } from '@/lib/whatsappInstanceHelper';
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

export default function VacationMode() {
  const [isVacationMode, setIsVacationMode] = useState(false);
  const [vacationPeriods, setVacationPeriods] = useState<VacationPeriod[]>([]);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notifyDialogOpen, setNotifyDialogOpen] = useState(false);
  const [savedPeriodLabel, setSavedPeriodLabel] = useState('');
  const [sendingNotification, setSendingNotification] = useState(false);

  useEffect(() => {
    loadVacationPeriods();
  }, []);

  const loadVacationPeriods = async () => {
    try {
      const { data, error } = await supabase
        .from('horarios_excepcionais')
        .select('id, data, aberto, motivo, created_at')
        .eq('aberto', false)
        .ilike('motivo', '%férias%')
        .order('data', { ascending: true });

      if (error) throw error;

      const periods: VacationPeriod[] = [];
      let currentPeriod: { start: string; end: string; id: string; createdAt: string } | null = null;

      (data || []).forEach((item, index) => {
        const itemDate = item.data;
        
        if (!currentPeriod) {
          currentPeriod = { 
            start: itemDate, 
            end: itemDate, 
            id: item.id,
            createdAt: item.created_at || new Date().toISOString()
          };
        } else {
          const prevDate = new Date(currentPeriod.end + 'T12:00:00');
          const currDate = new Date(itemDate + 'T12:00:00');
          const diffDays = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (diffDays === 1) {
            currentPeriod.end = itemDate;
          } else {
            periods.push({
              id: currentPeriod.id,
              startDate: currentPeriod.start,
              endDate: currentPeriod.end,
              createdAt: currentPeriod.createdAt
            });
            currentPeriod = { 
              start: itemDate, 
              end: itemDate, 
              id: item.id,
              createdAt: item.created_at || new Date().toISOString()
            };
          }
        }
        
        if (index === (data || []).length - 1 && currentPeriod) {
          periods.push({
            id: currentPeriod.id,
            startDate: currentPeriod.start,
            endDate: currentPeriod.end,
            createdAt: currentPeriod.createdAt
          });
        }
      });

      setVacationPeriods(periods);
      setIsVacationMode(periods.length > 0);
    } catch (error) {
      console.error('Erro ao carregar períodos de férias:', error);
      toast.error('Erro ao carregar configurações de férias');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveVacation = async () => {
    if (!dateRange?.from || !dateRange?.to) {
      toast.error('Selecione o período de férias no calendário');
      return;
    }

    setSaving(true);
    try {
      const days = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
      
      for (const day of days) {
        const dateStr = format(day, 'yyyy-MM-dd');
        
        const { data: existing } = await supabase
          .from('horarios_excepcionais')
          .select('id')
          .eq('data', dateStr)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('horarios_excepcionais')
            .update({
              aberto: false,
              motivo: 'Férias',
              hora_abertura: null,
              hora_fechamento: null,
              hora_almoco_inicio: null,
              hora_almoco_fim: null
            })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('horarios_excepcionais')
            .insert({
              data: dateStr,
              aberto: false,
              motivo: 'Férias',
              hora_abertura: null,
              hora_fechamento: null,
              hora_almoco_inicio: null,
              hora_almoco_fim: null
            } as never);
        }
      }

      toast.success(`Férias configuradas! ${days.length} dias bloqueados para agendamento.`);
      
      const periodLabel = formatPeriod(
        format(dateRange.from, 'yyyy-MM-dd'),
        format(dateRange.to, 'yyyy-MM-dd')
      );
      setSavedPeriodLabel(periodLabel);
      
      setDateRange(undefined);
      setIsVacationMode(true);
      await loadVacationPeriods();
      
      setNotifyDialogOpen(true);
    } catch (error) {
      console.error('Erro ao salvar férias:', error);
      toast.error('Erro ao configurar férias');
    } finally {
      setSaving(false);
    }
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
        toast.error('Webhook de disparo não configurado. Configure em TI > Webhooks');
        setSendingNotification(false);
        return;
      }

      const { data: clients, error: clientsError } = await supabase
        .from('profiles')
        .select('id, nome, telefone')
        .not('telefone', 'is', null)
        .neq('telefone', '');

      if (clientsError || !clients || clients.length === 0) {
        toast.error('Nenhum cliente com telefone cadastrado encontrado');
        setSendingNotification(false);
        return;
      }

      const formatPhone = (phone: string): string => {
        let cleaned = phone.replace(/\\D/g, '');
        if (!cleaned.startsWith('55')) cleaned = '55' + cleaned;
        return `${cleaned}@s.whatsapp.net`;
      };

      const mensagem = `Olá {nome}! Informamos que estaremos de férias no período de ${savedPeriodLabel}. Durante esse período, não será possível realizar agendamentos. Agradecemos a compreensão!`;

      const contatos = clients
        .filter(c => c.telefone)
        .map(client => ({
          cliente_id: client.id,
          cliente_nome: client.nome || 'Cliente',
          cliente_telefone: client.telefone,
          cliente_telefone_whatsapp: formatPhone(client.telefone!),
          mensagem: mensagem.replace('{nome}', client.nome || 'Cliente')
        }));

      if (contatos.length === 0) {
        toast.error('Nenhum cliente válido encontrado');
        setSendingNotification(false);
        return;
      }

      // Buscar instância WhatsApp conectada
      const whatsappInstance = await getWhatsAppInstance();

      const response = await fetch(config.disparo_webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evento: 'disparo_mensagem_lote',
          tipo: 'aviso_ferias',
          total_contatos: contatos.length,
          contatos,
          timestamp: new Date().toISOString(),
          whatsapp_instance: whatsappInstance,
        }),
      });

      if (response.ok) {
        toast.success(`Aviso de férias enviado para ${contatos.length} cliente(s)`);
      } else {
        toast.error('Erro ao enviar notificações. Verifique o webhook.');
      }

      await supabase.from('system_logs').insert({
        level: 'info',
        category: 'disparo',
        message: `Aviso de férias enviado para ${contatos.length} clientes`,
        details: {
          tipo: 'aviso_ferias',
          periodo: savedPeriodLabel,
          total: contatos.length,
        }
      });

      setNotifyDialogOpen(false);
    } catch (error) {
      console.error('Erro ao enviar notificações:', error);
      toast.error('Erro ao enviar notificações');
    } finally {
      setSendingNotification(false);
    }
  };

  const handleRemoveVacation = async (startDate: string, endDate: string) => {
    setSaving(true);
    try {
      const start = parseISO(startDate);
      const end = parseISO(endDate);
      const days = eachDayOfInterval({ start, end });

      for (const day of days) {
        const dateStr = format(day, 'yyyy-MM-dd');
        await supabase
          .from('horarios_excepcionais')
          .delete()
          .eq('data', dateStr)
          .ilike('motivo', '%férias%');
      }

      toast.success('Período de férias removido');
      await loadVacationPeriods();
    } catch (error) {
      console.error('Erro ao remover férias:', error);
      toast.error('Erro ao remover período de férias');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAllVacations = async () => {
    if (!confirm('Tem certeza que deseja remover TODOS os períodos de férias?')) return;
    
    setSaving(true);
    try {
      await supabase
        .from('horarios_excepcionais')
        .delete()
        .ilike('motivo', '%férias%');

      toast.success('Todos os períodos de férias foram removidos');
      setIsVacationMode(false);
      setVacationPeriods([]);
    } catch (error) {
      console.error('Erro ao remover férias:', error);
      toast.error('Erro ao remover períodos de férias');
    } finally {
      setSaving(false);
    }
  };

  const vacationDays = vacationPeriods.flatMap(period => {
    const start = parseISO(period.startDate);
    const end = parseISO(period.endDate);
    return eachDayOfInterval({ start, end });
  });

  const formatPeriod = (startDate: string, endDate: string) => {
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    const days = eachDayOfInterval({ start, end }).length;
    
    if (startDate === endDate) {
      return `${format(start, "dd 'de' MMMM", { locale: ptBR })} (1 dia)`;
    }
    
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
            <div className="rounded-xl border border-border/20 bg-muted/5 px-4 py-3 flex items-center justify-between">
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
          onClick={handleSaveVacation}
          disabled={saving || !dateRange?.from || !dateRange?.to}
          className="w-full h-[48px] rounded-xl bg-foreground hover:bg-foreground/90 text-background font-semibold text-sm shadow-sm transition-colors"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Salvando...
            </>
          ) : (
            'Ativar Férias'
          )}
        </Button>
      </div>

      {/* Dialog de Notificação */}
      <Dialog open={notifyDialogOpen} onOpenChange={setNotifyDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-medium">
              Notificar clientes?
            </DialogTitle>
            <DialogDescription className="text-xs font-extralight">
              Férias ativadas para o período de {savedPeriodLabel}
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-3">
            <p className="text-sm text-muted-foreground font-extralight leading-relaxed">
              Deseja enviar uma mensagem automática para todos os seus clientes avisando sobre o período de férias?
            </p>
            <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
              <p className="text-[11px] text-muted-foreground/60 mb-1.5 uppercase tracking-wider font-medium">Prévia</p>
              <p className="text-xs text-foreground/70 leading-relaxed italic font-extralight">
                "Olá [nome]! Informamos que estaremos de férias no período de {savedPeriodLabel}. Durante esse período, não será possível realizar agendamentos. Agradecemos a compreensão!"
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNotifyDialogOpen(false)}
              className="flex-1"
              disabled={sendingNotification}
            >
              Não, obrigado
            </Button>
            <Button
              size="sm"
              onClick={handleSendVacationNotification}
              disabled={sendingNotification}
              className="flex-1"
            >
              {sendingNotification ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Enviando...
                </>
              ) : (
                'Sim, notificar'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
