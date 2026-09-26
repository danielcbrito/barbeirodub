/**
 * ═══════════════════════════════════════════════════════════
 * ErrorScreen — Tela de erro reutilizável
 * ═══════════════════════════════════════════════════════════
 *
 * Use para estados de erro em qualquer módulo.
 * Sempre ofereça ação de retry quando possível.
 *
 * Variantes:
 *  - fullscreen (padrão): ocupa 100vh
 *  - inline: se adapta ao container pai
 */

import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorScreenProps {
  /** Título do erro */
  title?: string;
  /** Descrição detalhada */
  message?: string;
  /** Callback para tentar novamente */
  onRetry?: () => void;
  /** Texto do botão de retry */
  retryLabel?: string;
  /** fullscreen = 100dvh | inline = adapta ao container */
  variant?: "fullscreen" | "inline";
  /** Classes CSS adicionais */
  className?: string;
}

export function ErrorScreen({
  title = "Algo deu errado",
  message = "Tente novamente em alguns instantes.",
  onRetry,
  retryLabel = "Tentar novamente",
  variant = "fullscreen",
  className,
}: ErrorScreenProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 bg-background text-center px-6",
        variant === "fullscreen" ? "min-h-[100dvh]" : "min-h-[200px] w-full py-12",
        className
      )}
    >
      {/* Ícone de alerta com glow sutil */}
      <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
        <AlertTriangle className="w-7 h-7 text-destructive" />
      </div>

      {/* Texto */}
      <div className="space-y-1.5 max-w-xs">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
      </div>

      {/* Retry */}
      {onRetry && (
        <Button
          onClick={onRetry}
          variant="outline"
          size="sm"
          className="mt-2 gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
