import { useState, useRef } from "react";
import { Link2, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CopyCodeProps {
  code: string;
  label?: string;
  className?: string;
}

/**
 * Botão 100% minimalista e sério de copiar link/código.
 * Design institucional com feedback instantâneo, ícones precisos
 * e adaptação perfeita aos temas claro e escuro.
 */
function CopyCode({ code, label, className }: CopyCodeProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(code);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = code;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
    } catch {
      // fallback
    }

    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden flex items-center justify-between gap-2.5 bg-card border border-border/60 dark:border-white/[0.08] shadow-xs rounded-2xl px-3.5 h-11 w-full transition-colors",
        className
      )}
    >
      {/* Lado esquerdo: Ícone discreto de link + URL limpa */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <Link2 className="w-4 h-4 text-muted-foreground/70 shrink-0 stroke-[1.8]" />
        <span
          title={label || code}
          className="text-[12.5px] font-mono font-medium text-muted-foreground hover:text-foreground select-all truncate tracking-tight transition-colors"
        >
          {label || code}
        </span>
      </div>

      {/* Lado direito: Botão 100% minimalista apenas com o ícone dos dois papéis */}
      <button
        type="button"
        onClick={handleCopy}
        className={cn(
          "w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-150 active:scale-95 cursor-pointer select-none shrink-0",
          copied
            ? "bg-foreground text-background opacity-85"
            : "bg-foreground text-background hover:opacity-90"
        )}
        aria-label={copied ? "Link copiado" : "Copiar link"}
        title={copied ? "Link copiado!" : "Copiar link"}
      >
        {copied ? (
          <Check className="w-4 h-4 stroke-[2.2]" />
        ) : (
          <Copy className="w-3.5 h-3.5 stroke-[1.9]" />
        )}
      </button>
    </div>
  );
}

export { CopyCode };
export default CopyCode;


