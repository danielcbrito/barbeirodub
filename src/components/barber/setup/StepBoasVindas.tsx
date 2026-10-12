import { motion } from "framer-motion";
import { CheckCircle2, Sparkles } from "lucide-react";

interface Props {
  nome: string;
}

/**
 * Step 7 — Tela de boas-vindas / conclusão.
 */
export function StepBoasVindas({ nome }: Props) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 space-y-6">
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
        className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center"
      >
        <CheckCircle2 className="w-10 h-10 text-primary" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="space-y-2"
      >
        <h2 className="text-[24px] font-bold text-foreground leading-tight">
          Tudo pronto, {nome}! 🎉
        </h2>
        <p className="text-[13px] text-foreground/90 leading-relaxed max-w-xs mx-auto">
          Seu painel está configurado e pronto para receber agendamentos.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/5 border border-primary/10"
      >
        <Sparkles className="w-4 h-4 text-primary" />
        <span className="text-[12px] text-foreground font-medium">
          Você já pode começar a usar seu painel
        </span>
      </motion.div>
    </div>
  );
}
