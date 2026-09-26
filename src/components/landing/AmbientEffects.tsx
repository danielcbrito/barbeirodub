import { motion } from "framer-motion";

/** Configuração dos blobs pulsantes de glow */
const GLOWS = [
  { top: "0%",  left: "60%", size: 120, delay: 0.3, dur: 8 },
  { top: "25%", left: "-5%", size: 150, delay: 0.7, dur: 10 },
  { top: "50%", left: "65%", size: 100, delay: 1.0, dur: 7 },
  { top: "10%", left: "80%", size: 80,  delay: 1.2, dur: 9 },
  { top: "65%", left: "5%",  size: 90,  delay: 0.5, dur: 11 },
  { top: "35%", left: "40%", size: 160, delay: 0.9, dur: 12 },
];

/**
 * Efeitos visuais ambientais da landing page.
 * Inclui: gradiente vermelho topo, pontos decorativos, colinas SVG,
 * blobs de glow pulsantes, glows grandes e vinheta.
 */
export function AmbientEffects() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
      {/* Gradiente vermelho no topo */}
      <div
        className="absolute left-0 right-0 top-0"
        style={{
          height: "40%",
          background:
            "linear-gradient(to bottom, hsl(var(--primary) / 0.07) 0%, hsl(var(--primary) / 0.02) 40%, transparent 100%)",
        }}
      />

      {/* Pontos vermelhos decorativos nas laterais */}
      {[
        { top: "12%", left: "8%" },  { top: "20%", right: "10%" },
        { top: "32%", left: "5%" },  { top: "38%", right: "7%" },
        { top: "50%", left: "10%" }, { top: "55%", right: "5%" },
        { top: "65%", left: "7%" },  { top: "72%", right: "9%" },
        { top: "80%", left: "12%" }, { top: "85%", right: "6%" },
      ].map((pos, i) => (
        <motion.div
          key={`dot-${i}`}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 0.35, scale: 1 }}
          transition={{ delay: 0.6 + i * 0.12, duration: 0.6, ease: "easeOut" }}
          className="absolute rounded-full bg-primary"
          style={{ ...pos, width: i % 3 === 0 ? 4 : 3, height: i % 3 === 0 ? 4 : 3 }}
        />
      ))}

      {/* Colinas SVG no rodapé */}
      <svg
        className="absolute bottom-0 left-0 right-0 w-full"
        viewBox="0 0 480 120"
        preserveAspectRatio="none"
        style={{ height: "18%" }}
      >
        <motion.path
          d="M0 120 Q60 40 140 70 Q220 20 300 60 Q380 30 480 55 L480 120 Z"
          fill="hsl(var(--foreground))"
          fillOpacity="0.03"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 1 }}
        />
        <motion.path
          d="M0 120 Q80 65 180 80 Q260 50 360 75 Q420 55 480 70 L480 120 Z"
          fill="hsl(var(--foreground))"
          fillOpacity="0.045"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 1 }}
        />
        <motion.path
          d="M0 120 Q100 85 200 95 Q300 75 400 90 Q450 80 480 88 L480 120 Z"
          fill="hsl(var(--foreground))"
          fillOpacity="0.06"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 1 }}
        />
        <line
          x1="20" y1="118" x2="460" y2="118"
          stroke="hsl(var(--foreground))"
          strokeOpacity="0.1"
          strokeWidth="0.8"
        />
      </svg>

      {/* Blobs pulsantes de glow */}
      {GLOWS.map((p, i) => (
        <motion.div
          key={`glow-${i}`}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{
            opacity: [0, 0.09, 0.04, 0.09],
            scale: [0.6, 1, 0.85, 1],
          }}
          transition={{
            delay: p.delay,
            duration: p.dur,
            repeat: Infinity,
            repeatType: "reverse",
            ease: "easeInOut",
          }}
          className="absolute rounded-full"
          style={{
            top: p.top,
            left: p.left,
            width: p.size,
            height: p.size,
            background:
              "radial-gradient(circle, hsl(var(--primary) / 0.18) 0%, transparent 70%)",
            filter: "blur(30px)",
          }}
        />
      ))}

      {/* Glow grande no topo-esquerda */}
      <div
        className="absolute"
        style={{
          top: "-15%",
          left: "-25%",
          width: "70%",
          height: "50%",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, hsl(var(--primary) / 0.10) 0%, transparent 65%)",
          filter: "blur(80px)",
        }}
      />

      {/* Glow accent no canto inferior-direita */}
      <div
        className="absolute"
        style={{
          bottom: "-10%",
          right: "-20%",
          width: "75%",
          height: "55%",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, hsl(var(--primary) / 0.06) 0%, transparent 65%)",
          filter: "blur(80px)",
        }}
      />

      {/* Linha horizontal accent */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.8, duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        className="absolute"
        style={{
          top: "48%",
          left: "5%",
          right: "5%",
          height: 1,
          background:
            "linear-gradient(90deg, transparent, hsl(var(--primary) / 0.08) 50%, transparent)",
          transformOrigin: "left",
        }}
      />

      {/* Vinheta */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 50%, hsl(var(--background) / 0.3) 100%)",
        }}
      />
    </div>
  );
}
