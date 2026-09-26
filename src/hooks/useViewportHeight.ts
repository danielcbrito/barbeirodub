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
    if (typeof window === "undefined") return { h: 0, vh: 0, kb: false, offset: 0 };
    const vv = window.visualViewport;
    const h = getStableHeight();
    const vh = vv ? vv.height : h;
    const offset = Math.max(0, h - vh);
    const kb = offset > 140;
    return { h, vh, kb, offset };
  };

  const initial = getInitial();
  const [height, setHeight] = useState<string>(`${initial.h}px`);
  const [visualHeight, setVisualHeight] = useState<string>(`${initial.vh}px`);
  const [keyboardOpen, setKeyboardOpen] = useState<boolean>(initial.kb);
  const [keyboardOffset, setKeyboardOffset] = useState<number>(initial.offset);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;

    const update = () => {
      const h = getStableHeight();
      const vh = vv ? vv.height : h;
      const offset = Math.max(0, h - vh);
      const kb = offset > 140;
      setHeight(`${h}px`);
      setVisualHeight(`${vh}px`);
      setKeyboardOpen(kb);
      setKeyboardOffset(offset);
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

  return { height, visualHeight, keyboardOpen, keyboardOffset };
}
