import { useCallback, useRef } from "react";

/**
 * Hook que gera um som de notificação agradável de ~2 segundos
 * usando Web Audio API — sem arquivos externos necessários.
 * Som tipo "chime" com 3 notas harmônicas ascendentes.
 */
export function useNotificationSound() {
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playNotificationSound = useCallback(() => {
    try {
      // Reutiliza ou cria AudioContext
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new AudioContext();
      }

      const ctx = audioCtxRef.current;

      // Resumir contexto se estiver suspenso (exigência de browsers modernos)
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const now = ctx.currentTime;
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.25, now);
      masterGain.connect(ctx.destination);

      // 3 notas harmônicas ascendentes — chime elegante
      const notes = [
        { freq: 587.33, start: 0, duration: 0.6 },     // D5
        { freq: 739.99, start: 0.25, duration: 0.6 },   // F#5
        { freq: 880.0, start: 0.5, duration: 0.9 },     // A5
      ];

      notes.forEach(({ freq, start, duration }) => {
        // Oscilador principal (sine — suave)
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + start);

        // Envelope ADSR simples
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now + start);
        gain.gain.linearRampToValueAtTime(0.4, now + start + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now + start);
        osc.stop(now + start + duration);

        // Harmônico suave (oitava acima, volume baixo)
        const harmonic = ctx.createOscillator();
        harmonic.type = "sine";
        harmonic.frequency.setValueAtTime(freq * 2, now + start);

        const hGain = ctx.createGain();
        hGain.gain.setValueAtTime(0, now + start);
        hGain.gain.linearRampToValueAtTime(0.08, now + start + 0.05);
        hGain.gain.exponentialRampToValueAtTime(0.001, now + start + duration * 0.7);

        harmonic.connect(hGain);
        hGain.connect(masterGain);
        harmonic.start(now + start);
        harmonic.stop(now + start + duration);
      });

      // Fade out do master
      masterGain.gain.setValueAtTime(0.25, now + 1.2);
      masterGain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
    } catch (error) {
      console.warn("Não foi possível reproduzir som de notificação:", error);
    }
  }, []);

  return { playNotificationSound };
}
