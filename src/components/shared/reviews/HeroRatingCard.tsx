import { Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { RatingStars } from "./RatingStars";

interface DistributionItem {
  star: number;
  count: number;
  percent: number;
}

interface HeroRatingCardProps {
  averageRating: number;
  distribution: DistributionItem[];
  filterStar: number | null;
  onFilterStar: (star: number | null) => void;
}

/**
 * Card de resumo de avaliações — limpo e profissional.
 */
export function HeroRatingCard({ averageRating, distribution, filterStar, onFilterStar }: HeroRatingCardProps) {
  const totalCount = distribution.reduce((s, d) => s + d.count, 0);

  return (
    <div className="rounded-xl border border-border/20 bg-card p-4">
      <div className="flex items-start gap-5">
        {/* Nota média */}
        <div className="flex flex-col items-center gap-1 min-w-[72px]">
          <span className="text-[36px] font-bold text-foreground leading-none tabular-nums tracking-tight">
            {averageRating.toFixed(1)}
          </span>
          <RatingStars rating={averageRating} size="sm" />
          <span className="text-[10px] text-muted-foreground/50 font-medium mt-0.5">
            {totalCount} {totalCount === 1 ? "avaliação" : "avaliações"}
          </span>
        </div>

        {/* Barras de distribuição */}
        <div className="flex-1 space-y-[5px] pt-1">
          {distribution.map(({ star, percent, count }) => (
            <button
              key={star}
              onClick={() => onFilterStar(filterStar === star ? null : star)}
              className={cn(
                "flex items-center gap-2 w-full rounded-md px-1.5 py-[2px] transition-all",
                filterStar === star
                  ? "bg-amber-500/8 ring-1 ring-amber-500/20"
                  : "hover:bg-muted/20"
              )}
            >
              <span className="text-[10px] text-muted-foreground/50 w-2 text-right tabular-nums font-medium">{star}</span>
              <div className="flex-1 h-[5px] rounded-full bg-muted/20 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${percent}%` }}
                  transition={{ duration: 0.6, delay: (5 - star) * 0.06, ease: "easeOut" }}
                  className="h-full rounded-full bg-amber-400"
                />
              </div>
              <span className="text-[10px] text-muted-foreground/40 w-4 text-right tabular-nums font-medium">
                {count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Filtro ativo */}
      {filterStar && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => onFilterStar(null)}
          className="mt-2.5 text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          <X className="w-3 h-3" />
          Limpar filtro
        </motion.button>
      )}
    </div>
  );
}
