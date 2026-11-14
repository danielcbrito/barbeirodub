import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { STALE_TIMES, GC_TIMES } from "@/lib/queryConstants";
import { format } from "date-fns";
import { fetchAgendaDia as fetchAgendaDiaRaw } from "@/lib/fetchers/agendaFetchers";
import { readSyncCache, writeSyncCache } from "@/lib/syncQueryCache";


/**
 * Agendamento enriquecido com dados de perfil, serviço e pagamentos.
 * Substitui o padrão N+1 anterior por batch fetching.
 */
export interface TimelineAppointment {
  id: string;
  data: string;
  hora: string;
  duracao?: number;
  status: string;
  preco: number;
  observacoes: string | null;
  cliente_nome?: string | null;
  barbeiro_confirmou: boolean | null;
  cliente_confirmou: boolean | null;
  ponto_liberado: boolean | null;
  user_id: string;
  servico_id: string;
  barbeiro_id?: string | null;
  is_free: boolean | null;
  payment_method: string | null;
  tipo_agendamento: string | null;
  remarcacao_solicitada?: boolean | null;
  motivo_remarcacao?: string | null;
  profile: { nome: string; cpf?: string } | null;
  servico: { nome: string; duracao_minutos: number } | null;
  pagamentos: Array<{ metodo: string; status: string; valor: number }>;
}

/**
 * Hook de agenda do barbeiro — busca agendamentos do dia com dados
 * de perfil, serviço e pagamentos usando batch fetching.
 * Reutiliza o fetcher centralizado de src/lib/fetchers/agendaFetchers.ts.
 */
export function useBarberAgenda(barbeiroId: string, selectedDate: Date) {
  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const cacheKey = `barber-agenda:${barbeiroId}:${dateStr}`;
  const cached = barbeiroId ? readSyncCache<TimelineAppointment[]>(cacheKey) : null;

  return useQuery({
    queryKey: QUERY_KEYS.barbeiro.agenda(barbeiroId, dateStr),
    queryFn: async () => {
      const data = await fetchAgendaDiaRaw(barbeiroId, dateStr);
      writeSyncCache(cacheKey, data);
      return data;
    },
    staleTime: STALE_TIMES.AGENDA_DIA,
    gcTime: GC_TIMES.AGENDA_DIA,
    enabled: !!barbeiroId,
    placeholderData: keepPreviousData,
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.updatedAt,
  });
}
