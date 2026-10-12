import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Service {
  id: string;
  nome: string;
  descricao: string | null;
  duracao_minutos: number;
  preco: number;
}

interface ServiceCardProps {
  service: Service;
  isSelected: boolean;
  onToggle: () => void;
}

export function ServiceCard({ service, isSelected, onToggle }: ServiceCardProps) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "w-full text-left rounded-xl p-4 transition-all duration-200 border",
        isSelected 
          ? "bg-primary/10 border-primary/50" 
          : "bg-card border-border hover:bg-secondary"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <h3 className="text-base font-semibold text-foreground mb-0.5">
            {service.nome}
          </h3>
          {service.descricao && (
            <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
              {service.descricao}
            </p>
          )}
          
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">
              {service.duracao_minutos} min
            </span>
            <span className="text-primary font-semibold">
              R$ {service.preco.toFixed(2).replace('.', ',')}
            </span>
          </div>
        </div>

        <div className={cn(
          "flex-shrink-0 w-5 h-5 rounded-full border-2 transition-all flex items-center justify-center mt-0.5",
          isSelected 
            ? "bg-primary border-primary" 
            : "border-muted-foreground/30"
        )}>
          {isSelected && (
            <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />
          )}
        </div>
      </div>
    </button>
  );
}
