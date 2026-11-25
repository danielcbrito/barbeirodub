import { motion } from "framer-motion";
import { ArrowLeft, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoDub from "@/assets/logo-dub.png";

interface MaintenanceScreenProps {
  message?: string;
  onExit: () => void;
}

export function MaintenanceScreen({ message, onExit }: MaintenanceScreenProps) {
  const defaultMessage =
    "Estamos realizando melhorias no sistema para atendê-lo com ainda mais qualidade. Agradecemos a sua compreensão.";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8 relative overflow-hidden">
      {/* Subtle decorative background grid */}
      <div className="absolute inset-0 opacity-[0.03]">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(currentColor 1px, transparent 0), linear-gradient(90deg, currentColor 1px, transparent 0)`,
            backgroundSize: "24px 24px",
          }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 flex flex-col items-center text-center max-w-md w-full space-y-8"
      >
        {/* Logo */}
        <motion.img
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          src={logoDub}
          alt="Barbearia DUB"
          className="w-16 h-16 object-contain mb-2"
        />

        {/* Status indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-border border border-border/50"
        >
          <span className="w-2 h-2 rounded-full bg-foreground animate-pulse" />
          <span className="text-[11px] font-medium text-foreground tracking-wide uppercase">
            Manutenção programada
          </span>
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-2xl font-semibold text-foreground tracking-tight mb-2"
        >
          Estamos em manutenção
        </motion.h1>

        {/* Message */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="text-sm text-muted-foreground leading-relaxed mb-8 max-w-sm"
        >
          {message || defaultMessage}
        </motion.p>

        {/* Return date card */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col items-center gap-2 px-6 py-4 rounded-xl bg-muted/30 border border-border/50"
        >
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Retorno previsto
            </span>
          </div>
          <p className="text-sm font-semibold text-foreground">
            Segunda-feira, 30 de novembro de 2026
          </p>
        </motion.div>

        {/* Back button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="w-full"
        >
          <Button
            onClick={onExit}
            variant="outline"
            className="w-full h-11 rounded-full text-sm font-medium gap-2 border-border/50 hover:bg-muted"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar para o início
          </Button>
        </motion.div>
      </motion.div>

      {/* Footer */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="absolute bottom-8 text-[10px] text-muted-foreground/40 tracking-widest uppercase"
      >
        Barbearia DUB &bull; Sistema temporariamente indisponível
      </motion.p>
    </div>
  );
}
