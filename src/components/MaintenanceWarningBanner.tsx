import { motion, AnimatePresence } from "framer-motion";
import { X, AlertTriangle } from "lucide-react";
import { useState } from "react";

interface MaintenanceWarningBannerProps {
  message: string;
}

export function MaintenanceWarningBanner({ message }: MaintenanceWarningBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          key="maintenance-banner"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="w-full flex-shrink-0 overflow-hidden"
        >
          <div
            className="w-full relative flex items-center justify-center px-10 py-2.5"
            style={{
              background: "linear-gradient(90deg, hsl(42 100% 50%), hsl(35 100% 52%))",
            }}
          >
            {/* Ícone + mensagem centralizados */}
            <div className="flex items-center gap-2">
              <AlertTriangle
                className="w-4 h-4 flex-shrink-0"
                style={{ color: "rgba(0,0,0,0.6)" }}
                strokeWidth={2.5}
              />
              <p
                className="text-[12px] font-semibold leading-snug"
                style={{ color: "rgba(0,0,0,0.75)" }}
              >
                {message}
              </p>
            </div>

            {/* Botão X — absoluto na direita, não desloca o centro */}
            <button
              onClick={() => setDismissed(true)}
              aria-label="Fechar aviso"
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded transition-all active:scale-90"
            >
              <X
                className="w-3.5 h-3.5"
                style={{ color: "rgba(0,0,0,0.5)" }}
                strokeWidth={2.5}
              />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
