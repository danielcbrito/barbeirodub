import { useEffect } from "react";

const DEFAULT_COLOR = "#FAFAFA";
const DARK_APP_COLOR = "#0f0f0f";

const META_NAMES = [
  "theme-color",
  "msapplication-navbutton-color",
  "msapplication-TileColor",
];

function resolveAppBackground() {
  if (typeof document === "undefined") return DEFAULT_COLOR;
  return document.documentElement.classList.contains("dark")
    ? DARK_APP_COLOR
    : DEFAULT_COLOR;
}

function upsertMeta(name: string, content: string) {
  const existing = Array.from(
    document.querySelectorAll<HTMLMetaElement>(`meta[name="${name}"]`),
  );
  const [first, ...duplicates] = existing;
  duplicates.forEach((el) => el.parentNode?.removeChild(el));

  const meta = first || document.createElement("meta");
  meta.name = name;
  meta.content = content;
  if (!first) document.head.appendChild(meta);
}

export function applyStatusBarColor(color: string) {
  if (typeof document === "undefined") return;
  const resolvedColor = color === "app-background" ? resolveAppBackground() : color;

  META_NAMES.forEach((name) => upsertMeta(name, resolvedColor));

  // No iOS Safari, Chrome e PWA standalone ("Adicionar à Tela de Início"):
  upsertMeta("apple-mobile-web-app-status-bar-style", "black-translucent");
  if (resolvedColor === "#0D0D0D" || resolvedColor === "#0A0A0A" || resolvedColor === "#0f0f0f") {
    document.documentElement.style.setProperty("background-color", resolvedColor, "important");
    document.body.style.setProperty("background-color", resolvedColor, "important");
    const rootEl = document.getElementById("root");
    if (rootEl) rootEl.style.setProperty("background-color", resolvedColor, "important");
  } else {
    document.documentElement.style.removeProperty("background-color");
    document.body.style.removeProperty("background-color");
    const rootEl = document.getElementById("root");
    if (rootEl) rootEl.style.removeProperty("background-color");
  }
}

/**
 * useStatusBarColor
 * Atualiza dinamicamente a cor da status bar (theme-color) por tela,
 * removendo duplicatas (iOS lê apenas a primeira meta) e sincronizando
 * o background do html/body para evitar flashes.
 *
 * Uso:
 *   useStatusBarColor("#0A0A0A"); // dentro do componente da tela
 */
export function useStatusBarColor(color: string) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    applyStatusBarColor(color);
    return () => {
      if (typeof window !== "undefined") {
        const path = window.location.pathname;
        if (path.includes("carteira") || path.includes("financeiro")) {
          return;
        }
      }
      applyStatusBarColor("app-background");
    };
  }, [color]);
}
