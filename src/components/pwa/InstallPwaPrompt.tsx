import { useEffect, useState } from "react";
import { X, Share, Plus, MoreVertical, Download, Smartphone } from "lucide-react";

const DISMISS_KEY = "pwa_install_dismissed_at";
const DISMISS_DAYS = 7;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Platform = "ios" | "android" | "desktop";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function wasRecentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    const ageDays = (Date.now() - at) / (1000 * 60 * 60 * 24);
    return ageDays < DISMISS_DAYS;
  } catch {
    return false;
  }
}

/**
 * InstallPwaPrompt
 * Card não-bloqueante que aparece uma vez a cada 7 dias sugerindo instalar
 * o app na tela inicial. Instruções específicas por plataforma (iOS/Android).
 * O objetivo é permitir que o banner do perfil passe por trás da status bar
 * (efeito imersivo só funciona em modo standalone).
 */
export function InstallPwaPrompt() {
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [visible, setVisible] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return; // já instalado
    if (wasRecentlyDismissed()) return;

    const p = detectPlatform();
    setPlatform(p);

    // Android/Chrome: espera o evento nativo
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    // iOS Safari não dispara beforeinstallprompt — mostra após pequeno delay
    let timer: number | undefined;
    if (p === "ios") {
      timer = window.setTimeout(() => setVisible(true), 1500);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* noop */
    }
    setVisible(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") setVisible(false);
    dismiss();
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 z-[60] px-3 pointer-events-none"
      style={{
        bottom: "calc(6rem + var(--app-safe-bottom, env(safe-area-inset-bottom, 0px)))",
      }}
    >
      <div className="pointer-events-auto mx-auto max-w-md rounded-2xl border border-border/60 bg-card/95 backdrop-blur-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start gap-3 p-4">
          <div className="h-11 w-11 rounded-xl bg-accent-red/10 flex items-center justify-center shrink-0">
            <Smartphone className="h-5 w-5 text-accent-red" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground leading-tight">
              Instalar o Barbeiros
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
              Tenha o app na tela inicial e experiência tela cheia (banner sob a
              status bar).
            </p>
          </div>
          <button
            onClick={dismiss}
            aria-label="Fechar"
            className="h-7 w-7 -m-1 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted active:scale-95 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body por plataforma */}
        <div className="px-4 pb-4">
          {platform === "android" && (
            <>
              {deferred ? (
                <button
                  onClick={install}
                  className="w-full h-11 rounded-xl bg-accent-red text-white text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition"
                >
                  <Download className="h-4 w-4" />
                  Instalar agora
                </button>
              ) : (
                <ol className="space-y-2 text-xs text-muted-foreground">
                  <Step>
                    Toque no menu <MoreVertical className="inline h-3.5 w-3.5 -mt-0.5" /> do Chrome
                  </Step>
                  <Step>
                    Selecione <b>"Instalar app"</b> ou <b>"Adicionar à tela inicial"</b>
                  </Step>
                  <Step>Confirme para colocar o ícone na tela inicial</Step>
                </ol>
              )}
            </>
          )}

          {platform === "ios" && (
            <ol className="space-y-2 text-xs text-muted-foreground">
              <Step>
                Toque no botão <b>Compartilhar</b>{" "}
                <Share className="inline h-3.5 w-3.5 -mt-0.5" /> na barra do Safari
              </Step>
              <Step>
                Role e escolha <b>"Adicionar à Tela de Início"</b>{" "}
                <Plus className="inline h-3.5 w-3.5 -mt-0.5" />
              </Step>
              <Step>
                Toque em <b>"Adicionar"</b> no canto superior direito
              </Step>
            </ol>
          )}

          {platform === "desktop" && (
            <p className="text-xs text-muted-foreground">
              Abra este site pelo celular (iPhone ou Android) para instalar o app
              na tela inicial.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Step({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="text-accent-red font-bold shrink-0">•</span>
      <span className="leading-snug">{children}</span>
    </li>
  );
}
