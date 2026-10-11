import { useState, useEffect, useMemo } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Check, UserX, Loader2, X } from "lucide-react";
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
  const [noShowIds, setNoShowIds] = useState<string[]>([]);

  useEffect(() => {
    if (appointments.length > 0) {
      setSelectedIds(appointments.map((a) => a.id));
      setNoShowIds([]);
    }
  }, [appointments]);

  const handleToggleSelect = (id: string) => {
    if (noShowIds.includes(id)) {
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
      setNoShowIds((prev) => prev.filter((i) => i !== id));
      setSelectedIds((prev) => [...prev, id]);
    } else {
      setNoShowIds((prev) => [...prev, id]);
      setSelectedIds((prev) => prev.filter((i) => i !== id));
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.length === appointments.length && noShowIds.length === 0) {
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
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerContent className="max-h-[85vh] sm:max-w-lg sm:mx-auto flex flex-col p-0 bg-background text-foreground border-t border-border/40 rounded-t-[26px] z-[80] focus:outline-none">
        {/* Cabeçalho minimalista Apple HIG */}
        <div className="px-5 pt-3 pb-3.5 flex items-start justify-between border-b border-border/30 shrink-0">
          <div>
            <DrawerTitle className="text-[17px] font-semibold text-foreground tracking-tight">
              Finalizar atendimentos
            </DrawerTitle>
            <DrawerDescription className="text-[12.5px] text-muted-foreground font-normal mt-0.5">
              {hasPastDays
                ? "Confirme os atendimentos pendentes para atualizar seu caixa."
                : "Confirme os atendimentos já realizados para registrar o faturamento."}
            </DrawerDescription>
          </div>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-7 h-7 rounded-full bg-secondary/80 flex items-center justify-center text-muted-foreground hover:text-foreground active:opacity-60 transition-opacity shrink-0 ml-3 cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-3.5 h-3.5 stroke-[2.2]" />
          </button>
        </div>

        {/* Barra de seleção rápida */}
        <div className="px-5 py-2 flex items-center justify-between border-b border-border/20 bg-secondary/30 shrink-0 text-[12px]">
          <button
            type="button"
            onClick={handleSelectAll}
            className="text-foreground font-medium hover:opacity-70 active:opacity-50 transition-opacity cursor-pointer"
          >
            {selectedIds.length === appointments.length && noShowIds.length === 0
              ? "Desmarcar todos"
              : "Selecionar todos"}
          </button>
          <span className="text-muted-foreground font-normal tabular-nums">
            {selectedIds.length} de {appointments.length} para confirmar
          </span>
        </div>

        {/* Lista de clientes (scroll suave) */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 overscroll-contain">
          {appointments.map((apt) => {
            const isSelected = selectedIds.includes(apt.id);
            const isNoShow = noShowIds.includes(apt.id);

            return (
              <div
                key={apt.id}
                onClick={() => handleToggleSelect(apt.id)}
                className={cn(
                  "p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 select-none active:opacity-75",
                  isNoShow
                    ? "bg-rose-500/[0.06] border-rose-500/25 opacity-75"
                    : isSelected
                    ? "bg-card border-foreground/25 shadow-xs"
                    : "bg-secondary/25 border-border/30 opacity-60"
                )}
              >
                {/* Checkbox circular Apple */}
                <div
                  className={cn(
                    "w-6 h-6 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                    isSelected
                      ? "bg-foreground border-foreground text-background"
                      : isNoShow
                      ? "border-rose-500/40 bg-rose-500/10 text-rose-500"
                      : "border-border/60 bg-transparent"
                  )}
                >
                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  {isNoShow && <UserX className="w-3.5 h-3.5 text-rose-500" />}
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

                {/* Botão de falta Apple cápsula */}
                <button
                  type="button"
                  onClick={(e) => handleToggleNoShow(apt.id, e)}
                  className={cn(
                    "text-[11px] font-medium px-2.5 py-1 rounded-full shrink-0 transition-all border cursor-pointer",
                    isNoShow
                      ? "bg-rose-500/15 border-rose-500/30 text-rose-500"
                      : "bg-transparent border-border/40 text-muted-foreground hover:text-foreground active:opacity-60"
                  )}
                >
                  {isNoShow ? "Faltou" : "Não veio"}
                </button>
              </div>
            );
          })}
        </div>

        {/* Rodapé com botão cápsula Apple */}
        <div className="p-4 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] border-t border-border/30 bg-background/95 backdrop-blur-xs space-y-2 shrink-0">
          <button
            type="button"
            disabled={isCompleting || (selectedIds.length === 0 && noShowIds.length === 0)}
            onClick={handleSubmit}
            className="w-full h-12 rounded-full bg-foreground text-background font-semibold text-[14.5px] flex items-center justify-center gap-2 active:opacity-70 disabled:opacity-40 transition-all shadow-xs cursor-pointer"
          >
            {isCompleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Confirmando atendimentos...</span>
              </>
            ) : selectedIds.length === appointments.length && noShowIds.length === 0 ? (
              <span>Confirmar todos ({appointments.length})</span>
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
            className="w-full h-8 rounded-full bg-transparent text-muted-foreground hover:text-foreground text-[12.5px] font-medium transition-colors cursor-pointer"
          >
            Lembrar mais tarde
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
