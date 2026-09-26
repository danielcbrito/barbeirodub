import { ChevronLeft } from "lucide-react";

interface BookingHeaderProps {
  currentStep: number;
  totalSteps: number;
  title: string;
  onBack: () => void;
}

export function BookingHeader({ currentStep, totalSteps, title, onBack }: BookingHeaderProps) {
  const progressPercentage = Math.max(0, Math.min(100, (currentStep / totalSteps) * 100));

  return (
    <header
      className="sticky top-0 z-40 bg-background/95 backdrop-blur-md"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="relative flex h-14 items-center justify-center px-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar"
          className="absolute left-3 h-10 w-10 flex items-center justify-center rounded-full text-foreground/85 active:scale-95 transition-transform"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
        </button>
        <h1 className="text-[15px] font-semibold text-foreground truncate max-w-[70%]">
          {title}
        </h1>
      </div>
      <div className="px-6 pb-2">
        <div className="h-[3px] w-full rounded-full bg-foreground/10 overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>
    </header>
  );
}

