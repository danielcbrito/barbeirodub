import { memo } from "react";
import { motion } from "framer-motion";
import { Clock, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface PremiumFreeIntervalCardProps {
  startTime: string;
  endTime: string;
  slotsCount: number;
  isExpanded: boolean;
  onToggle: () => void;
  index: number;
}

export const PremiumFreeIntervalCard = memo(function PremiumFreeIntervalCard({
  startTime,
  endTime,
  slotsCount,
  isExpanded,
  onToggle,
  index
}: PremiumFreeIntervalCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02, duration: 0.15 }}
      onClick={onToggle}
      className={cn(
        "group relative rounded-xl cursor-pointer",
        "transition-all duration-300 ease-out",
        "hover:bg-foreground/[0.02]"
      )}
      style={{
        background: "linear-gradient(135deg, rgba(24, 24, 29, 0.3), rgba(18, 18, 22, 0.4))",
        border: "1px dashed rgba(255, 255, 255, 0.08)"
      }}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <Clock className="w-4 h-4 text-muted-foreground/40" />
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground/60 tabular-nums">
              {startTime} — {endTime}
            </span>
            <span className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-foreground/5 text-muted-foreground/50">
              {slotsCount} horários livres
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-muted-foreground/40 group-hover:text-muted-foreground/60 transition-colors">
          <span className="text-xs">{isExpanded ? "Recolher" : "Expandir"}</span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </div>
      </div>
    </motion.div>
  );
});