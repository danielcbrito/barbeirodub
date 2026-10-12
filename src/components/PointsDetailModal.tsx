import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Gift, CheckCircle, Clock, X, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

interface PointsDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  points: number;
  completedAppointments: number;
  redemptions: number;
  requiredPoints: number;
}

function ProgressDot({ filled, index }: { filled: boolean; index: number }) {
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: index * 0.1, duration: 0.3, ease: "easeOut" }}
      className={`w-4 h-4 rounded-full transition-all duration-300 ${
        filled
          ? "bg-red-500 shadow-lg shadow-red-500/50"
          : "bg-zinc-700 border-2 border-zinc-600"
      }`}
    />
  );
}

function StatCard({ 
  icon: Icon, 
  value, 
  label, 
  highlight = false,
  delay = 0 
}: { 
  icon: React.ElementType; 
  value: number; 
  label: string; 
  highlight?: boolean;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: "easeOut" }}
      className={`rounded-xl p-4 text-center space-y-2 ${
        highlight
          ? "bg-red-500/10 border border-red-500/30"
          : "bg-zinc-800/30 border border-zinc-700/50"
      }`}
    >
      <Icon className={`w-5 h-5 mx-auto ${highlight ? "text-red-400" : "text-zinc-400"}`} />
      <p className={`text-2xl font-bold ${highlight ? "text-red-400" : "text-foreground"}`}>
        {value}
      </p>
      <p className="text-[11px] text-zinc-400 leading-tight">{label}</p>
    </motion.div>
  );
}

export function PointsDetailModal({ 
  open, 
  onOpenChange, 
  points, 
  completedAppointments, 
  redemptions,
  requiredPoints
}: PointsDetailModalProps) {
  const currentCycleProgress = points % requiredPoints;
  const cutsUntilFree = requiredPoints - currentCycleProgress;
  const progressDots = Array.from({ length: requiredPoints }, (_, i) => i < currentCycleProgress);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-md p-0 bg-gradient-to-b from-zinc-900 to-zinc-950 border-zinc-800 overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-4 pb-0 flex flex-row items-center justify-between">
          <button
            onClick={() => onOpenChange(false)}
            className="w-8 h-8 rounded-full bg-zinc-800/80 flex items-center justify-center hover:bg-zinc-700 transition-colors"
          >
            <X className="w-4 h-4 text-zinc-400" />
          </button>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Gift className="w-4 h-4 text-red-500" />
            Programa Fidelidade
          </DialogTitle>
          <div className="w-8" /> {/* Spacer for centering */}
        </DialogHeader>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="p-5 pt-4 space-y-6"
        >
          {/* Progress Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="bg-zinc-800/50 backdrop-blur-sm rounded-2xl p-5 border border-zinc-700/50"
          >
            <p className="text-xs text-zinc-400 uppercase tracking-wider mb-4 font-medium">
              Progresso Atual
            </p>
            
            {/* Progress Dots */}
            <div className="flex items-center justify-center gap-3 mb-4">
              {progressDots.map((filled, index) => (
                <ProgressDot key={index} filled={filled} index={index} />
              ))}
            </div>

            {/* Progress Text */}
            <div className="text-center space-y-1">
              <p className="text-2xl font-bold text-foreground">
                {currentCycleProgress} de {requiredPoints} <span className="text-lg font-normal text-zinc-400">cortes</span>
              </p>
              <p className="text-sm text-zinc-400">
                Mais <span className="text-red-400 font-semibold">{cutsUntilFree}</span> {cutsUntilFree === 1 ? 'corte' : 'cortes'} para ganhar 1 grátis
              </p>
            </div>

            {/* Reward Badge */}
            {redemptions > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
                className="mt-4 flex items-center justify-center"
              >
                <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-500/20 to-orange-500/20 rounded-full border border-red-500/30">
                  <Sparkles className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm font-semibold text-foreground">
                    {redemptions} {redemptions === 1 ? 'corte grátis disponível' : 'cortes grátis disponíveis'}!
                  </span>
                </div>
              </motion.div>
            )}
          </motion.div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              icon={CheckCircle}
              value={completedAppointments}
              label="Cortes realizados"
              delay={0.2}
            />
            <StatCard
              icon={Gift}
              value={redemptions}
              label="Prontos para usar"
              highlight={redemptions > 0}
              delay={0.3}
            />
            <StatCard
              icon={Clock}
              value={points}
              label="Pontos totais"
              delay={0.4}
            />
          </div>

          {/* How it works */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="space-y-3"
          >
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground">Como funciona?</h4>
              <div className="flex-1 h-px bg-zinc-700" />
            </div>
            
            <ul className="space-y-2.5">
              {[
                "Cada corte válido = 1 ponto",
                `Ao completar ${requiredPoints} pontos, ganhe 1 corte grátis`,
                "Use seus resgates no próximo agendamento",
                "Resgates não utilizados não expiram"
              ].map((item, index) => (
                <motion.li
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 + index * 0.1 }}
                  className="flex items-start gap-2.5 text-sm text-zinc-300"
                >
                  <span className="text-red-500 mt-0.5">→</span>
                  {item}
                </motion.li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
