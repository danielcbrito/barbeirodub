import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MaintenanceScreenProps {
  message?: string;
  onExit: () => void;
}

export function MaintenanceScreen({ message, onExit }: MaintenanceScreenProps) {
  const defaultMessage =
    "Estamos em manutenção. Retornamos na segunda-feira, 30 de novembro de 2026.";

  return (
    <div
      className="fixed inset-0 z-[999999] bg-background flex flex-col items-center justify-center p-8 overflow-hidden"
    >
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center text-center max-w-md w-full space-y-6"
      >
        {/* Logo DUB — D oficial (imagem) + ub (texto) */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="flex items-center gap-1.5"
        >
          <img
            src="/auth-assets/dub_logo_d.png"
            alt="D"
            className="h-12 w-auto object-contain block dark:invert select-none"
            draggable={false}
          />
          <span className="text-[36px] font-bold text-foreground tracking-tight leading-none">
            ub
          </span>
        </motion.div>

        {/* Título */}
        <motion.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-xl font-semibold text-foreground tracking-tight"
        >
          Estamos em manutenção
        </motion.h1>

        {/* Mensagem */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="text-sm text-muted-foreground leading-relaxed max-w-sm"
        >
          {message || defaultMessage}
        </motion.p>

        {/* Botão Voltar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
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
    </div>
  );
}
