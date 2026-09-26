import { motion } from "framer-motion";

interface Props {
  currentStep: number;
  totalSteps: number;
}

/**
 * Barra de progresso verde minimalista — sem texto, apenas a barra.
 */
export function SetupStepIndicator({ currentStep, totalSteps }: Props) {
  const progress = ((currentStep + 1) / totalSteps) * 100;

  return (
    <div className="w-full h-1 bg-secondary/40 overflow-hidden">
      <motion.div
        className="h-full bg-accent-red"
        initial={{ width: 0 }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      />
    </div>
  );
}
