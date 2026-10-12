import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Star, MessageSquare } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";
import { useBarberAvaliacoes } from "@/hooks/useBarberAvaliacoes";
import { QUERY_KEYS } from "@/lib/queryKeys";
import {
  RatingStars,
  ReviewCard,
  ReviewEmptyState,
} from "@/components/shared/reviews";

interface BarberReviewsSectionProps {
  barbeiroId: string;
}

/**
 * Widget de avaliações do dashboard do barbeiro — design limpo e profissional.
 * Compartilha cache com BarberAvaliacoes via useBarberAvaliacoes.
 */
export function BarberReviewsSection({ barbeiroId }: BarberReviewsSectionProps) {
  const queryClient = useQueryClient();
  const { data: reviews = [], isLoading: loading } = useBarberAvaliacoes(barbeiroId);

  /* ── Realtime — invalida cache compartilhado ── */
  useEffect(() => {
    const channel = supabase
      .channel(`barber-reviews-${barbeiroId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "barbeiro_avaliacoes",
        filter: `barber_id=eq.${barbeiroId}`,
      }, () => {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.barbeiro.avaliacoes(barbeiroId),
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [barbeiroId, queryClient]);

  const totalReviews = reviews.length;
  const averageRating = totalReviews > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
    : 0;

  const distribution = useMemo(
    () => [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: reviews.filter((r) => r.rating === star).length,
      percent: totalReviews > 0
        ? (reviews.filter((r) => r.rating === star).length / totalReviews) * 100
        : 0,
    })),
    [reviews, totalReviews]
  );

  if (loading) {
    return <Skeleton className="h-48 rounded-xl" />;
  }

  return (
    <div className="rounded-xl border border-border/20 bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-2.5">
        <Star className="w-4 h-4 text-amber-400" />
        <h3 className="font-semibold text-[13px] text-foreground tracking-tight">Minhas Avaliações</h3>
      </div>

      <div className="px-4 pb-4">
        {totalReviews === 0 ? (
          <ReviewEmptyState />
        ) : (
          <div className="space-y-4">
            {/* Resumo compacto */}
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-center gap-0.5 min-w-[64px]">
                <span className="text-[28px] font-bold text-foreground leading-none tabular-nums">
                  {averageRating.toFixed(1)}
                </span>
                <RatingStars rating={averageRating} size="xs" />
                <span className="text-[9px] text-muted-foreground/40 mt-0.5 font-medium">
                  {totalReviews} {totalReviews === 1 ? "avaliação" : "avaliações"}
                </span>
              </div>

              {/* Mini bars */}
              <div className="flex-1 space-y-[3px]">
                {distribution.map(({ star, percent, count }) => (
                  <div key={star} className="flex items-center gap-1.5">
                    <span className="text-[9px] text-muted-foreground/40 w-2 text-right tabular-nums">{star}</span>
                    <div className="flex-1 h-[4px] rounded-full bg-muted/15 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${percent}%` }}
                        transition={{ duration: 0.5, delay: (5 - star) * 0.05 }}
                        className="h-full rounded-full bg-amber-400"
                      />
                    </div>
                    <span className="text-[9px] text-muted-foreground/30 w-3 text-right tabular-nums">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Lista recente */}
            <div className="space-y-1.5">
              <p className="text-[9px] font-medium tracking-wider text-muted-foreground/35 uppercase flex items-center gap-1.5">
                <MessageSquare className="w-2.5 h-2.5" />
                Recentes
              </p>

              <AnimatePresence mode="popLayout">
                {reviews.slice(0, 5).map((review, index) => (
                  <motion.div
                    key={review.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15, delay: index * 0.03 }}
                  >
                    <ReviewCard
                      reviewerName={review.reviewer_first_name}
                      rating={review.rating}
                      comment={review.comment}
                      createdAt={review.created_at}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
