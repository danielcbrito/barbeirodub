import { ReactNode, forwardRef, InputHTMLAttributes, ButtonHTMLAttributes, useId, useState } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

/**
 * App Shell — Design system unificado baseado na tela inicial (Auth.tsx).
 * Use estes primitivos em toda tela do app para garantir conforto e consistência
 * em Safari iOS, Chrome Android e desktop.
 */

/* ══════════ AppHeader ══════════
 * Header padrão: chevron voltar à esquerda + título centralizado + progress opcional.
 * Respeita safe-area-top.
 */
interface AppHeaderProps {
  title: string;
  onBack?: () => void;
  backTo?: string;
  hideBack?: boolean;
  right?: ReactNode;
  progress?: { current: number; total: number };
  className?: string;
}

export function AppHeader({ title, onBack, backTo, hideBack, right, progress, className }: AppHeaderProps) {
  const navigate = useNavigate();
  const handleBack = () => {
    if (onBack) return onBack();
    if (backTo) return navigate(backTo);
    if (window.history.length > 1) navigate(-1);
  };
  const pct = progress ? Math.max(0, Math.min(100, (progress.current / progress.total) * 100)) : 0;

  return (
    <header
      className={cn("sticky top-0 z-30 bg-background/95 backdrop-blur-md", className)}
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="relative flex h-14 items-center justify-center px-4">
        {!hideBack && (
          <button
            type="button"
            onClick={handleBack}
            aria-label="Voltar"
            className="absolute left-3 flex h-10 w-10 items-center justify-center rounded-full text-foreground/85 active:scale-95 transition-transform"
          >
            <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
          </button>
        )}
        <h1 className="text-[15px] font-semibold text-foreground truncate max-w-[70%]">{title}</h1>
        {right && <div className="absolute right-3 flex items-center">{right}</div>}
      </div>
      {progress && (
        <div className="px-6 pb-2">
          <div className="h-[3px] w-full rounded-full bg-foreground/10 overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </header>
  );
}

/* ══════════ ScreenShell ══════════
 * Wrapper de tela mobile-first: fundo, scroll vertical, padding lateral padrão,
 * safe-area, e reserva de espaço para CTA fixo opcional.
 */
interface ScreenShellProps {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Reserva espaço inferior extra para CTAs fixos externos (bottom nav já é tratado pelo MobileShell) */
  bottomReserve?: number;
}

export function ScreenShell({ children, header, footer, className, contentClassName, bottomReserve = 0 }: ScreenShellProps) {
  return (
    <div className={cn("flex min-h-[100dvh] flex-col bg-background text-foreground", className)}>
      {header}
      <main
        className={cn("flex-1 overflow-y-auto px-4", contentClassName)}
        style={{ paddingBottom: `calc(${bottomReserve}px + env(safe-area-inset-bottom))` }}
      >
        {children}
      </main>
      {footer}
    </div>
  );
}

/* ══════════ FloatingInput ══════════
 * Input com label flutuante — mesmo padrão da tela inicial.
 */
interface FloatingInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label: string;
  error?: string;
  rightSlot?: ReactNode;
}

export const FloatingInput = forwardRef<HTMLInputElement, FloatingInputProps>(
  ({ label, error, rightSlot, className, id, value, ...rest }, ref) => {
    const autoId = useId();
    const inputId = id || autoId;
    const [focused, setFocused] = useState(false);
    const hasValue = value !== undefined && value !== null && String(value).length > 0;
    const floated = focused || hasValue;

    return (
      <div className="w-full">
        <div
          className={cn(
            "relative rounded-2xl transition-colors bg-foreground/[0.04]",
            error ? "ring-1 ring-destructive" : focused ? "ring-2 ring-foreground" : "ring-1 ring-transparent",
            className,
          )}
        >
          <label
            htmlFor={inputId}
            className={cn(
              "pointer-events-none absolute left-5 transition-all",
              floated ? "top-2 text-[11px] font-medium text-foreground/60" : "top-1/2 -translate-y-1/2 text-[15px] text-foreground/50",
            )}
          >
            {label}
          </label>
          <input
            ref={ref}
            id={inputId}
            value={value}
            onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
            onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
            className={cn(
              "peer h-[64px] w-full rounded-2xl bg-transparent px-5 pt-5 pb-1 text-[15px] font-medium text-foreground outline-none",
              rightSlot && "pr-14",
            )}
            {...rest}
          />
          {rightSlot && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">{rightSlot}</div>
          )}
        </div>
        {error && <p className="mt-2 px-1 text-[13px] font-medium text-destructive">{error}</p>}
      </div>
    );
  },
);
FloatingInput.displayName = "FloatingInput";

/* ══════════ PrimaryCta ══════════
 * Botão principal — inline ou fixo no rodapé.
 */
interface PrimaryCtaProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  variant?: "primary" | "secondary" | "ghost";
}

export function PrimaryCta({ loading, disabled, children, className, variant = "primary", ...rest }: PrimaryCtaProps) {
  const styles = {
    primary: "bg-foreground text-background",
    secondary: "bg-foreground/[0.06] text-foreground",
    ghost: "bg-transparent text-foreground border border-foreground/20",
  }[variant];

  return (
    <button
      disabled={disabled || loading}
      className={cn(
        "flex h-[48px] w-full items-center justify-center gap-2 rounded-xl font-semibold text-[15px] transition-transform active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed",
        styles,
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

/* ══════════ StickyFooter ══════════
 * Rodapé fixo com backdrop-blur, safe-area, e offset opcional para bottom nav.
 * Ideal para CTAs que devem estar sempre visíveis.
 */
interface StickyFooterProps {
  children: ReactNode;
  className?: string;
  /** Se true, adiciona offset para não colar na bottom nav principal do app (~5rem) */
  aboveBottomNav?: boolean;
  show?: boolean;
}

export function StickyFooter({ children, className, aboveBottomNav = false, show = true }: StickyFooterProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className={cn(
            "fixed inset-x-0 bottom-0 z-40 border-t border-border/40 bg-background/90 backdrop-blur-md px-4 pt-3",
            className,
          )}
          style={{
            paddingBottom: aboveBottomNav
              ? "calc(env(safe-area-inset-bottom) + 5rem + 12px)"
              : "calc(env(safe-area-inset-bottom) + 12px)",
          }}
        >
          <div className="mx-auto w-full max-w-lg">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
