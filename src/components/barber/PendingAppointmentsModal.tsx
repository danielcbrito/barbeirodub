import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Check, Clock, AlertCircle, UserX, Loader2, Scissors, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { OverdueAppointment } from "@/hooks/useOverdueAppointments";
import { isWhatsAppAppointment } from "@/lib/walkInName";
import { WhatsAppBadge } from "@/components/shared/WhatsAppBadge";

interface PendingAppointmentsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointments: OverdueAppointment[];
  onCompleteBulk: (selectedIds: string[], noShowIds: string[]) => Promise<void>;
  isCompleting?: boolean;
}

export function PendingAppointmentsModal({
  open,
  onOpenChange,
  appointments,
  onCompleteBulk,
  isCompleting = false,
}: PendingAppointmentsModalProps) {
  // Lista de IDs selecionados para confirmar (por padrão, todos)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Lista de IDs marcados como falta ("Não veio")
  const [noShowIds, setNoShowIds] = useState<string[]>([]);

  // Sincroniza sempre que a lista de agendamentos mudar
  useEffect(() => {
    if (appointments.length > 0) {
      setSelectedIds(appointments.map((a) => a.id));
      setNoShowIds([]);
    }
  }, [appointments]);

  const handleToggleSelect = (id: string) => {
    if (noShowIds.includes(id)) {
      // Se estava como falta, remove de falta e adiciona aos selecionados
      setNoShowIds((prev) => prev.filter((i) => i !== id));
      setSelectedIds((prev) => [...prev, id]);
      return;
    }

    if (selectedIds.includes(id)) {
      setSelectedIds((prev) => prev.filter((i) => i !== id));
    } else {
      setSelectedIds((prev) => [...prev, id]);
    }
  };

  const handleToggleNoShow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (noShowIds.includes(id)) {
      // Desmarca falta e volta para selecionado
      setNoShowIds((prev) => prev.filter((i) => i !== id));
      setSelectedIds((prev) => [...prev, id]);
    } else {
      // Marca falta e retira dos selecionados para confirmar
      setNoShowIds((prev) => [...prev, id]);
      setSelectedIds((prev) => prev.filter((i) => i !== id));
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.length === appointments.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(appointments.map((a) => a.id));
      setNoShowIds([]);
    }
  };

  const handleSubmit = async () => {
    if (selectedIds.length === 0 && noShowIds.length === 0) return;
    await onCompleteBulk(selectedIds, noShowIds);
    onOpenChange(false);
  };

  const hasPastDays = useMemo(() => appointments.some((a) => a.isPastDay), [appointments]);

  if (appointments.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col p-5 sm:p-6 overflow-hidden">
        <DialogHeader className="shrink-0 space-y-1.5 text-left">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">
              Finalizar Atendimentos
            </DialogTitle>
          </div>
          <DialogDescription className="text-[12.5px] text-muted-foreground leading-relaxed">
            {hasPastDays
              ? "Você tem agendamentos pendentes de ontem ou dias anteriores que precisam ser confirmados para fechar o caixa."
              : "Os horários abaixo já foram concluídos. Confirme todos de uma vez para atualizar seu faturamento de hoje."}
          </DialogDescription>
        </DialogHeader>

        {/* Barra de ação rápida: Selecionar todos */}
        <div className="flex items-center justify-between py-2 border-b border-border/30 shrink-0 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={handleSelectAll}
            className="hover:text-foreground font-medium transition-colors"
          >
            {selectedIds.length === appointments.length ? "Desmarcar todos" : "Selecionar todos"}
          </button>
          <span className="tabular-nums">
            {selectedIds.length} de {appointments.length} para confirmar
          </span>
        </div>

        {/* Lista de agendamentos em scroll */}
        <div className="flex-1 overflow-y-auto space-y-2 py-2 pr-1 -mr-1">
          {appointments.map((apt) => {
            const isSelected = selectedIds.includes(apt.id);
            const isNoShow = noShowIds.includes(apt.id);

            return (
              <div
                key={apt.id}
                onClick={() => handleToggleSelect(apt.id)}
                className={cn(
                  "p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 select-none",
                  isNoShow
                    ? "bg-rose-500/10 border-rose-500/30 opacity-75"
                    : isSelected
                    ? "bg-card border-foreground/30 shadow-xs"
                    : "bg-secondary/30 border-border/40 opacity-60"
                )}
              >
                {/* Checkbox de seleção */}
                <div
                  className={cn(
                    "w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors",
                    isSelected
                      ? "bg-foreground border-foreground text-background"
                      : isNoShow
                      ? "border-rose-500 bg-rose-500/20 text-rose-500"
                      : "border-border/60 bg-transparent"
                  )}
                >
                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  {isNoShow && <UserX className="w-3.5 h-3.5 text-rose-500" />}
                </div>

                {/* Dados do agendamento */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={cn(
                        "text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md tabular-nums",
                        apt.isPastDay
                          ? "bg-amber-500/15 text-amber-500 border border-amber-500/20"
                          : "bg-secondary text-foreground"
                      )}
                    >
                      {apt.displayDateLabel} • {apt.hora}
                    </span>
                    <span className="text-[13px] font-semibold text-foreground truncate">
                      {apt.clientName}
                    </span>
                    {isWhatsAppAppointment(apt.observacoes) && <WhatsAppBadge />}
                  </div>

                  <p className="text-[11.5px] text-muted-foreground truncate mt-0.5">
                    {apt.serviceName}
                    {apt.tipo_agendamento === "plano" ? " • Plano" : ` • R$ ${apt.preco.toFixed(0)}`}
                  </p>
                </div>

                {/* Botão de marcar Falta / Não Veio */}
                <button
                  type="button"
                  onClick={(e) => handleToggleNoShow(apt.id, e)}
                  className={cn(
                    "text-[11px] font-medium px-2 py-1 rounded-lg shrink-0 transition-all",
                    isNoShow
                      ? "bg-rose-500/20 text-rose-400 hover:bg-rose-500/30"
                      : "bg-secondary/60 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10"
                  )}
                  title={isNoShow ? "Desmarcar falta" : "Marcar como não veio"}
                >
                  {isNoShow ? "Faltou" : "Não veio"}
                </button>
              </div>
            );
          })}
        </div>

        {/* Ações principais Apple HIG */}
        <div className="pt-3 border-t border-border/30 shrink-0 space-y-2">
          <button
            type="button"
            disabled={isCompleting || (selectedIds.length === 0 && noShowIds.length === 0)}
            onClick={handleSubmit}
            className="w-full h-11 rounded-full bg-foreground text-background font-semibold text-[13.5px] flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.99] disabled:opacity-50 transition-all shadow-xs"
          >
            {isCompleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Confirmando atendimentos...</span>
              </>
            ) : selectedIds.length === appointments.length && noShowIds.length === 0 ? (
              <span>Confirmar todos de uma vez ({appointments.length})</span>
            ) : (
              <span>
                Confirmar {selectedIds.length} {selectedIds.length === 1 ? "atendimento" : "atendimentos"}
                {noShowIds.length > 0 ? ` (${noShowIds.length} falta)` : ""}
              </span>
            )}
          </button>

          <button
            type="button"
            disabled={isCompleting}
            onClick={() => onOpenChange(false)}
            className="w-full h-9 rounded-full bg-transparent text-muted-foreground hover:text-foreground text-[12px] font-medium transition-colors"
          >
            Lembrar mais tarde
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
