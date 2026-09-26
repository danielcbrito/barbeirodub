import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { NumericDateInput } from '@/components/shared/NumericDateInput';
import { NumericTimeInput } from '@/components/shared/NumericTimeInput';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { format, parseISO, isBefore, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Textarea } from '@/components/ui/textarea';
import { AnimatePresence, motion } from 'framer-motion';
import { useBarberHorariosExcepcionais } from '@/hooks/useBarberHorariosExcepcionais';
import { useAddExcecaoHorario, useDeleteExcecaoHorario } from '@/hooks/useHorariosMutations';

interface NovaExcecao {
  data: string;
  aberto: boolean;
  hora_abertura: string;
  hora_fechamento: string;
  hora_almoco_inicio: string;
  hora_almoco_fim: string;
  motivo: string;
}

interface BarberHorariosExcepcionaisProps {
  barbeiroId: string;
}

/** SVG seta curvada padrão */
function CurvedBackArrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a4 4 0 0 1 4 4v1" />
    </svg>
  );
}

export default function BarberHorariosExcepcionais({ barbeiroId }: BarberHorariosExcepcionaisProps) {
  const { data: excecoes = [], isLoading: loading } = useBarberHorariosExcepcionais(barbeiroId);
  const addMutation = useAddExcecaoHorario();
  const deleteMutation = useDeleteExcecaoHorario();

  const [showNewScreen, setShowNewScreen] = useState(false);
  const [novaExcecao, setNovaExcecao] = useState<NovaExcecao>({
    data: '', aberto: true, hora_abertura: '09:00', hora_fechamento: '20:00',
    hora_almoco_inicio: '13:00', hora_almoco_fim: '14:00', motivo: ''
  });

  const saving = addMutation.isPending;

  const handleAddExcecao = () => {
    if (!novaExcecao.data) { toast.error('Selecione uma data'); return; }
    const dataExcecao = parseISO(novaExcecao.data);
    if (isBefore(dataExcecao, startOfDay(new Date()))) { toast.error('A data deve ser hoje ou no futuro'); return; }

    addMutation.mutate(
      {
        barbeiroId,
        data: novaExcecao.data,
        aberto: novaExcecao.aberto,
        hora_abertura: novaExcecao.aberto ? novaExcecao.hora_abertura : null,
        hora_fechamento: novaExcecao.aberto ? novaExcecao.hora_fechamento : null,
        hora_almoco_inicio: novaExcecao.aberto && novaExcecao.hora_almoco_inicio ? novaExcecao.hora_almoco_inicio : null,
        hora_almoco_fim: novaExcecao.aberto && novaExcecao.hora_almoco_fim ? novaExcecao.hora_almoco_fim : null,
        motivo: novaExcecao.motivo || null,
      },
      {
        onSuccess: () => {
          setShowNewScreen(false);
          resetForm();
        },
      }
    );
  };

  const handleDeleteExcecao = (id: string) => {
    deleteMutation.mutate({ excecaoId: id, barbeiroId });
  };

  const resetForm = () => {
    setNovaExcecao({ data: '', aberto: true, hora_abertura: '09:00', hora_fechamento: '20:00', hora_almoco_inicio: '13:00', hora_almoco_fim: '14:00', motivo: '' });
  };

  const formatDateShort = (dateStr: string) => {
    try { return format(parseISO(dateStr), "dd 'de' MMM, yyyy", { locale: ptBR }); } catch { return dateStr; }
  };

  const isDatePast = (dateStr: string) => {
    try { return isBefore(parseISO(dateStr), startOfDay(new Date())); } catch { return false; }
  };

  const excecoesFuturas = excecoes.filter(e => !isDatePast(e.data));
  const excecoesPassadas = excecoes.filter(e => isDatePast(e.data));

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  /* ── Tela de Nova Exceção (full-screen sub-page) ── */
  if (showNewScreen) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="new-exception"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col min-h-[calc(100vh-200px)]"
        >
          <div className="flex-1 space-y-6 pb-24">
            <p className="text-xs font-extralight text-muted-foreground">
              Escolha a data, defina se estará disponível ou não e ajuste os horários.
            </p>

            {/* Data */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest">Data</p>
              <NumericDateInput
                value={novaExcecao.data}
                min={format(new Date(), 'yyyy-MM-dd')}
                onChange={(iso) => setNovaExcecao(prev => ({ ...prev, data: iso }))}
              />
            </div>

            {/* Toggle aberto/fechado */}
            <div className="rounded-xl border border-border/30 bg-muted/5 p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-foreground">
                    {novaExcecao.aberto ? 'Disponível com horário especial' : 'Indisponível o dia inteiro'}
                  </p>
                  <p className="text-[11px] text-muted-foreground/50 font-extralight">
                    {novaExcecao.aberto
                      ? 'Você atenderá, mas com horário diferente do habitual'
                      : 'Nenhum agendamento será aceito neste dia'
                    }
                  </p>
                </div>
                <Switch
                  checked={novaExcecao.aberto}
                  onCheckedChange={(checked) => setNovaExcecao(prev => ({ ...prev, aberto: checked }))}
                  className="scale-[0.85] data-[state=checked]:bg-emerald-500"
                />
              </div>
            </div>

            {/* Horários (se aberto) */}
            {novaExcecao.aberto && (
              <div className="space-y-5">
                <div className="border-t border-border/20" />

                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest mb-3">Horário de atendimento</p>
                    <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-muted-foreground/60 font-extralight">Abertura</p>
                      <NumericTimeInput value={novaExcecao.hora_abertura} onChange={(v) => setNovaExcecao(prev => ({ ...prev, hora_abertura: v }))} />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-muted-foreground/60 font-extralight">Fechamento</p>
                      <NumericTimeInput value={novaExcecao.hora_fechamento} onChange={(v) => setNovaExcecao(prev => ({ ...prev, hora_fechamento: v }))} />
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest mb-3">Intervalo / Almoço</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-muted-foreground/60 font-extralight">Início</p>
                      <NumericTimeInput value={novaExcecao.hora_almoco_inicio} onChange={(v) => setNovaExcecao(prev => ({ ...prev, hora_almoco_inicio: v }))} />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-muted-foreground/60 font-extralight">Fim</p>
                      <NumericTimeInput value={novaExcecao.hora_almoco_fim} onChange={(v) => setNovaExcecao(prev => ({ ...prev, hora_almoco_fim: v }))} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Motivo */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest">Motivo (opcional)</p>
              <Textarea
                placeholder="Ex: Consulta médica, compromisso pessoal..."
                value={novaExcecao.motivo}
                onChange={(e) => setNovaExcecao(prev => ({ ...prev, motivo: e.target.value }))}
                rows={2}
                className="text-sm resize-none rounded-xl"
              />
            </div>
          </div>

          {/* Botão fixo no fundo */}
          <div className="sticky bottom-0 left-0 right-0 p-4 pb-6 bg-background border-t border-border/20">
            <Button
              onClick={handleAddExcecao}
              disabled={saving || !novaExcecao.data}
              className="w-full h-[48px] rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm shadow-sm transition-colors"
            >
              {saving ? (<><Loader2 className="h-4 w-4 animate-spin mr-2" />Salvando...</>) : 'Salvar Exceção'}
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  /* ── Lista principal ── */
  return (
    <div className="space-y-6 px-1">
      <p className="text-xs font-extralight text-muted-foreground">
        Altere horários ou fique indisponível em dias específicos.
      </p>

      <div className="border-t border-border/20" />

      {/* Botão de adicionar */}
      <button
        onClick={() => setShowNewScreen(true)}
        className="w-full py-3.5 rounded-xl border border-dashed border-border/40 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-border/60 transition-colors"
      >
        + Nova exceção
      </button>

      {/* Lista de Exceções Futuras */}
      {excecoesFuturas.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest">
            Próximas ({excecoesFuturas.length})
          </p>
          <div className="divide-y divide-border/40">
            {excecoesFuturas.map((excecao) => (
              <div key={excecao.id} className="group py-3.5 flex items-center justify-between">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground capitalize">
                      {formatDateShort(excecao.data)}
                    </span>
                    {excecao.aberto ? (
                      <span className="text-[9px] font-medium uppercase tracking-wider text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
                        Horário especial
                      </span>
                    ) : (
                      <span className="text-[9px] font-medium uppercase tracking-wider text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
                        Indisponível
                      </span>
                    )}
                    {excecao.origem !== 'barbeiro' && excecao.origem_label && (
                      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded">
                        {excecao.origem_label}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground/50 font-extralight">
                    {excecao.aberto ? (
                      <>
                        {excecao.hora_abertura?.slice(0, 5)} — {excecao.hora_fechamento?.slice(0, 5)}
                        {excecao.hora_almoco_inicio && excecao.hora_almoco_fim && (
                          <span className="ml-2">· Intervalo {excecao.hora_almoco_inicio?.slice(0, 5)} — {excecao.hora_almoco_fim?.slice(0, 5)}</span>
                        )}
                      </>
                    ) : (
                      'Nenhum agendamento neste dia'
                    )}
                    {excecao.motivo && <span className="ml-2">· {excecao.motivo}</span>}
                  </p>
                </div>
                {excecao.can_delete ? (
                  <button
                    onClick={() => handleDeleteExcecao(excecao.id)}
                    className="text-[11px] text-muted-foreground/30 group-hover:text-muted-foreground hover:text-destructive transition-all flex-shrink-0 ml-4"
                  >
                    Remover
                  </button>
                ) : (
                  <span className="text-[10px] text-muted-foreground/30 flex-shrink-0 ml-4 italic">
                    aplicada pela barbearia
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Exceções Passadas */}
      {excecoesPassadas.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] font-medium text-muted-foreground/40 uppercase tracking-widest">
            Passadas ({excecoesPassadas.length})
          </p>
          <div className="divide-y divide-border/20 opacity-40">
            {excecoesPassadas.slice(0, 5).map((excecao) => (
              <div key={excecao.id} className="group flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground capitalize">{formatDateShort(excecao.data)}</span>
                  {!excecao.aberto && <span className="text-[10px] text-muted-foreground/50 font-extralight">Indisponível</span>}
                </div>
                <button
                  onClick={() => handleDeleteExcecao(excecao.id)}
                  className="text-[10px] text-muted-foreground/0 group-hover:text-muted-foreground hover:text-destructive transition-all"
                >
                  Remover
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}