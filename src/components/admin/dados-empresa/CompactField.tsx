import { useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface CompactFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  loading?: boolean;
  hint?: string;
}

/**
 * Campo de formulário premium com UX mobile-first.
 * - Altura generosa (h-12) para toque confortável
 * - Scroll automático ao focar (evita teclado cobrir o campo)
 * - Label clara e legível
 */
export function CompactField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
  disabled = false,
  loading = false,
  hint,
}: CompactFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isEmpty = required && !value?.trim();

  /** Scroll suave para garantir que o campo fique visível acima do teclado */
  const handleFocus = useCallback(() => {
    setTimeout(() => {
      inputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
  }, []);

  return (
    <div className="relative">
      <label className="text-[11px] text-muted-foreground/70 uppercase tracking-[0.08em] font-semibold block mb-1.5">
        {label}
        {required && <span className="text-primary ml-1 text-[8px]">●</span>}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={handleFocus}
          placeholder={placeholder || label}
          disabled={disabled || loading}
          className={cn(
            "flex w-full rounded-xl border bg-background px-4 text-[15px] text-foreground",
            "h-12",
            "border-border/40",
            "placeholder:text-muted-foreground/30",
            "focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15",
            "transition-all duration-200",
            isEmpty && "border-primary/40",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        />
        {loading && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
            <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
          </div>
        )}
      </div>
      {hint && (
        <p className="text-[10px] text-muted-foreground/40 mt-1.5 leading-snug">{hint}</p>
      )}
    </div>
  );
}
