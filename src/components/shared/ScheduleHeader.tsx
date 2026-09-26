import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { ChevronLeft } from 'lucide-react';

/** Seta padrão do sistema (ChevronLeft com traço 2.2). */
export function CurvedBackArrow({ className }: { className?: string }) {
  return <ChevronLeft className={cn("w-6 h-6 stroke-[2.2]", className)} />;
}

interface ScheduleHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backTo?: string;
  right?: React.ReactNode;
  className?: string;
}

/**
 * Header padrão das telas: seta padrão à esquerda + título alinhado
 * ao lado dela.
 */
export function ScheduleHeader({ title, subtitle, onBack, backTo, right, className }: ScheduleHeaderProps) {
  const navigate = useNavigate();
  const handleBack = () => {
    if (onBack) return onBack();
    if (backTo) return navigate(backTo);
    if (window.history.length > 1) navigate(-1);
  };

  return (
    <header
      className={cn('sticky top-0 z-30 bg-background/95 backdrop-blur-md px-4', className)}
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto flex w-full max-w-md items-center gap-1.5 min-h-[56px]">
        <button
          type="button"
          onClick={handleBack}
          aria-label="Voltar"
          className="w-9 h-9 rounded-full bg-secondary/80 hover:bg-secondary active:scale-95 transition-all shrink-0 text-foreground flex items-center justify-center border border-border/30"
        >
          <ChevronLeft className="w-5 h-5 stroke-[2.2]" />
        </button>

        <div className="flex-1 min-w-0">
          <h1 className="text-[20px] font-semibold text-foreground tracking-tight leading-none truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground/60 mt-1.5 truncate">{subtitle}</p>
          )}
        </div>

        {right && <div className="shrink-0">{right}</div>}
      </div>
    </header>
  );
}
