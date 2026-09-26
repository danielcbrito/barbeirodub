import { motion } from "framer-motion";
import { Settings, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoDub from "@/assets/logo-dub.png";

interface MaintenanceScreenProps {
  message?: string;
  onExit: () => void;
}

export function MaintenanceScreen({ message, onExit }: MaintenanceScreenProps) {
  const defaultMessage = "Estamos realizando melhorias no sistema. Por favor, tente novamente mais tarde.";
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-background/95 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-[0.02]">
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
            backgroundSize: '40px 40px'
          }}
        />
      </div>

      {/* Content */}
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

        {/* Status indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-6"
        >
          <Settings className="w-3.5 h-3.5 text-primary animate-[spin_3s_linear_infinite]" />
          <span className="text-xs font-medium text-primary">Manutenção em andamento</span>
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="text-xl font-semibold text-foreground mb-3"
        >
          Sistema Temporariamente Indisponível
        </motion.h1>

        {/* Message */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-sm text-muted-foreground mb-8 leading-relaxed"
        >
          {message || defaultMessage}
        </motion.p>

        {/* Divider */}
        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ delay: 0.35 }}
          className="w-16 h-px bg-border mb-8"
        />

        {/* Exit Button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="w-full"
        >
          <Button
            onClick={onExit}
            variant="outline"
            className="w-full h-11 text-sm font-medium gap-2 border-border/50 hover:bg-secondary/50"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
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
        Agradecemos a compreensão
      </motion.p>
    </div>
  );
}
