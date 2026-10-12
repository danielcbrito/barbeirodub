import { Gift, Sparkles, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

interface LoyaltyCardProps {
  points: number;
  redemptions: number;
  requiredPoints: number;
  onViewDetails: () => void;
}

function ProgressDot({ filled, index }: { filled: boolean; index: number }) {
  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ delay: index * 0.08, duration: 0.3 }}
      className="flex-1"
    >
      <div
        className={`h-2 rounded-full transition-all duration-300 ${
          filled
            ? "bg-gradient-to-r from-yellow-200 to-yellow-300 shadow-[0_0_12px_rgba(254,240,138,0.6)]"
            : "bg-foreground/20"
        }`}
      />
    </motion.div>
  );
}

export function LoyaltyCard({ points, redemptions, requiredPoints, onViewDetails }: LoyaltyCardProps) {
  const currentCycleProgress = points % requiredPoints;
  const cutsUntilFree = requiredPoints - currentCycleProgress;
  const progressDots = Array.from({ length: requiredPoints }, (_, i) => i < currentCycleProgress);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="relative overflow-hidden rounded-2xl"
      style={{
        background: "linear-gradient(135deg, #DC2626 0%, #EF4444 50%, #F87171 100%)",
        boxShadow: "0 20px 40px -12px rgba(220, 38, 38, 0.4), 0 8px 24px rgba(0, 0, 0, 0.2)",
      }}
    >
      {/* Background pattern */}
      <div 
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `radial-gradient(circle at 20% 80%, rgba(255,255,255,0.3) 0%, transparent 50%),
                            radial-gradient(circle at 80% 20%, rgba(255,255,255,0.2) 0%, transparent 40%)`,
        }}
      />

      {/* Shine effect */}
      <div 
        className="absolute inset-0 opacity-20"
        style={{
          background: "linear-gradient(135deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)",
          transform: "translateX(-100%)",
          animation: "shimmer 3s infinite",
        }}
      />

      <div className="relative z-10 p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div 
              className="w-11 h-11 rounded-xl flex items-center justify-center"
              style={{
                background: "rgba(255,255,255,0.2)",
                backdropFilter: "blur(8px)",
              }}
            >
              <Gift className="w-5 h-5 text-foreground" />
            </div>
            <div>
              <h3 className="text-foreground font-bold text-base tracking-tight">
                Programa Fidelidade
              </h3>
              <p className="text-foreground/70 text-xs">
                A cada {requiredPoints} cortes, ganhe 1 grátis
              </p>
            </div>
          </div>
          
          {redemptions > 0 && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
              style={{
                background: "rgba(255,255,255,0.25)",
                backdropFilter: "blur(8px)",
                boxShadow: "0 0 20px rgba(255,255,255,0.3)",
              }}
            >
              <Sparkles className="w-3 h-3 text-yellow-200" />
              <span className="text-foreground text-xs font-bold">
                {redemptions}
              </span>
            </motion.div>
          )}
        </div>

        {/* Progress section */}
        <div className="space-y-2.5 mb-4">
          {/* Progress bars */}
          <div className="flex items-center gap-1.5">
            {progressDots.map((filled, index) => (
              <ProgressDot key={index} filled={filled} index={index} />
            ))}
          </div>

          {/* Progress text */}
          <div className="flex items-center justify-between text-foreground/80 text-xs">
            <span className="font-medium">{currentCycleProgress} de {requiredPoints} cortes</span>
            <span className="flex items-center gap-1">
              <Gift className="w-3 h-3" />
              Faltam {cutsUntilFree}
            </span>
          </div>
        </div>

        {/* View details button */}
        <Button
          variant="ghost"
          onClick={onViewDetails}
          className="w-full h-9 rounded-xl text-foreground/90 hover:text-foreground hover:bg-foreground/10 transition-all duration-300 group text-sm"
        >
          <span className="font-medium">Ver detalhes</span>
          <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
        </Button>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </motion.div>
  );
}
