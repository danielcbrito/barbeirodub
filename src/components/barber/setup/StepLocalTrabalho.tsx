import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export type WorkplaceType = "estabelecimento" | "domicilio" | "";

interface Props {
  value: WorkplaceType;
  onChange: (value: WorkplaceType) => void;
  /** Nome do barbeiro para personalizar o título */
  nome?: string;
}

const OPTIONS: { value: WorkplaceType; title: string; desc: string }[] = [
  {
    value: "estabelecimento",
    title: "No meu estabelecimento",
    desc: "Os clientes vão até o estabelecimento, que pode ser o seu próprio local, um salão ou uma sala onde outros profissionais trabalham.",
  },
  {
    value: "domicilio",
    title: "Na casa do cliente",
    desc: "Os serviços são feitos diretamente na casa do cliente.",
  },
];

/**
 * Step 2 — Onde você trabalha?
 * Design com checkbox arredondado e separador, seguindo referência.
 */
export function StepLocalTrabalho({ value, onChange, nome }: Props) {
  const displayName = nome || "você";

  return (
    <div className="space-y-6">
      <h2 className="text-[20px] font-bold text-foreground leading-snug tracking-tight">
        Onde você trabalha, {displayName}?
      </h2>

      <div className="divide-y divide-border">
        {OPTIONS.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className="w-full flex items-start gap-3 py-4 text-left transition-colors active:bg-muted/5"
            >
              {/* Checkbox arredondado compacto */}
              <div
                className={cn(
                  "w-6 h-6 rounded-full border-[1.5px] flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-200",
                  selected
                    ? "border-foreground bg-foreground"
                    : "border-muted-foreground bg-transparent"
                )}
              >
                {selected && <Check className="w-3.5 h-3.5 text-background" strokeWidth={3} />}
              </div>

              <div className="flex-1 min-w-0">
                <p className={cn(
                  "text-[14px] font-semibold leading-tight",
                  "text-foreground"
                )}>
                  {opt.title}
                </p>
                <p className="text-[12px] text-foreground/90 mt-1 leading-relaxed">
                  {opt.desc}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
