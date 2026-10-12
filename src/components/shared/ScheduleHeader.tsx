import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

/** Seta curva padrão do sistema (mesma das telas de configuração de dia). */
export function CurvedBackArrow({ className }: { className?: string }) {
  return (
    <svg
      width="26" height="26" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      className={className}
    >
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a4 4 0 0 1 4 4v1" />
    </svg>
  );
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
 * Header padrão das telas de horário: seta curva à esquerda + título alinhado
 * ao lado dela, igual ao que aparece ao entrar em um dia da semana.
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
          className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-secondary/50 active:scale-95 transition-all -ml-1 shrink-0"
        >
          <CurvedBackArrow className="text-foreground" />
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
