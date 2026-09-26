import { memo } from "react";
import { motion } from "framer-motion";
import { Plus, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface PremiumEmptySlotProps {
  time: string;
  onClick: () => void;
  isBlocked?: boolean;
  blockReason?: string;
  nextFreeTime?: string | null;
  index: number;
}

export const PremiumEmptySlot = memo(function PremiumEmptySlot({
  time,
  onClick,
  isBlocked = false,
  blockReason,
  nextFreeTime,
  index
}: PremiumEmptySlotProps) {
  if (isBlocked) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.02, duration: 0.15 }}
        className="relative rounded-xl opacity-40 cursor-not-allowed"
        style={{
          background: "linear-gradient(135deg, rgba(24, 24, 29, 0.3), rgba(18, 18, 22, 0.4))",
          border: "1px solid rgba(255, 255, 255, 0.03)"
        }}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <Clock className="w-4 h-4 text-muted-foreground/50" />
          <span className="text-sm font-medium text-muted-foreground/50 tabular-nums">{time}</span>
          <span className="text-xs text-muted-foreground/40 italic">
            {blockReason || "Ocupado"}
            {nextFreeTime && <span className="ml-2">• Livre às {nextFreeTime}</span>}
          </span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02, duration: 0.15 }}
      onClick={onClick}
      className={cn(
        "group relative rounded-xl cursor-pointer",
        "transition-all duration-300 ease-out",
        "hover:translate-y-[-1px] hover:bg-primary/5"
      )}
      style={{
        background: "linear-gradient(135deg, rgba(24, 24, 29, 0.4), rgba(18, 18, 22, 0.5))",
        border: "1px solid rgba(255, 255, 255, 0.04)"
      }}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <Clock className="w-4 h-4 text-muted-foreground/60" />
          <span className="text-sm font-medium text-muted-foreground/80 tabular-nums">{time}</span>
          <span className="text-xs text-muted-foreground/50">Horário livre</span>
        </div>

        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <span className="text-xs font-medium text-primary">Agendar</span>
          <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <Plus className="w-4 h-4 text-primary" />
          </div>
        </div>
      </div>
    </motion.div>
  );
});