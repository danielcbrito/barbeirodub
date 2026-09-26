import { useEffect, useRef, ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface FullScreenOverlayProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Se true, esconde o botão X (útil quando o conteúdo já tem header próprio) */
  hideCloseButton?: boolean;
}

/**
 * Overlay full-screen que intercepta o "voltar" do sistema (gesto iOS / botão Android).
 *
 * Padrão:
 * 1. Portal em document.body (z-index 9999)
 * 2. pushState ao abrir, popstate ao fechar
 * 3. closedRef evita dupla execução
 * 4. Cleanup remove listener + consome a entrada do histórico se necessário
 */
export function FullScreenOverlay({
  open,
  onClose,
  title,
  children,
  hideCloseButton = false,
}: FullScreenOverlayProps) {
  const closedRef = useRef(false);
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!open) return;

    closedRef.current = false;

    // 1. Empurra uma entrada no histórico marcada com nossa flag
    const overlayState = { __overlay_key: true, __overlay_id: Date.now() };
    window.history.pushState(overlayState, "", window.location.href);
    pushedRef.current = true;

    // 2. Bloqueia scroll do body enquanto o overlay estiver aberto
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // 3. Listener de popstate: fecha o overlay em vez de sair da tela
    const handlePopState = (e: PopStateEvent) => {
      if (closedRef.current) return;
      closedRef.current = true;
      pushedRef.current = false; // já foi consumida pelo navegador

      // Impede que outros listeners (router, outros overlays) também reajam
      e.stopImmediatePropagation();

      onClose();
    };

    // ESC também fecha (desktop)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !closedRef.current) {
        e.stopPropagation();
        handleManualClose();
      }
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow;

      // Se o overlay foi fechado por outro motivo (unmount pai, etc.)
      // e a entrada do histórico ainda existe, consumimos ela.
      if (pushedRef.current && !closedRef.current) {
        pushedRef.current = false;
        closedRef.current = true;
        window.history.back();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Fechamento manual (botão X): consome a entrada do histórico via back() */
  const handleManualClose = () => {
    if (closedRef.current) return;
    closedRef.current = true;

    if (pushedRef.current) {
      pushedRef.current = false;
      // Dispara popstate; nosso listener já foi removido no cleanup do effect anterior
      // então chamamos onClose diretamente para evitar race condition.
      window.history.back();
    }
    onClose();
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-background text-foreground flex flex-col animate-in fade-in duration-200 pt-[env(safe-area-inset-top)]"
      style={{
        zIndex: 9999,
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {(title || !hideCloseButton) && (
        <header className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
          <h2 className="text-base font-semibold truncate">{title}</h2>
          {!hideCloseButton && (
            <button
              type="button"
              onClick={handleManualClose}
              className="p-2 -mr-2 rounded-full hover:bg-muted transition-colors"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" strokeWidth={2.25} />
            </button>
          )}
        </header>
      )}

      <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------------ */
/* Exemplo de uso:

import { useState } from "react";
import { FullScreenOverlay } from "@/components/ui/FullScreenOverlay";

export function ExemploCancelamento() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Cancelar corte</button>
      <FullScreenOverlay
        open={open}
        onClose={() => setOpen(false)}
        title="Cancelar agendamento"
      >
        <div className="p-4 space-y-4">
          <p>Tem certeza que deseja cancelar?</p>
          <button className="w-full py-3 rounded-lg bg-destructive text-destructive-foreground">
            Confirmar cancelamento
          </button>
        </div>
      </FullScreenOverlay>
    </>
  );
}
*/
