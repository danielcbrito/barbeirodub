import { cn } from "@/lib/utils";
import { User, Users } from "lucide-react";
import { motion } from "framer-motion";

export type TeamSize = "" | "1" | "2" | "3-5" | "6+";

interface Props {
  value: TeamSize;
  onChange: (value: TeamSize) => void;
}

const OPTIONS: { value: TeamSize; icon: React.ElementType; label: string; desc: string }[] = [
  { value: "1", icon: User, label: "Apenas eu", desc: "Trabalho sozinho" },
  { value: "2", icon: Users, label: "2 pessoas", desc: "Eu + 1 funcionário" },
  { value: "3-5", icon: Users, label: "3 a 5 pessoas", desc: "Equipe pequena" },
  { value: "6+", icon: Users, label: "6 ou mais", desc: "Equipe grande" },
];

/**
 * Step 4 — Tamanho da equipe.
 */
export function StepEquipe({ value, onChange }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[22px] font-semibold text-foreground leading-tight">
          Qual é o tamanho da sua equipe?
        </h2>
        <p className="text-[13px] text-foreground/90 mt-1">
          Isso nos ajuda a configurar seu painel da melhor forma.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {OPTIONS.map((opt) => {
          const selected = value === opt.value;
          return (
            <motion.button
              key={opt.value}
              whileTap={{ scale: 0.97 }}
              onClick={() => onChange(opt.value)}
              className={cn(
                "flex flex-col items-center gap-2 p-5 rounded-xl border transition-all text-center",
                selected
                  ? "border-primary/50 bg-primary/5 shadow-[0_0_20px_rgba(219,59,59,0.08)]"
                  : "border-border bg-card hover:bg-card hover:border-border"
              )}
            >
              <div
                className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                  selected ? "bg-primary/15 text-primary" : "bg-secondary/70 text-foreground"
                )}
              >
                <opt.icon className="w-5 h-5" />
              </div>
              <div>
                <p className={cn("text-[13px] font-semibold", "text-foreground")}>
                  {opt.label}
                </p>
                <p className="text-[10px] text-foreground/70 mt-0.5">{opt.desc}</p>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
