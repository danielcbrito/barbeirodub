import { Calendar } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

interface ScheduleButtonProps {
  onClick: () => void;
}

export function ScheduleButton({ onClick }: ScheduleButtonProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <Button
        onClick={onClick}
        className="relative w-full h-14 rounded-2xl text-base font-bold tracking-wide overflow-hidden group bg-primary text-primary-foreground shadow-lg hover:bg-primary/90"
      >
        {/* Animated shine effect */}
        <motion.div
          className="absolute inset-0 opacity-0 group-hover:opacity-100"
          style={{
            background: "linear-gradient(90deg, transparent, hsl(var(--primary-foreground) / 0.15), transparent)",
          }}
          animate={{
            x: ["-100%", "100%"],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            repeatDelay: 2,
          }}
        />

        {/* Inner highlight */}
        <div 
          className="absolute inset-0 opacity-15"
          style={{
            background: "linear-gradient(180deg, hsl(var(--primary-foreground) / 0.2) 0%, transparent 50%)",
          }}
        />

        <div className="relative z-10 flex items-center justify-center gap-3">
          <motion.div
            whileHover={{ rotate: 12 }}
            transition={{ duration: 0.2 }}
          >
            <Calendar className="w-5 h-5" />
          </motion.div>
          <span>Agendar Horário</span>
        </div>
      </Button>
    </motion.div>
  );
}
