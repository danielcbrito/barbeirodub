import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Restauração de scroll estilo nativo:
 *  - PUSH/REPLACE (navegação forward): scroll ao topo (instantâneo)
 *  - POP (back/forward do sistema): restaura a posição salva
 *
 * Desativa o comportamento automático do browser para evitar conflitos.
 */
export function ScrollRestoration() {
  const location = useLocation();
  const navType = useNavigationType();
  const positions = useRef<Map<string, number>>(new Map());
  const prevKey = useRef<string>(location.key);

  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  useEffect(() => {
    // Salva posição da rota anterior antes de trocar
    return () => {
      positions.current.set(prevKey.current, window.scrollY);
      prevKey.current = location.key;
    };
  }, [location.key]);

  useEffect(() => {
    if (navType === "POP") {
      const saved = positions.current.get(location.key) ?? 0;
      window.scrollTo({ top: saved, behavior: "auto" });
    } else {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [location.key, navType]);

  return null;
}
