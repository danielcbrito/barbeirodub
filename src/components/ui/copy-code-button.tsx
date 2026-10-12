import { useState, useEffect } from "react";

interface CopyCodeProps {
  code: string;
  label?: string;
}

/**
 * Botão premium de copiar código/link com animação blur + progress.
 * Adapta-se ao tema claro/escuro via tokens semânticos.
 */
export function CopyCode({ code, label }: CopyCodeProps) {
  const [copied, setCopied] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [progress, setProgress] = useState(0);
  const duration = 4000;

  useEffect(() => {
    if (copied) {
      const showTimer = setTimeout(() => setShowConfirmation(true), 400);

      setProgress(0);
      const startTime = Date.now();

      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const newProgress = Math.min((elapsed / duration) * 100, 100);
        setProgress(newProgress);

        if (elapsed >= duration) {
          clearInterval(interval);
          setShowConfirmation(false);
          setTimeout(() => {
            setCopied(false);
            setProgress(0);
          }, 400);
        }
      }, 16);

      return () => {
        clearInterval(interval);
        clearTimeout(showTimer);
      };
    }
  }, [copied]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
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
    setCopied(true);
  };

  return (
    <div
      className="relative overflow-hidden flex items-center justify-center bg-secondary rounded-full px-6 py-2.5 h-12 w-full"
    >
      {/* Progress background */}
      <div
        className="absolute left-0 top-0 bottom-0 bg-muted"
        style={{
          width: `${progress}%`,
          opacity: copied ? 1 : 0,
          transition: "opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />

      {/* Original content */}
      <div
        className="absolute inset-0 flex items-center justify-between pl-5 pr-2"
        style={{
          opacity: copied ? 0 : 1,
          filter: copied ? "blur(12px)" : "blur(0px)",
          transform: copied ? "scale(0.92)" : "scale(1)",
          transition: "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
          pointerEvents: copied ? "none" : "auto",
          zIndex: copied ? 0 : 20,
        }}
      >
        <span className="text-[13px] font-medium tracking-wide text-muted-foreground select-all truncate mr-2">
          {label || code}
        </span>
        <button
          onClick={handleCopy}
          className="bg-background hover:bg-accent text-foreground font-semibold text-[12px] px-5 py-2 rounded-full shadow-sm transition-all duration-300 hover:shadow-md active:scale-95 cursor-pointer select-none shrink-0"
        >
          Copiar
        </button>
      </div>

      {/* Confirmation */}
      <div
        className="relative flex items-center gap-2"
        style={{
          opacity: showConfirmation ? 1 : 0,
          filter: showConfirmation ? "blur(0px)" : "blur(12px)",
          transform: showConfirmation ? "scale(1)" : "scale(1.08)",
          transition: "all 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
          pointerEvents: "none",
          zIndex: 10,
        }}
      >
        <div className="w-6 h-6 bg-foreground rounded-full flex items-center justify-center">
          <svg
            className="w-3.5 h-3.5 text-background"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
              d="M5 13l4 4L19 7"
              style={{
                strokeDasharray: 24,
                strokeDashoffset: showConfirmation ? 0 : 24,
                transition:
                  "stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1) 0.3s",
              }}
            />
          </svg>
        </div>
        <span className="text-[14px] font-semibold text-foreground">
          Link copiado!
        </span>
      </div>
    </div>
  );
}
