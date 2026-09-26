import { cn } from "@/lib/utils";

interface StepDotsProps {
  currentStep: number;
  totalSteps: number;
}

export function StepDots({ currentStep, totalSteps }: StepDotsProps) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: totalSteps }, (_, index) => {
        const stepNumber = index + 1;
        const isCompleted = stepNumber < currentStep;
        const isCurrent = stepNumber === currentStep;
        
        return (
          <div
            key={stepNumber}
            className={cn(
              "w-2.5 h-2.5 rounded-full transition-all duration-300",
              isCompleted && "bg-accent-red",
              isCurrent && "bg-accent-red w-6",
              !isCompleted && !isCurrent && "bg-muted-foreground/30"
            )}
          />
        );
      })}
    </div>
  );
}
