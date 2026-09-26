import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoDub from "@/assets/logo-dub.png";

interface RefreshRequiredScreenProps {
  onRefresh: () => void;
}

export function RefreshRequiredScreen({ onRefresh }: RefreshRequiredScreenProps) {
  return (
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center p-6 overflow-hidden pt-[env(safe-area-inset-top)]">
      {/* Subtle background pattern (matching MaintenanceScreen) */}
      <div className="absolute inset-0 opacity-[0.02]">
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
            backgroundSize: '40px 40px'
          }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 flex flex-col items-center text-center max-w-sm w-full"
      >
        {/* Logo */}
        <motion.img
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          src={logoDub}
          alt="Barbearia DUB"
          className="w-20 h-20 object-contain mb-6"
        />

        {/* Update indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-6"
        >
          <RefreshCw className="w-3.5 h-3.5 text-primary animate-[spin_4s_linear_infinite]" />
          <span className="text-xs font-medium text-primary">Atualização Obrigatória</span>
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="text-xl font-semibold text-foreground mb-3"
        >
          Nova versão disponível
        </motion.h1>

        {/* Message */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-sm text-muted-foreground mb-8 leading-relaxed"
        >
          Uma atualização foi publicada. Recarregue a página para continuar.
        </motion.p>

        {/* Divider */}
        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ delay: 0.35 }}
          className="w-16 h-px bg-border mb-8"
        />

        {/* Action Button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="w-full"
        >
          <Button
            onClick={onRefresh}
            className="w-full h-11 text-sm font-medium gap-2 shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Atualizar Agora
          </Button>
        </motion.div>
      </motion.div>

      {/* Footer */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="absolute bottom-4 text-muted-foreground/60 text-[10px] tracking-wide uppercase"
      >
        Sistema em constante evolução
      </motion.p>
    </div>
  );
}
