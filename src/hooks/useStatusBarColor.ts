import { useEffect } from "react";

const DEFAULT_COLOR = "#FFFFFF";
const DARK_APP_COLOR = "#0A0A0A";

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
  // NÃO forçamos background inline em html/body — isso sobrescreve o fundo
  // real do app (banner do perfil, temas, etc.) e cria a "faixa" no topo do
  // iPhone quando o app roda em PWA standalone com black-translucent.
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
  }, [color]);
}
