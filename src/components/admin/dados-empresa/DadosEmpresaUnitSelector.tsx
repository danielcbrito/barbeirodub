import { Building2, Check, ChevronRight, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useDadosEmpresaUnits } from "./useDadosEmpresaUnits";
import { buildDadosEmpresaSearch } from "./unitSelection";

interface DadosEmpresaUnitSelectorProps {
  basePath?: string;
  tenantId?: string | null;
  selectedUnidadeId?: string | null;
}

export function DadosEmpresaUnitSelector({
  basePath = "/admin",
  tenantId,
  selectedUnidadeId,
}: DadosEmpresaUnitSelectorProps) {
  const navigate = useNavigate();
  const { units, loading, defaultUnit } = useDadosEmpresaUnits(tenantId);

  const activeUnitId = selectedUnidadeId || defaultUnit?.id || null;

  return (
    <div className="pb-8 -mx-3 -mt-3 min-h-[70vh]">
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/30">
        <div className="flex items-center gap-2.5 px-4 h-14">
          <button
            onClick={() => navigate(`${basePath}/dados-empresa${buildDadosEmpresaSearch(activeUnitId)}`)}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary/50 active:scale-95 transition-all"
            aria-label="Voltar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
              <path d="M9 14L4 9l5-5" />
              <path d="M4 9h10a4 4 0 0 1 4 4v1" />
            </svg>
          </button>
          <h1 className="text-[19px] font-medium tracking-tight text-foreground flex-1">
            Trocar unidade
          </h1>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
        </div>
      ) : (
        <div className="px-4 pt-4 space-y-2.5">
          {units.map((unit, index) => {
            const isActive = activeUnitId === unit.id;

            return (
              <motion.button
                key={unit.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, delay: index * 0.04 }}
                onClick={() => navigate(`${basePath}/dados-empresa${buildDadosEmpresaSearch(unit.id)}`)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left",
                  "border border-border/20 bg-card transition-all duration-200",
                  "hover:bg-secondary/30 active:scale-[0.99]",
                  isActive && "border-primary/30 bg-primary/5",
                )}
              >
                <div className="w-12 h-12 rounded-2xl border border-border/20 bg-secondary/30 overflow-hidden flex items-center justify-center shrink-0">
                  {unit.logoUrl ? (
                    <img
                      src={unit.logoUrl}
                      alt={`Logo da unidade ${unit.nome}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Building2 className="w-5 h-5 text-muted-foreground/50" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[14px] font-medium text-foreground truncate">{unit.nome}</p>
                    {unit.is_sede && (
                      <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                        Principal
                      </span>
                    )}
                  </div>
                </div>

                {isActive ? (
                  <Check className="w-4 h-4 text-primary shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                )}
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}