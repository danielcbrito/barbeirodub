import { useEffect, useState } from "react";

/**
 * useViewportHeight
 * Rastreia uma altura ESTÁVEL do app e detecta teclado separadamente.
 * No iPhone, usar visualViewport.height como altura do container cria uma
 * sobra vazia embaixo e empurra a tela para cima quando a barra/teclado muda.
 *
 * Uso:
 *   const { height, keyboardOpen } = useViewportHeight();
 *   <div style={{ height }}>...</div>
 */
export function useViewportHeight() {
  const getStableHeight = () => {
    if (typeof window === "undefined") return 0;
    const cssHeight = parseFloat(
      document.documentElement.style.getPropertyValue("--app-height"),
    );
    return Math.max(window.innerHeight, cssHeight || 0);
  };

  const getInitial = () => {
    if (typeof window === "undefined") return { h: 0, kb: false };
    const vv = window.visualViewport;
    const h = getStableHeight();
    const kb = vv ? h - vv.height > 150 : false;
    return { h, kb };
  };

  const initial = getInitial();
  const [height, setHeight] = useState<string>(`${initial.h}px`);
  const [keyboardOpen, setKeyboardOpen] = useState<boolean>(initial.kb);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;

    const update = () => {
      const h = getStableHeight();
      const kb = vv ? h - vv.height > 150 : false;
      setHeight(`${h}px`);
      setKeyboardOpen(kb);
    };

    update();

    if (vv) {
      vv.addEventListener("resize", update);
      vv.addEventListener("scroll", update);
    }
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);

    return () => {
      if (vv) {
        vv.removeEventListener("resize", update);
        vv.removeEventListener("scroll", update);
      }
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return { height, keyboardOpen };
}
