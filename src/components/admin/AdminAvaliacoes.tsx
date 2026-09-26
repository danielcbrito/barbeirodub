import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  MessageSquare,
  Users,
  Scissors,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  HeroRatingCard,
  ReviewKpiStrip,
  ReviewCard,
  ReviewEmptyState,
} from "@/components/shared/reviews";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { STALE_TIMES } from "@/lib/queryConstants";

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  reviewer_first_name: string;
  created_at: string;
  barber_id: string;
}

interface Barber {
  id: string;
  apelido: string;
  foto_url: string | null;
}

interface AdminAvaliacoesProps {
  tenantId?: string;
  basePath?: string;
  hideHeader?: boolean;
  onBack?: () => void;
}

/** Fetch avaliações e barbeiros */
async function fetchAvaliacoes(tenantId?: string) {
  let barbersQuery = supabase
    .from("barbeiros")
    .select("id, apelido, foto_url")
    .eq("ativo", true)
    .is("deleted_at", null)
    .order("apelido");

  if (tenantId) {
    barbersQuery = barbersQuery.eq("tenant_id", tenantId);
  } else {
    barbersQuery = barbersQuery.is("tenant_id", null);
  }

  const barbersRes = await barbersQuery;
  if (barbersRes.error) throw barbersRes.error;

  const barberIds = (barbersRes.data || []).map(b => b.id);

  let reviewsQuery = supabase
    .from("barbeiro_avaliacoes")
    .select("id, rating, comment, reviewer_first_name, created_at, barber_id")
    .order("created_at", { ascending: false });

  if (barberIds.length > 0) {
    reviewsQuery = reviewsQuery.in("barber_id", barberIds);
  }

  const reviewsRes = await reviewsQuery;
  if (reviewsRes.error) throw reviewsRes.error;

  return {
    reviews: (reviewsRes.data || []) as Review[],
    barbers: (barbersRes.data || []) as Barber[],
  };
}

/**
 * Painel de avaliações do Admin — design premium unificado.
 * Exibe todas as avaliações da barbearia com filtro por barbeiro e estrela.
 */
export function AdminAvaliacoes({
  tenantId,
  basePath = "/admin",
  hideHeader = false,
  onBack,
}: AdminAvaliacoesProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filterStar, setFilterStar] = useState<number | null>(null);
  const [filterBarber, setFilterBarber] = useState<string | null>(null);

  const queryKey = QUERY_KEYS.admin.avaliacoes(tenantId || "none");

  const { data, isLoading: loading } = useQuery({
    queryKey,
    queryFn: () => fetchAvaliacoes(tenantId),
    staleTime: STALE_TIMES.AVALIACOES,
  });

  const reviews = data?.reviews || [];
  const barbers = data?.barbers || [];

  // Realtime — invalida cache quando avaliações mudam
  useEffect(() => {
    const channel = supabase
      .channel(`admin-all-reviews-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "barbeiro_avaliacoes" }, () => {
        queryClient.invalidateQueries({ queryKey });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient, queryKey]);

  // KPIs
  const totalReviews = reviews.length;
  const averageRating = useMemo(() => {
    if (totalReviews === 0) return 0;
    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    return Number((sum / totalReviews).toFixed(1));
  }, [reviews, totalReviews]);

  const distribution = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    reviews.forEach(r => {
      const idx = Math.min(5, Math.max(1, Math.round(r.rating))) - 1;
      counts[idx]++;
    });
    return counts;
  }, [reviews]);

  const fiveStarPercent = useMemo(() => {
    if (totalReviews === 0) return 0;
    return Math.round((distribution[4] / totalReviews) * 100);
  }, [distribution, totalReviews]);

  const withComments = useMemo(() => {
    return reviews.filter(r => r.comment && r.comment.trim().length > 0).length;
  }, [reviews]);

  // Filtragem
  const filteredReviews = useMemo(() => {
    return reviews.filter(r => {
      if (filterStar !== null && Math.round(r.rating) !== filterStar) return false;
      if (filterBarber !== null && r.barber_id !== filterBarber) return false;
      return true;
    });
  }, [reviews, filterStar, filterBarber]);

  const barberMap = useMemo(
    () => Object.fromEntries(barbers.map((b) => [b.id, b])),
    [barbers]
  );

  const hasActiveFilter = filterStar !== null || filterBarber !== null;

  // Loading skeleton
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn("pb-28", !hideHeader && "-mx-3 -mt-3")}>
      {/* ── Header ── */}
      {!hideHeader && (
        <div className="sticky top-0 z-30 bg-background">
          <div className="flex items-center gap-2 px-4 h-16">
            <button
              onClick={() => (onBack ? onBack() : navigate(`${basePath}/configuracoes-perfil`))}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary/50 active:scale-95 transition-all lg:hidden"
              aria-label="Voltar"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
                <path d="M9 14L4 9l5-5" />
                <path d="M4 9h10a4 4 0 0 1 4 4v1" />
              </svg>
            </button>
            <h1 className="text-[19px] font-medium tracking-tight text-foreground ml-1">Avaliações</h1>
          </div>
          <div className="h-px bg-border/30" />
          <div className="px-4 py-2.5">
            <p className="text-[11px] text-muted-foreground/50">Todas as avaliações da barbearia</p>
          </div>
          <div className="h-px bg-border/20" />
        </div>
      )}

      <div className="pt-4">

      {/* ── Hero Rating Card ── */}
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

      {/* ── Barber Filter ── */}
      <div className="mx-4 mb-3">
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
          <button
            onClick={() => setFilterBarber(null)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-semibold transition-all border flex-shrink-0",
              !filterBarber
                ? "bg-primary/15 text-primary border-primary/30"
                : "bg-muted/30 text-muted-foreground/60 border-border/30 hover:text-foreground hover:border-border/50"
            )}
          >
            <Users className="w-3 h-3" />
            Todos
          </button>
          {barbers.map((b) => (
            <button
              key={b.id}
              onClick={() => setFilterBarber(filterBarber === b.id ? null : b.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-semibold transition-all border flex-shrink-0",
                filterBarber === b.id
                  ? "bg-primary/15 text-primary border-primary/30"
                  : "bg-muted/30 text-muted-foreground/60 border-border/30 hover:text-foreground hover:border-border/50"
              )}
            >
              {b.foto_url ? (
                <img src={b.foto_url} alt={b.apelido} className="w-4 h-4 rounded-full object-cover ring-1 ring-border/20" />
              ) : (
                <Scissors className="w-3 h-3" />
              )}
              {b.apelido}
            </button>
          ))}
        </div>
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
          <ReviewEmptyState hasFilter={hasActiveFilter} />
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
                    barberName={barberMap[review.barber_id]?.apelido || "Barbeiro"}
                    barberPhoto={barberMap[review.barber_id]?.foto_url || null}
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
