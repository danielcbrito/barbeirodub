import { useEffect, useState } from "react";
import { X, Share, Plus, MoreVertical, Download, Smartphone, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Platform = "ios" | "android" | "desktop";

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1)) {
    return "ios";
  }
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

export function isAppInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}

/**
 * InstallPwaPrompt
 * Banner e modal de instalação de alta fidelidade Apple HIG.
 * Quando acessado pelo Safari ou Chrome (fora do modo standalone),
 * exibe opção clara para instalar o aplicativo no iPhone e Android.
 */
export function InstallPwaPrompt() {
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [isStandalone, setIsStandalone] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<"ios" | "android">("ios");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const installed = isAppInstalled();
    setIsStandalone(installed);
    if (installed) return; // Já está rodando como app instalado

    const p = detectPlatform();
    setPlatform(p);
    setSelectedPlatform(p === "android" ? "android" : "ios");

    // Mostra banner inicial após pequeno respiro
    const timer = window.setTimeout(() => {
      const dismissed = sessionStorage.getItem("pwa_install_banner_closed");
      if (!dismissed) {
        setBannerVisible(true);
      }
    }, 1200);

    // Captura evento de instalação nativo no Android / Chrome
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    // Escuta evento global para abrir o modal de instalação a partir de qualquer botão no app
    const handleOpenModal = () => {
      setModalOpen(true);
    };
    window.addEventListener("open-pwa-install", handleOpenModal);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("open-pwa-install", handleOpenModal);
    };
  }, []);

  // Auto-dismiss após 18 segundos para não incomodar o barbeiro
  useEffect(() => {
    if (!bannerVisible || modalOpen) return;

    const autoCloseTimer = window.setTimeout(() => {
      setBannerVisible(false);
      try {
        sessionStorage.setItem("pwa_install_banner_closed", "1");
      } catch {
        /* ignore */
      }
    }, 18000); // 18 segundos

    return () => {
      window.clearTimeout(autoCloseTimer);
    };
  }, [bannerVisible, modalOpen]);

  const handleDismissBanner = () => {
    setBannerVisible(false);
    try {
      sessionStorage.setItem("pwa_install_banner_closed", "1");
    } catch {
      /* ignore */
    }
  };

  const handleAndroidInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setModalOpen(false);
        setBannerVisible(false);
      }
    }
  };

  if (isStandalone) return null;

  return (
    <>
      {/* ─── BANNER FLUTUANTE DISCRETO (NO SAFARI / CHROME) ─── */}
      {bannerVisible && !modalOpen && (
        <div
          className="fixed top-2 left-1/2 -translate-x-1/2 z-[70] w-[calc(100%-1.25rem)] max-w-md pointer-events-none animate-in fade-in slide-in-from-top-4 duration-300"
          style={{
            marginTop: "max(var(--app-safe-top, env(safe-area-inset-top, 0px)), 4px)",
          }}
        >
          <div className="pointer-events-auto flex items-center justify-between gap-3 p-2.5 sm:p-3 rounded-2xl bg-card/95 dark:bg-[#18181c]/95 border border-border/80 shadow-[0_12px_36px_rgba(0,0,0,0.18)] backdrop-blur-xl">
            <div
              className="flex items-center gap-3 min-w-0 cursor-pointer flex-1"
              onClick={() => setModalOpen(true)}
            >
              <img
                src="/app-icon.png"
                alt="Ícone Barbeiros"
                className="w-10 h-10 rounded-xl object-cover border border-border/40 shadow-xs shrink-0"
              />
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-foreground leading-tight truncate">
                  Instalar Barbeiros
                </p>
                <p className="text-[11.5px] text-muted-foreground truncate leading-snug">
                  Tela cheia e acesso rápido sem Safari
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="px-3.5 py-1.5 rounded-full bg-foreground text-background text-[12px] font-semibold tracking-tight shadow-xs active:scale-95 transition-all cursor-pointer"
              >
                Instalar
              </button>
              <button
                type="button"
                onClick={handleDismissBanner}
                aria-label="Fechar aviso"
                className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground/80 hover:text-foreground active:scale-90 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL DE INSTALAÇÃO APPLE HIG (IPHONE & ANDROID) ─── */}
      {modalOpen && (
        <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
          <div
            className="w-full max-w-md rounded-t-[28px] sm:rounded-[28px] bg-card dark:bg-[#141418] border border-border/80 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 duration-300 max-h-[92vh] flex flex-col"
            style={{
              paddingBottom: "max(var(--app-safe-bottom, env(safe-area-inset-bottom, 0px)), 16px)",
            }}
          >
            {/* Header */}
            <div className="relative flex items-center justify-between p-4 pb-3 border-b border-border/40">
              <div className="flex items-center gap-3">
                <img
                  src="/app-icon.png"
                  alt="App Icon"
                  className="w-11 h-11 rounded-2xl border border-border/40 shadow-xs"
                />
                <div>
                  <h3 className="text-[16px] font-semibold text-foreground leading-tight">
                    Instalar no seu celular
                  </h3>
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    Aplicativo oficial Barbearia DUB
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="w-8 h-8 rounded-full bg-secondary/80 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-95 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Seletor de Plataforma (Segmented Control Apple) */}
            <div className="p-4 pb-2">
              <div className="grid grid-cols-2 p-1 rounded-full bg-secondary/60 border border-border/40">
                <button
                  type="button"
                  onClick={() => setSelectedPlatform("ios")}
                  className={cn(
                    "h-9 rounded-full text-[13px] font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                    selectedPlatform === "ios"
                      ? "bg-foreground text-background font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="text-[14px]">🍏</span>
                  <span>iPhone (iOS)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPlatform("android")}
                  className={cn(
                    "h-9 rounded-full text-[13px] font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                    selectedPlatform === "android"
                      ? "bg-foreground text-background font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="text-[14px]">🤖</span>
                  <span>Android</span>
                </button>
              </div>
            </div>

            {/* Conteúdo específico da plataforma */}
            <div className="px-4 py-3 overflow-y-auto space-y-4">
              {selectedPlatform === "ios" ? (
                <>
                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-[12.5px] leading-relaxed flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      Instalando na tela de início, o app abre em <b>tela cheia nativa</b>, sem as barras do Safari e sem cortes no rodapé.
                    </span>
                  </div>

                  <div className="space-y-3">
                    {/* Passo 1 */}
                    <div className="flex items-start gap-3 p-3 rounded-2xl border border-border/50 bg-secondary/25">
                      <div className="w-8 h-8 rounded-full bg-blue-500/15 text-blue-500 flex items-center justify-center shrink-0 font-semibold text-[13px]">
                        1
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
                          Toque no botão Compartilhar
                          <Share className="w-4 h-4 text-blue-500 inline" />
                        </p>
                        <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-snug">
                          Fica na barra inferior do Safari (o quadrado com uma seta para cima).
                        </p>
                      </div>
                    </div>

                    {/* Passo 2 */}
                    <div className="flex items-start gap-3 p-3 rounded-2xl border border-border/50 bg-secondary/25">
                      <div className="w-8 h-8 rounded-full bg-foreground/10 text-foreground flex items-center justify-center shrink-0 font-semibold text-[13px]">
                        2
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
                          Role e toque em "Adicionar à Tela de Início"
                          <Plus className="w-4 h-4 text-foreground inline" />
                        </p>
                        <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-snug">
                          Procure o item com o ícone quadrado com um sinal de mais (+).
                        </p>
                      </div>
                    </div>

                    {/* Passo 3 */}
                    <div className="flex items-start gap-3 p-3 rounded-2xl border border-border/50 bg-secondary/25">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0 font-semibold text-[13px]">
                        3
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-foreground">
                          Toque em "Adicionar" no topo direito
                        </p>
                        <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-snug">
                          O ícone do Barbeiros aparecerá automaticamente na tela do seu iPhone.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Seta animada pulsante apontando para a barra do Safari */}
                  <div className="pt-2 text-center">
                    <p className="text-[11px] font-medium text-muted-foreground animate-bounce">
                      👇 Toque no botão de compartilhar do Safari logo abaixo
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-[12.5px] leading-relaxed flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      Instale com 1 clique para receber notificações em tempo real e acessar sem abrir o Chrome.
                    </span>
                  </div>

                  {deferredPrompt ? (
                    <button
                      type="button"
                      onClick={handleAndroidInstall}
                      className="w-full h-12 rounded-full bg-foreground text-background font-semibold text-[14px] flex items-center justify-center gap-2 shadow-md active:scale-98 transition-all cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      Instalar aplicativo agora
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-start gap-3 p-3 rounded-2xl border border-border/50 bg-secondary/25">
                        <div className="w-8 h-8 rounded-full bg-foreground/10 text-foreground flex items-center justify-center shrink-0 font-semibold text-[13px]">
                          1
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
                            Toque no menu do Chrome
                            <MoreVertical className="w-4 h-4 text-foreground inline" />
                          </p>
                          <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-snug">
                            Toque nos três pontinhos no canto superior direito do navegador.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 p-3 rounded-2xl border border-border/50 bg-secondary/25">
                        <div className="w-8 h-8 rounded-full bg-foreground/10 text-foreground flex items-center justify-center shrink-0 font-semibold text-[13px]">
                          2
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold text-foreground">
                            Selecione "Instalar aplicativo" ou "Adicionar à tela inicial"
                          </p>
                          <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-snug">
                            O Android criará o app automaticamente na sua tela principal.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 pt-2 border-t border-border/30">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="w-full h-11 rounded-full bg-secondary hover:bg-secondary/80 text-foreground text-[13px] font-medium transition-all cursor-pointer active:scale-98"
              >
                Entendi, fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
