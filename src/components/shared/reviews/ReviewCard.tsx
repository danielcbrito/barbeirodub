import { Scissors } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { RatingStars } from "./RatingStars";

interface ReviewCardProps {
  reviewerName: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  barberName?: string;
  barberPhoto?: string | null;
}

/**
 * Card de avaliação individual — limpo, sério, sem poluição.
 */
export function ReviewCard({
  reviewerName,
  rating,
  comment,
  createdAt,
  barberName,
  barberPhoto,
}: ReviewCardProps) {
  const initial = reviewerName?.charAt(0)?.toUpperCase() || "?";

  return (
    <div className="rounded-lg border border-border/15 bg-card px-4 py-3 transition-colors hover:border-border/25">
      {/* Header: avatar + nome + estrelas + data */}
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-muted/40 flex items-center justify-center flex-shrink-0">
          <span className="text-[11px] font-semibold text-muted-foreground">{initial}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-foreground truncate">{reviewerName}</span>
            <RatingStars rating={rating} size="xs" />
          </div>

          <div className="flex items-center gap-1.5 mt-px">
            {barberName && (
              <>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground/40">
                  {barberPhoto ? (
                    <img src={barberPhoto} alt={barberName} className="w-3 h-3 rounded-full object-cover" />
                  ) : (
                    <Scissors className="w-2.5 h-2.5" />
                  )}
                  {barberName}
                </span>
                <span className="text-[10px] text-muted-foreground/20">·</span>
              </>
            )}
            <span className="text-[10px] text-muted-foreground/35">
              {format(new Date(createdAt), "dd MMM yyyy", { locale: ptBR })}
            </span>
          </div>
        </div>
      </div>

      {/* Comentário */}
      {comment && (
        <p className="mt-2 ml-11 text-[11px] text-muted-foreground/60 leading-relaxed">
          {comment}
        </p>
      )}
    </div>
  );
}
