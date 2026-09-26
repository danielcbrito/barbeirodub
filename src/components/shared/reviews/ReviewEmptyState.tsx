import { Star } from "lucide-react";

interface ReviewEmptyStateProps {
  hasFilter?: boolean;
}

/**
 * Estado vazio para avaliações — limpo e discreto.
 */
export function ReviewEmptyState({ hasFilter = false }: ReviewEmptyStateProps) {
  return (
    <div className="rounded-xl border border-border/15 bg-card/50 py-10 px-6 text-center">
      <Star className="w-6 h-6 text-muted-foreground/15 mx-auto mb-3" strokeWidth={1.5} />
      <p className="text-[12px] text-muted-foreground/60 font-medium">
        {hasFilter ? "Nenhuma avaliação com esse filtro" : "Nenhuma avaliação ainda"}
      </p>
      <p className="text-[10px] text-muted-foreground/35 mt-1 max-w-[200px] mx-auto">
        {hasFilter ? "Altere os filtros aplicados" : "Avaliações aparecerão aqui automaticamente"}
      </p>
    </div>
  );
}
