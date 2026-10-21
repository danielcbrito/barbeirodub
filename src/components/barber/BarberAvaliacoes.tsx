import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  MessageSquare,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { BarberContext } from "@/pages/Barbeiro";
import { useBarberAvaliacoes } from "@/hooks/useBarberAvaliacoes";
import { QUERY_KEYS } from "@/lib/queryKeys";
import {
  HeroRatingCard,
  ReviewKpiStrip,
  ReviewCard,
  ReviewEmptyState,
} from "@/components/shared/reviews";
import { useNavigate } from "react-router-dom";

interface BarberAvaliacoesProps {
  barberContext: BarberContext;
  basePath?: string;
  onBack?: () => void;
  hideHeader?: boolean;
}

/**
 * Avaliações do barbeiro — design premium unificado (shared components).
 * Migrado de useState+useEffect para useQuery via useBarberAvaliacoes.
 */
export function BarberAvaliacoes({
  barberContext,
  basePath = "/barbeiro",
  onBack,
  hideHeader = false,
}: BarberAvaliacoesProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: reviews = [], isLoading: loading } = useBarberAvaliacoes(barberContext.barbeiroId);
  const [filterStar, setFilterStar] = useState<number | null>(null);

  /* ── Realtime — invalida o cache quando há mudança ── */
  useEffect(() => {
    const channel = supabase
      .channel(`barber-reviews-page-${barberContext.barbeiroId}-${Math.random().toString(36).slice(2, 9)}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "barbeiro_avaliacoes",
        filter: `barber_id=eq.${barberContext.barbeiroId}`,
      }, () => {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.barbeiro.avaliacoes(barberContext.barbeiroId),
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [barberContext.barbeiroId, queryClient]);

  /* ─── Computed ─── */
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

  const fiveStarPercent = distribution[0].percent;
  const withComments = reviews.filter((r) => r.comment).length;

  const filteredReviews = useMemo(
    () => (filterStar ? reviews.filter((r) => r.rating === filterStar) : reviews),
    [reviews, filterStar]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="pb-28 -mx-3 -mt-3">
      {/* ── Header ── */}
      {!hideHeader && (
        <div className="sticky top-0 z-30 bg-background">
          <div className="flex items-center gap-2 px-4 h-16">
            <button
              onClick={() => (onBack ? onBack() : navigate(`${basePath}/config-barbearia`))}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary/50 active:scale-95 transition-all lg:hidden"
              aria-label="Voltar"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
                <path d="M9 14L4 9l5-5" />
                <path d="M4 9h10a4 4 0 0 1 4 4v1" />
              </svg>
            </button>
            <h1 className="text-[19px] font-medium tracking-tight text-foreground ml-1">Minhas Avaliações</h1>
          </div>
          <div className="h-px bg-border/30" />
          <div className="px-4 py-2.5">
            <p className="text-[11px] text-muted-foreground/50">Feedback dos seus clientes</p>
          </div>
          <div className="h-px bg-border/20" />
        </div>
      )}

      {/* Conteúdo com espaçamento */}
      <div className={cn("pt-4", hideHeader && "pt-1")}>
      <div className="mx-4 mb-3">
        <HeroRatingCard
          averageRating={averageRating}
          distribution={distribution}
          filterStar={filterStar}
          onFilterStar={setFilterStar}
        />
      </div>

      {/* ── KPI Strip ── */}
      <div className="mx-4 mb-3">
        <ReviewKpiStrip
          totalReviews={totalReviews}
          fiveStarPercent={fiveStarPercent}
          withComments={withComments}
        />
      </div>

      {/* ── Reviews List ── */}
      <div className="mx-4">
        <p className="text-[9px] font-bold tracking-[0.12em] text-muted-foreground/40 uppercase mb-2.5 flex items-center gap-1.5">
          <MessageSquare className="w-3 h-3" />
          {filterStar
            ? `${filterStar} estrela${filterStar > 1 ? "s" : ""} · ${filteredReviews.length}`
            : `${filteredReviews.length} avaliações`}
        </p>

        {filteredReviews.length === 0 ? (
          <ReviewEmptyState hasFilter={!!filterStar} />
        ) : (
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {filteredReviews.map((review, index) => (
                <motion.div
                  key={review.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2, delay: Math.min(index * 0.025, 0.3) }}
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
        )}
      </div>
      </div>
    </div>
  );
}
