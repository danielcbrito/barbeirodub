import { useEffect, useRef } from "react";

/**
 * Hook utilitário para executar um callback em intervalos.
 * - Mantém a referência do callback atualizada (evita closures "stale")
 * - Permite pausar passando `delay=null`
 */
export function useInterval(callback: () => void, delay: number | null) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;

    const intervalId = window.setInterval(() => {
      callbackRef.current();
    }, delay);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [delay]);
}
