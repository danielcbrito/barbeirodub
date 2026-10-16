import { motion } from "framer-motion";
import { CheckCircle2, Clock } from "lucide-react";

interface Props {
  nome: string;
  isInvited?: boolean;
}

/**
 * Step de conclusão:
 * - Para o dono: Boas-vindas e acesso imediato ao painel.
 * - Para barbeiro convidado: Tela de "Seu cadastro está em análise".
 */
export function StepBoasVindas({ nome, isInvited = false }: Props) {
  if (isInvited) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-8 space-y-6">
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
          className="w-20 h-20 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500"
        >
          <Clock className="w-10 h-10 stroke-[2.2]" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-2"
        >
          <h2 className="text-[24px] font-bold text-foreground leading-tight">
            Seu cadastro está em análise
          </h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed max-w-xs mx-auto">
            Tudo pronto, <b className="text-foreground">{nome}</b>! Seus dados e horários foram salvos. O administrador da barbearia irá revisar suas informações e liberar o seu acesso à agenda.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20"
        >
          <Clock className="w-4 h-4 text-amber-500" />
          <span className="text-[12px] text-amber-500 font-medium">
            Aguardando aprovação da barbearia
          </span>
        </motion.div>
      </div>
    );
  }

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
          Tudo pronto, {nome}!
        </h2>
        <p className="text-[13px] text-foreground/90 leading-relaxed max-w-xs mx-auto">
          Seu painel está configurado e pronto para receber agendamentos.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-foreground/[0.05] border border-border/80"
      >
        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        <span className="text-[12px] text-foreground font-medium">
          Você já pode começar a usar seu painel
        </span>
      </motion.div>
    </div>
  );
}
