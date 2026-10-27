import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { STALE_TIMES } from "@/lib/queryConstants";

export interface BarberReview {
  id: string;
  rating: number;
  comment: string | null;
  reviewer_first_name: string;
  created_at: string;
}

/**
 * Hook de avaliações do barbeiro — busca reviews com campos explícitos.
 * Compartilhado entre BarberAvaliacoes (tela) e BarberReviewsSection (widget).
 */
export function useBarberAvaliacoes(barbeiroId: string, limit?: number) {
  return useQuery({
    queryKey: QUERY_KEYS.barbeiro.avaliacoes(barbeiroId),
    queryFn: async (): Promise<BarberReview[]> => {
      let query = supabase
        .from("barbeiro_avaliacoes")
        .select("id, rating, comment, reviewer_first_name, created_at")
        .eq("barber_id", barbeiroId)
        .order("created_at", { ascending: false })
        .limit(limit ?? 50);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: STALE_TIMES.AVALIACOES,
    retry: 1,
    enabled: !!barbeiroId,
  });
}
