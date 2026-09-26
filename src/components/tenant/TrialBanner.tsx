import { motion } from "framer-motion";
import { Clock, Zap, ArrowRight } from "lucide-react";

interface TrialBannerProps {
  daysRemaining: number;
  onSubscribe: () => void;
}

/**
 * Banner de urgência exibido quando faltam <= 3 dias do trial.
 * Técnicas de persuasão: escassez temporal + aversão à perda.
 */
export function TrialBanner({ daysRemaining, onSubscribe }: TrialBannerProps) {
  const isLastDay = daysRemaining <= 1;
  const urgencyText = isLastDay
    ? "Último dia do seu período gratuito!"
    : `Restam apenas ${daysRemaining} dias do seu teste`;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.9, 0.35, 1] }}
      className="mx-3 mt-3 mb-1"
    >
      <button
        onClick={onSubscribe}
        className="w-full group relative overflow-hidden rounded-xl border border-amber-500/30 p-3.5 text-left transition-all duration-300 hover:border-amber-500/50 active:scale-[0.98]"
        style={{
          background: isLastDay
            ? "linear-gradient(135deg, hsl(0 72% 20% / 0.6), hsl(0 60% 12% / 0.8))"
            : "linear-gradient(135deg, hsl(38 92% 18% / 0.6), hsl(38 80% 10% / 0.8))",
        }}
      >
        {/* Brilho animado */}
        <motion.div
          className="absolute inset-0 opacity-20"
          animate={{ x: ["-100%", "200%"] }}
          transition={{ duration: 3, repeat: Infinity, repeatDelay: 2 }}
          style={{
            background: "linear-gradient(90deg, transparent, hsl(38 92% 60% / 0.3), transparent)",
            width: "40%",
          }}
        />

        <div className="relative flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
            isLastDay ? "bg-red-500/20" : "bg-amber-500/20"
          }`}>
            {isLastDay ? (
              <Zap className="w-4.5 h-4.5 text-red-400" />
            ) : (
              <Clock className="w-4.5 h-4.5 text-amber-400" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className={`text-[13px] font-semibold leading-tight ${
              isLastDay ? "text-red-300" : "text-amber-300"
            }`}>
              {urgencyText}
            </p>
            <p className="text-[11px] text-foreground/60 mt-0.5 leading-snug">
              {isLastDay
                ? "Não perca suas configurações e dados. Assine agora."
                : "Garanta acesso completo antes que expire."}
            </p>
          </div>

          <ArrowRight className={`w-4 h-4 flex-shrink-0 transition-transform group-hover:translate-x-0.5 ${
            isLastDay ? "text-red-400" : "text-amber-400"
          }`} />
        </div>
      </button>
    </motion.div>
  );
}
