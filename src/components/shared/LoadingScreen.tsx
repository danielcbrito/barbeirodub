/**
 * ═══════════════════════════════════════════════════════════
 * LoadingScreen — Tela de carregamento reutilizável
 * ═══════════════════════════════════════════════════════════
 *
 * Use em qualquer lugar que precise de feedback visual
 * durante carregamento. Nunca deixe uma tela em branco.
 *
 * Variantes:
 *  - fullscreen (padrão): ocupa 100vh, centralizado
 *  - inline: ocupa o espaço do container pai
 */

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingScreenProps {
  /** Mensagem exibida abaixo do spinner */
  message?: string;
  /** fullscreen = 100dvh | inline = se adapta ao container pai */
  variant?: "fullscreen" | "inline";
  /** Classes CSS adicionais */
  className?: string;
}

export function LoadingScreen({
  message = "Carregando...",
  variant = "fullscreen",
  className,
}: LoadingScreenProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 bg-background",
        variant === "fullscreen" ? "min-h-[100dvh]" : "min-h-[200px] w-full",
        className
      )}
    >
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
      {message && (
        <p className="text-sm text-muted-foreground animate-pulse">
          {message}
        </p>
      )}
    </div>
  );
}
