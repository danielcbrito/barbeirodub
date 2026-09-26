import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Não registramos mais /sw.js no boot do app.
// Ele agora é apenas um kill-switch para limpar caches antigos que causavam
// tela branca em alguns celulares. Notificações usam /firebase-messaging-sw.js
// quando o usuário ativa permissão de push.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
      let removedLegacyWorker = false;

      await Promise.allSettled(registrations.map((registration) => {
        const scriptUrl = registration.active?.scriptURL || registration.installing?.scriptURL || registration.waiting?.scriptURL || "";
        if (scriptUrl.endsWith("/sw.js") || scriptUrl.endsWith("/service-worker.js")) {
          removedLegacyWorker = true;
          return registration.unregister();
        }
        return Promise.resolve(false);
      }));

      if ("caches" in window) {
        const cacheNames = await caches.keys();
        await Promise.allSettled(
          cacheNames
            .filter((name) => /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-/.test(name))
            .map((name) => caches.delete(name)),
        );
      }

      if (removedLegacyWorker && navigator.serviceWorker.controller) {
        try {
          const reloadKey = "dub_legacy_sw_cleanup_reloaded";
          if (!sessionStorage.getItem(reloadKey)) {
            sessionStorage.setItem(reloadKey, "1");
            window.location.reload();
          }
        } catch {
          window.location.reload();
        }
      }
    }).catch((err) => {
      console.warn("SW cleanup failed:", err);
    });
  });
}

// Detecta plataforma (iOS/Android) e contexto (standalone/browser) uma vez.
// Isso permite comportamentos distintos para 4 contextos:
//   1) iPhone PWA (standalone)    -> NÃO reserva espaço embaixo; só sangra o fundo da nav
//   2) iPhone Safari (browser)    -> reserva respiro extra pra barra do Safari
//   3) Android PWA (standalone)   -> comportamento base atual
//   4) Android browser            -> safe-area mínima
const ua = navigator.userAgent || "";
const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1);
const isAndroid = /Android/.test(ua);
const isStandalone =
  window.matchMedia?.("(display-mode: standalone)").matches ||
  (navigator as any).standalone === true;

const DARK_APP_BACKGROUND = "#0c1014";
const LIGHT_APP_BACKGROUND = "#F4F5F7";

const platformClass = isIOS
  ? (isStandalone ? "platform-ios-pwa" : "platform-ios-browser")
  : isAndroid
    ? (isStandalone ? "platform-android-pwa" : "platform-android-browser")
    : "platform-other";
document.documentElement.classList.add(platformClass);
document.documentElement.dataset.platform = platformClass;

const syncViewportVars = () => {
  const root = document.documentElement;
  const layoutHeight = window.innerHeight;
  const visualHeight = window.visualViewport?.height || layoutHeight;
  const keyboardOffset = Math.max(0, layoutHeight - visualHeight);

  root.style.setProperty("--sat", `env(safe-area-inset-top, 0px)`);
  root.style.setProperty("--sar", `env(safe-area-inset-right, 0px)`);
  root.style.setProperty("--sab", `env(safe-area-inset-bottom, 0px)`);
  root.style.setProperty("--sal", `env(safe-area-inset-left, 0px)`);
  root.style.setProperty("--app-safe-top", "var(--sat)");
  root.style.setProperty("--app-safe-right", "var(--sar)");
  root.style.setProperty("--app-safe-left", "var(--sal)");
  root.style.setProperty("--app-bottom-nav-bleed", "0px");
  root.style.setProperty("--app-bottom-nav-offset", "0px");

  // --app-safe-bottom = espaço para controles inferiores
  // No iPhone agora usamos a mesma altura compacta e elegante do Android (8px),
  // eliminando o vão excessivo de 34px que empurrava e espremia o app para cima no iOS.
  let safeBottom: string;
  if (isIOS && isStandalone) {
    safeBottom = "8px";
  } else if (isIOS) {
    safeBottom = "8px";
  } else if (isAndroid && isStandalone) {
    safeBottom = "max(env(safe-area-inset-bottom, 0px), 8px)";
  } else if (isAndroid) {
    safeBottom = "max(env(safe-area-inset-bottom, 0px), 8px)";
  } else {
    safeBottom = "8px";
  }
  root.style.setProperty("--app-safe-bottom", safeBottom);

  root.style.setProperty("--vh", `${layoutHeight * 0.01}px`);
  root.style.setProperty("--app-height", `${layoutHeight}px`);
  root.style.setProperty("--kb-viewport-height", `${visualHeight}px`);
  root.style.setProperty("--kb-offset", `${keyboardOffset}px`);

  if (keyboardOffset > 140) {
    root.classList.add("keyboard-open");
    root.style.setProperty("--kb-state", "open");
  } else {
    root.classList.remove("keyboard-open");
    root.style.setProperty("--kb-state", "closed");
  }
};

const scrollActiveInputIntoView = (el?: Element | null) => {
  const target = (el || document.activeElement) as HTMLElement | null;
  if (!target) return;
  const isInput = target.matches?.("input, textarea, select, [contenteditable='true']");
  if (!isInput) return;

  try {
    target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  } catch {
    target.scrollIntoView(false);
  }
};

const scheduleViewportSync = () => {
  syncViewportVars();
  requestAnimationFrame(syncViewportVars);
  window.setTimeout(syncViewportVars, 250);
  window.setTimeout(syncViewportVars, 800);
};

scheduleViewportSync();
window.addEventListener("resize", scheduleViewportSync);
window.addEventListener("orientationchange", scheduleViewportSync);
window.addEventListener("pageshow", scheduleViewportSync);
window.addEventListener("focus", scheduleViewportSync);
document.addEventListener("visibilitychange", scheduleViewportSync);
document.addEventListener("fullscreenchange", scheduleViewportSync);

// Auto-recentralização suave em todo o app quando qualquer campo de texto ganha foco
document.addEventListener("focusin", (e) => {
  const target = e.target as HTMLElement | null;
  if (!target || !target.matches?.("input, textarea, select, [contenteditable='true']")) return;
  window.setTimeout(() => scrollActiveInputIntoView(target), 280);
});

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", () => {
    scheduleViewportSync();
    const active = document.activeElement;
    if (active && active.matches?.("input, textarea, select, [contenteditable='true']")) {
      window.setTimeout(() => scrollActiveInputIntoView(active), 120);
    }
  });
  window.visualViewport.addEventListener("scroll", scheduleViewportSync);
}

// Mantém o background inline de <html>/<body> em sincronia com o tema ativo.
// O boot script em index.html define uma cor inicial no primeiro paint; sem esta
// sincronia, alternar entre claro/escuro deixa uma faixa branca visível abaixo
// da bottom nav (áreas do safe-area/home indicator) porque o inline style antigo
// permanece.
const syncThemeBackground = () => {
  const isDark = document.documentElement.classList.contains("dark");
  const color = isDark ? DARK_APP_BACKGROUND : LIGHT_APP_BACKGROUND;
  document.documentElement.style.backgroundColor = color;
  if (document.body) document.body.style.backgroundColor = color;
  ["theme-color", "msapplication-navbutton-color", "msapplication-TileColor"].forEach((name) => {
    const meta = document.querySelector(`meta[name="${name}"]`);
    if (meta) meta.setAttribute("content", color);
  });
};
syncThemeBackground();
const themeObserver = new MutationObserver(syncThemeBackground);
themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

createRoot(document.getElementById("root")!).render(<App />);

window.setTimeout(() => {
  (window as typeof window & { __DUB_APP_READY__?: boolean }).__DUB_APP_READY__ = true;
}, 0);
