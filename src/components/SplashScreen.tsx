import { motion, AnimatePresence } from "framer-motion";

interface SplashScreenProps { visible: boolean }

/**
 * Splash screen animado — exibido antes da landing page carregar.
 * Tipografia: "DUB Agenda" com destaque vermelho em "Agenda".
 */
export function SplashScreen({ visible }: SplashScreenProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="splash"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-background pt-[env(safe-area-inset-top)]"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="flex flex-col items-center gap-3"
          >
            {/* Título principal */}
            <motion.h1
              initial={{ opacity: 0, y: 12, letterSpacing: "0.3em" }}
              animate={{ opacity: 1, y: 0, letterSpacing: "0.08em" }}
              transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="text-[2rem] font-bold text-foreground tracking-tight"
              style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}
            >
              DUB{" "}
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.5 }}
                className="text-primary"
              >
                Agenda
              </motion.span>
            </motion.h1>

            {/* Linha decorativa */}
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.6, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="h-[1.5px] w-16 bg-primary/40 origin-center rounded-full"
            />

            {/* Subtítulo */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.9 }}
              className="text-[10px] text-muted-foreground/50 uppercase tracking-[0.25em] font-medium"
            >
              Seu estilo, na palma da mão
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
