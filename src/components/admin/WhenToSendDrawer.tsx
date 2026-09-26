import { motion, AnimatePresence } from "framer-motion";
import { Send, CalendarClock, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface WhenToSendDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectNow: () => void;
  onSelectSchedule: () => void;
  selectedMode?: "now" | "schedule";
}

export function WhenToSendDrawer({
  isOpen,
  onClose,
  onSelectNow,
  onSelectSchedule,
  selectedMode = "now",
}: WhenToSendDrawerProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="absolute inset-0" onClick={onClose} />
          <motion.div
            initial={{ y: "100%", opacity: 0.5 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="relative w-full sm:max-w-md rounded-t-[28px] sm:rounded-2xl border border-border/70 dark:border-white/[0.1] bg-card p-5 pb-8 sm:pb-6 shadow-2xl space-y-4"
          >
            {/* Handle pill no topo para visual de gaveta nativa */}
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto -mt-1 mb-2 sm:hidden" />

            <div className="px-1">
              <h4 className="text-[17px] font-semibold text-foreground tracking-tight">
                Quando deseja enviar?
              </h4>
              <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">
                Escolha entre disparo imediato ou programar um horário.
              </p>
            </div>

            <div className="space-y-2.5 pt-1">
              {/* Opção 1: Disparar agora */}
              <div
                onClick={() => {
                  onSelectNow();
                  onClose();
                }}
                className={cn(
                  "rounded-2xl border p-4 flex items-center justify-between gap-3.5 cursor-pointer active:scale-[0.99] transition-all shadow-xs group",
                  selectedMode === "now"
                    ? "border-foreground/50 bg-secondary/40 ring-1 ring-foreground/20"
                    : "border-border/60 dark:border-white/[0.08] hover:border-foreground/30 bg-card"
                )}
              >
                <div className="flex items-center gap-3.5 min-w-0 pr-2">
                  <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-foreground shrink-0 border border-border/30 group-hover:bg-foreground group-hover:text-background transition-colors">
                    <Send className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-foreground leading-snug">
                      Disparar agora
                    </p>
                    <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
                      Inicia o envio assim que você concluir a mensagem e destinatários.
                    </p>
                  </div>
                </div>

                <ChevronRight className="w-4 h-4 text-muted-foreground/60 shrink-0 group-hover:text-foreground transition-colors" />
              </div>

              {/* Opção 2: Agendar disparo */}
              <div
                onClick={() => {
                  onSelectSchedule();
                  onClose();
                }}
                className={cn(
                  "rounded-2xl border p-4 flex items-center justify-between gap-3.5 cursor-pointer active:scale-[0.99] transition-all shadow-xs group",
                  selectedMode === "schedule"
                    ? "border-foreground/50 bg-secondary/40 ring-1 ring-foreground/20"
                    : "border-border/60 dark:border-white/[0.08] hover:border-foreground/30 bg-card"
                )}
              >
                <div className="flex items-center gap-3.5 min-w-0 pr-2">
                  <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-foreground shrink-0 border border-border/30 group-hover:bg-foreground group-hover:text-background transition-colors">
                    <CalendarClock className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-foreground leading-snug">
                      Agendar disparo
                    </p>
                    <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
                      Programar data e horário para envio automático.
                    </p>
                  </div>
                </div>

                <ChevronRight className="w-4 h-4 text-muted-foreground/60 shrink-0 group-hover:text-foreground transition-colors" />
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
