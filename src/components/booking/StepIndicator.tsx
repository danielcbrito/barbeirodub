interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
}

export function StepIndicator({ currentStep, totalSteps, title, subtitle }: StepIndicatorProps) {
  return (
    <div className="mb-8 text-center">
      <p className="text-zinc-400 text-sm mb-2">Etapa {currentStep} de {totalSteps}</p>
      <h2 className="text-3xl font-bold text-foreground mb-3">
        {title}
      </h2>
      {subtitle && (
        <p className="text-zinc-500">
          {subtitle}
        </p>
      )}
    </div>
  );
}
