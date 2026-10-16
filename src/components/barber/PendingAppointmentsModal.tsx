import { useState, useEffect, useMemo } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Check, Loader2, X } from "lucide-react";
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

/**
 * Gaveta (Bottom Sheet) 100% Apple HIG para Finalizar Atendimentos.
 * Minimalista, preto e branco, abre por cima da barra de navegação.
 */
export function PendingAppointmentsModal({
  open,
  onOpenChange,
  appointments,
  onCompleteBulk,
  isCompleting = false,
}: PendingAppointmentsModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submittingAction, setSubmittingAction] = useState<"complete" | "no_show" | null>(null);

  // Inicializa todos pré-selecionados ao carregar a lista
  useEffect(() => {
    if (appointments.length > 0) {
      setSelectedIds(appointments.map((a) => a.id));
    } else {
      setSelectedIds([]);
    }
  }, [appointments, open]);

  const handleToggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds((prev) => prev.filter((i) => i !== id));
    } else {
      setSelectedIds((prev) => [...prev, id]);
    }
  };

  const handleFinalizeSelected = async () => {
    if (selectedIds.length === 0) return;
    setSubmittingAction("complete");
    try {
      await onCompleteBulk(selectedIds, []);
      onOpenChange(false);
    } finally {
      setSubmittingAction(null);
    }
  };

  const handleNoShowSelected = async () => {
    if (selectedIds.length === 0) return;
    setSubmittingAction("no_show");
    try {
      await onCompleteBulk([], selectedIds);
      onOpenChange(false);
    } finally {
      setSubmittingAction(null);
    }
  };

  const hasPastDays = useMemo(() => appointments.some((a) => a.isPastDay), [appointments]);
  const busy = isCompleting || submittingAction !== null;

  if (appointments.length === 0) return null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerContent className="max-h-[85vh] sm:max-w-lg sm:mx-auto flex flex-col p-0 bg-background text-foreground border-t border-border/40 rounded-t-[26px] z-[80] focus:outline-none">
        {/* Cabeçalho minimalista Apple HIG */}
        <div className="px-5 pt-3.5 pb-3 flex items-start justify-between border-b border-border/30 shrink-0">
          <div className="pr-2">
            <DrawerTitle className="text-[17px] font-semibold text-foreground tracking-tight">
              Finalizar atendimentos
            </DrawerTitle>
            <DrawerDescription className="text-[12.5px] text-muted-foreground font-normal mt-0.5 leading-snug">
              {hasPastDays
                ? "Selecione os clientes atendidos ou marque falta para manter seu histórico em dia."
                : "Selecione os clientes atendidos para registrar o faturamento ou marque falta."}
            </DrawerDescription>
          </div>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-7 h-7 rounded-full bg-secondary/80 flex items-center justify-center text-muted-foreground hover:text-foreground active:opacity-60 transition-opacity shrink-0 cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-3.5 h-3.5 stroke-[2.2]" />
          </button>
        </div>

        {/* Lista de clientes (apenas seleção limpa) */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 overscroll-contain">
          {appointments.map((apt) => {
            const isSelected = selectedIds.includes(apt.id);

            return (
              <div
                key={apt.id}
                onClick={() => handleToggleSelect(apt.id)}
                className={cn(
                  "p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 select-none active:opacity-75",
                  isSelected
                    ? "bg-card border-foreground/25 shadow-xs"
                    : "bg-secondary/20 border-border/30 opacity-55"
                )}
              >
                {/* Checkbox circular Apple */}
                <div
                  className={cn(
                    "w-6 h-6 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                    isSelected
                      ? "bg-foreground border-foreground text-background"
                      : "border-border/60 bg-transparent"
                  )}
                >
                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>

                {/* Detalhes do agendamento */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[14px] font-semibold text-foreground truncate">
                      {apt.clientName}
                    </span>
                    {isWhatsAppAppointment(apt.observacoes) && <WhatsAppBadge />}
                  </div>

                  <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground mt-0.5 truncate">
                    <span className="tabular-nums font-medium">
                      {apt.displayDateLabel} • {apt.hora}
                    </span>
                    <span>•</span>
                    <span className="truncate">{apt.serviceName}</span>
                    <span>•</span>
                    <span className="font-semibold text-foreground tabular-nums">
                      {apt.tipo_agendamento === "plano"
                        ? "Plano"
                        : `R$ ${(typeof apt.preco === "number" && !isNaN(apt.preco) ? apt.preco : 0).toFixed(0)}`}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Rodapé com botões cápsula Apple: Finalizar + Faltou */}
        <div className="p-4 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] border-t border-border/30 bg-background/95 backdrop-blur-xs space-y-2 shrink-0">
          {/* Botão Principal: Finalizar atendimentos */}
          <button
            type="button"
            disabled={busy || selectedIds.length === 0}
            onClick={handleFinalizeSelected}
            className="w-full h-12 rounded-full bg-foreground text-background font-semibold text-[14px] flex items-center justify-center gap-2 active:opacity-70 hover:opacity-90 disabled:opacity-35 transition-all shadow-xs cursor-pointer"
          >
            {submittingAction === "complete" ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Finalizando...</span>
              </>
            ) : selectedIds.length === appointments.length ? (
              <span>Finalizar todos ({appointments.length})</span>
            ) : (
              <span>Finalizar selecionados ({selectedIds.length})</span>
            )}
          </button>

          {/* Botão Secundário: Marcar como faltou (substitui 'Lembrar mais tarde') */}
          <button
            type="button"
            disabled={busy || selectedIds.length === 0}
            onClick={handleNoShowSelected}
            className="w-full h-11 rounded-full bg-secondary/70 hover:bg-secondary border border-border/50 text-foreground font-medium text-[13px] flex items-center justify-center gap-2 active:opacity-70 disabled:opacity-35 transition-all cursor-pointer"
          >
            {submittingAction === "no_show" ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Registrando falta...</span>
              </>
            ) : (
              <span>Faltou ({selectedIds.length})</span>
            )}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
