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
  /** Permite forçar o estado de pendência ou sobrescrever a mensagem de apoio */
  isPending?: boolean;
  pendingMessage?: string;
  onBlur?: () => void;
}

/**
 * Campo de formulário premium com UX mobile-first e detecção inteligente de pendências.
 * - Borda sutil avermelhada quando obrigatório e vazio
 * - Mensagem explicativa executiva
 * - Scroll automático ao focar
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
  isPending,
  pendingMessage = "Campo obrigatório para emissão de assinaturas e pagamentos",
  onBlur,
}: CompactFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isValueEmpty = !value || value.toString().trim().length === 0;
  const showPendingAlert = isPending !== undefined ? isPending : (required && isValueEmpty);

  /** Scroll suave para garantir que o campo fique visível acima do teclado */
  const handleFocus = useCallback(() => {
    setTimeout(() => {
      inputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    setTimeout(() => {
      inputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 380);
  }, []);

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[13px] text-foreground/80 font-medium block">
          {label}
          {required && (
            <span
              className={cn(
                "ml-1 text-[9px] transition-colors",
                showPendingAlert ? "text-rose-500 font-bold" : "text-foreground/40"
              )}
            >
              ●
            </span>
          )}
        </label>
      </div>

      <div className="relative">
        <input
          ref={inputRef}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={onBlur}
          placeholder={placeholder || label}
          disabled={disabled || loading}
          className={cn(
            "flex w-full rounded-xl border bg-background px-4 text-[14.5px] text-foreground",
            "h-12",
            "transition-all duration-200 outline-none",
            "placeholder:text-muted-foreground/35",
            showPendingAlert
              ? "border-rose-500/60 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/15"
              : "border-border/40 focus:border-foreground/40 focus:ring-2 focus:ring-foreground/5",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        />
        {loading && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
            <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
          </div>
        )}
      </div>

      {showPendingAlert ? (
        <p className="text-[11px] text-rose-500/90 dark:text-rose-400/90 mt-1.5 leading-snug font-normal flex items-center gap-1.5 animate-in fade-in duration-200">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
          <span>{pendingMessage}</span>
        </p>
      ) : hint ? (
        <p className="text-[10.5px] text-muted-foreground/50 mt-1.5 leading-snug">{hint}</p>
      ) : null}
    </div>
  );
}
