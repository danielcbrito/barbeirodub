import { memo } from "react";
import { motion } from "framer-motion";
import { Coffee } from "lucide-react";

interface PremiumLunchBreakProps {
  startTime: string;
  endTime: string;
  index: number;
}

export const PremiumLunchBreak = memo(function PremiumLunchBreak({
  startTime,
  endTime,
  index
}: PremiumLunchBreakProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02, duration: 0.15 }}
      className="relative rounded-xl overflow-hidden"
      style={{
        background: "linear-gradient(135deg, rgba(245, 158, 11, 0.05), rgba(245, 158, 11, 0.02))",
        border: "1px solid rgba(245, 158, 11, 0.1)"
      }}
    >
      <div className="flex items-center gap-4 px-4 py-3">
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
          <Coffee className="w-4 h-4 text-amber-500/70" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-amber-500/70">Intervalo de Almoço</span>
          <span className="text-xs text-muted-foreground/50">{startTime} — {endTime}</span>
        </div>
      </div>

      {/* Decorative pattern */}
      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <div 
          className="w-full h-full"
          style={{
            backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(245, 158, 11, 0.5) 10px, rgba(245, 158, 11, 0.5) 11px)"
          }}
        />
      </div>
    </motion.div>
  );
});