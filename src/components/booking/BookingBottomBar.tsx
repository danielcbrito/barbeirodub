import { motion, AnimatePresence } from "framer-motion";
import { Scissors, Clock, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface BookingBottomBarProps {
  serviceCount: number;
  totalDuration: number;
  totalPrice: number;
  serviceName?: string;
  onContinue: () => void;
  isVisible: boolean;
  className?: string;
}

/**
 * Barra flutuante de resumo do agendamento.
 * Fundo branco, ícones/textos pretos, botão preto — limpo e organizado.
 */
export function BookingBottomBar({
  serviceCount,
  totalDuration,
  totalPrice,
  serviceName,
  onContinue,
  isVisible,
  className
}: BookingBottomBarProps) {
  const displayName = serviceName
    ? serviceName.length > 22 ? serviceName.slice(0, 22) + "…" : serviceName
    : `${serviceCount} serviço${serviceCount > 1 ? "s" : ""}`;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
          className={cn("fixed bottom-0 left-0 right-0 z-40", className)}
        >
          <div className="relative px-4 pb-safe">
            <div className="absolute -top-12 left-0 right-0 h-12 bg-gradient-to-t from-background to-transparent pointer-events-none" />

            <div
              className="relative mx-auto max-w-md overflow-hidden"
              style={{
                borderRadius: "16px",
                background: "#ffffff",
                boxShadow: "0 -2px 20px rgba(0,0,0,0.10), 0 4px 24px rgba(0,0,0,0.15)",
              }}
            >
              <div className="flex items-center gap-3 px-4 py-3.5">
                {/* Ícone tesoura — preto */}
                <div
                  className="flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0"
                  style={{ background: "#f2f2f2" }}
                >
                  <Scissors className="w-[18px] h-[18px]" style={{ color: "#111111" }} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[14px] font-semibold truncate leading-tight"
                    style={{ color: "#111111", textShadow: "none" }}
                  >
                    {displayName}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="flex items-center gap-1 text-[12px]" style={{ color: "#666", textShadow: "none" }}>
                      <Clock className="w-3 h-3" style={{ color: "#666" }} />
                      {totalDuration}min
                    </span>
                    <span className="text-[12px]" style={{ color: "#ccc", textShadow: "none" }}>·</span>
                    <span className="text-[12px] font-semibold" style={{ color: "#111111", textShadow: "none" }}>
                      R$ {totalPrice.toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                </div>

                {/* Botão CTA — preto */}
                <motion.button
                  onClick={onContinue}
                  whileTap={{ scale: 0.96 }}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-[13px] font-semibold flex-shrink-0"
                  style={{
                    color: "#ffffff",
                    textShadow: "none",
                    background: "#111111",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                  }}
                >
                  <span style={{ color: "#ffffff", textShadow: "none" }}>Continuar</span>
                  <ArrowRight className="w-4 h-4" style={{ color: "#ffffff" }} />
                </motion.button>
              </div>
            </div>

            <div className="h-3" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
