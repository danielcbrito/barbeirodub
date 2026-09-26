import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface RatingStarsProps {
  rating: number;
  size?: "xs" | "sm" | "md" | "lg";
}

const sizeMap = {
  xs: "w-2.5 h-2.5",
  sm: "w-3 h-3",
  md: "w-3.5 h-3.5",
  lg: "w-4 h-4",
};

/**
 * Estrelas de avaliação — design minimalista.
 */
export function RatingStars({ rating, size = "sm" }: RatingStarsProps) {
  const starSize = sizeMap[size];

  return (
    <div className="flex items-center gap-px">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = rating >= star;
        const halfFilled = !filled && rating >= star - 0.5;
        return (
          <Star
            key={star}
            className={cn(
              starSize,
              filled
                ? "text-amber-400 fill-amber-400"
                : halfFilled
                  ? "text-amber-400 fill-amber-400/50"
                  : "text-muted-foreground/15"
            )}
          />
        );
      })}
    </div>
  );
}
