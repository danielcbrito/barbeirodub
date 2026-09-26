import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { STALE_TIMES } from "@/lib/queryConstants";

export interface PixKey {
  id: string;
  tipo: string;
  chave: string;
  apelido: string | null;
  is_default: boolean;
  nome_titular: string | null;
  instituicao: string | null;
}

export interface ConfiguracoesData {
  pixKeys: PixKey[];
  hasPendingData: boolean;
}

/**
 * Hook de configurações financeiras — busca chaves PIX e verifica dados pendentes.
 */
export function useFinancialConfiguracoes(
  role: string,
  userId: string | undefined,
  barbeiroId: string | null | undefined
) {
  return useQuery({
    queryKey: QUERY_KEYS.financeiro.configuracoes(userId ?? ""),
    queryFn: async (): Promise<ConfiguracoesData> => {
      const pixPromise = supabase
        .from("chaves_pix")
        .select("id, tipo, chave, apelido, is_default, nome_titular, instituicao")
        .eq("user_id", userId!)
        .order("is_default", { ascending: false });

      let hasPendingData = false;
      if (role === "barber" && barbeiroId) {
        const { data } = await supabase
          .from("barbeiros_private")
          .select("cpf, email")
          .eq("barbeiro_id", barbeiroId)
          .maybeSingle();
        hasPendingData = !data?.cpf || !data?.email;
      }

      const pixRes = await pixPromise;

      return {
        pixKeys: (pixRes.data as PixKey[]) || [],
        hasPendingData,
      };
    },
    staleTime: STALE_TIMES.FINANCEIRO,
    enabled: !!userId,
  });
}
