import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { STALE_TIMES } from "@/lib/queryConstants";
import { readSyncCache, writeSyncCache } from "@/lib/syncQueryCache";

/** Detalhe individual de um bloqueio */
export interface BlockDetail {
  id: string;
  scope: "barber" | "unit" | "tenant";
  barbeiro_id: string | null;
  unidade_id: string | null;
  unidade_nome: string | null;
}

/** Informações do plano (assinatura) ativo do cliente */
export interface ActivePlanInfo {
  assinatura_id: string;
  plano_nome: string;
  limite: number;
  usados: number;
  restantes: number;
  status: string;
  is_pending_cash: boolean;
  /** Barbeiro responsável que vendeu/ativou o plano */
  barbeiro_responsavel_id: string | null;
  barbeiro_responsavel_nome: string | null;
  /** Data em que o cliente assinou (ou foi convertido) */
  created_at: string;
  /** Próxima data de renovação/cobrança (pode ser nula em planos manuais) */
  next_billing_date: string | null;
  /** Forma de pagamento: pix, credit_card, cash, etc. */
  payment_method: string | null;
}

export interface BarberClient {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  total_agendamentos: number;
  /** Agendamentos realizados no mês corrente (zera todo mês) */
  agendamentos_mes: number;
  ultimo_agendamento: string | null;
  pontos: number;
  created_at: string;
  creditos: number;
  blocked: boolean;
  /** Lista de bloqueios ativos para exibição granular */
  blockDetails: BlockDetail[];
  /** Plano (assinatura) ativo do cliente neste tenant, se houver */
  activePlan: ActivePlanInfo | null;
}

export interface BarberClientesResult {
  clients: BarberClient[];
  tenantId: string | null;
  /** Indica se o tenant possui programa de pontos ativo */
  loyaltyEnabled: boolean;
}

/**
 * Hook de clientes do barbeiro — consolida agendamentos, perfis,
 * pontos, créditos e status de bloqueio em uma lista unificada.
 */
export async function fetchBarberClientes(barbeiroId: string): Promise<BarberClientesResult> {
      {
      /* ── 1. Buscar IDs de barbeiros para excluí-los da lista ── */
      const { data: allBarbeiros } = await supabase
        .from("barbeiros")
        .select("user_id")
        .not("user_id", "is", null);
      const barberUserIds = allBarbeiros?.map((b) => b.user_id).filter(Boolean) || [];

      /* ── 2. Buscar tenant_id do barbeiro ── */
      const { data: barberData } = await supabase
        .from("barbeiros")
        .select("tenant_id, user_id")
        .eq("id", barbeiroId)
        .single();
      const tenantId = barberData?.tenant_id || null;
      const barberUserId = barberData?.user_id || null;

      /* ── 3. Buscar agendamentos do barbeiro ── */
      const { data: agendamentos, error: agError } = await supabase
        .from("agendamentos")
        .select("user_id, data, created_at")
        .eq("barbeiro_id", barbeiroId)
        .limit(1000);
      if (agError) throw agError;

      /* ── 4. Buscar clientes manuais + bloqueios granulares ── */
      let manualClientIds: string[] = [];
      /** Mapa: client_user_id → BlockDetail[] */
      let blockDetailsMap: Record<string, BlockDetail[]> = {};
      let tenantRegistrationMap: Record<string, string> = {};

      if (tenantId) {
        let tenantClientesQuery = supabase
          .from("tenant_clientes")
          .select("user_id, created_at, added_by")
          .eq("tenant_id", tenantId);

        if (barberUserId) {
          tenantClientesQuery = tenantClientesQuery.eq("added_by", barberUserId);
        }

        const { data: tenantClientes } = await tenantClientesQuery;
        manualClientIds = tenantClientes?.map((tc) => tc.user_id) || [];
        for (const tc of tenantClientes || []) {
          tenantRegistrationMap[tc.user_id] = tc.created_at;
        }

        // Buscar bloqueios granulares com nome da unidade
        const { data: blocks } = await supabase
          .from("client_booking_blocks")
          .select("id, client_user_id, scope, barbeiro_id, unidade_id")
          .eq("tenant_id", tenantId);

        // Buscar nomes das unidades referenciadas
        const unidadeIds = [
          ...new Set(
            (blocks || [])
              .filter((b) => b.unidade_id)
              .map((b) => b.unidade_id!)
          ),
        ];
        let unidadeNomeMap: Record<string, string> = {};
        if (unidadeIds.length > 0) {
          const { data: unidades } = await supabase
            .from("tenant_unidades")
            .select("id, nome")
            .in("id", unidadeIds);
          for (const u of unidades || []) {
            unidadeNomeMap[u.id] = u.nome;
          }
        }

        for (const block of blocks || []) {
          const detail: BlockDetail = {
            id: block.id,
            scope: block.scope as BlockDetail["scope"],
            barbeiro_id: block.barbeiro_id,
            unidade_id: block.unidade_id,
            unidade_nome: block.unidade_id ? (unidadeNomeMap[block.unidade_id] || null) : null,
          };
          if (!blockDetailsMap[block.client_user_id]) {
            blockDetailsMap[block.client_user_id] = [];
          }
          blockDetailsMap[block.client_user_id].push(detail);
        }
      }

      /* ── 4b. Verificar se tenant tem programa de pontos ativo ── */
      let loyaltyEnabled = false;
      if (tenantId) {
        const { data: promoAtiva } = await supabase
          .from("promocoes")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("ativo", true)
          .limit(1)
          .maybeSingle();
        loyaltyEnabled = !!promoAtiva;
      }

      if ((!agendamentos || agendamentos.length === 0) && manualClientIds.length === 0) {
        return { clients: [], tenantId, loyaltyEnabled };
      }

      /* ── 5. Montar mapa de estatísticas por cliente ── */
      const monthPrefix = new Date().toISOString().slice(0, 7); // "YYYY-MM"
      const clientMap = new Map<
        string,
        { count: number; monthCount: number; lastDate: string | null; firstCreatedAt: string | null }
      >();
      for (const ag of agendamentos || []) {
        const isThisMonth = typeof ag.data === "string" && ag.data.startsWith(monthPrefix);
        const existing = clientMap.get(ag.user_id);
        if (!existing) {
          clientMap.set(ag.user_id, {
            count: 1,
            monthCount: isThisMonth ? 1 : 0,
            lastDate: ag.data,
            firstCreatedAt: ag.created_at,
          });
        } else {
          existing.count += 1;
          if (isThisMonth) existing.monthCount += 1;
          if (ag.data > (existing.lastDate || "")) existing.lastDate = ag.data;
          if (ag.created_at < (existing.firstCreatedAt || "")) existing.firstCreatedAt = ag.created_at;
        }
      }
      for (const manualId of manualClientIds) {
        if (!clientMap.has(manualId)) {
          clientMap.set(manualId, { count: 0, monthCount: 0, lastDate: null, firstCreatedAt: null });
        }
      }

      const userIds = Array.from(clientMap.keys());

      /* ── 6. Batch fetch perfis, pontos, créditos e assinaturas ativas ── */
      const [{ data: profiles }, { data: pontos }, { data: creditos }, { data: assinaturas }] =
        await Promise.all([
          supabase.from("profiles").select("id, nome, telefone, created_at").in("id", userIds),
          supabase.from("pontos").select("user_id, pontos").in("user_id", userIds),
          supabase.from("creditos").select("user_id, valor, usado").in("user_id", userIds).eq("usado", false),
          supabase
            .from("assinaturas")
            .select(
              "id, user_id, status, payment_method, barbeiro_id, created_at, next_billing_date, plano:planos(nome, limite_agendamentos_mes, tenant_id)"
            )
            .in("user_id", userIds)
            .in("status", ["active", "pending_cash"]),
        ]);

      /* ── 6b. Filtrar assinaturas pelo tenant do barbeiro e contar usos ── */
      const tenantAssinaturas = (assinaturas || []).filter((a: any) => {
        if (!a.plano) return false;
        // Se este barbeiro pertence a um tenant, só considera planos daquele tenant
        if (tenantId) return a.plano.tenant_id === tenantId;
        return true;
      });

      const assinaturaIds = tenantAssinaturas.map((a: any) => a.id);
      let usosPorAssinatura: Record<string, number> = {};
      if (assinaturaIds.length > 0) {
        const { data: usos } = await supabase
          .from("plano_agendamentos_usos")
          .select("assinatura_id")
          .in("assinatura_id", assinaturaIds)
          .is("released_at", null);
        for (const u of usos || []) {
          usosPorAssinatura[u.assinatura_id] = (usosPorAssinatura[u.assinatura_id] || 0) + 1;
        }
      }

      /* ── 6c. Buscar nomes dos barbeiros responsáveis pelas assinaturas ── */
      const respBarbeiroIds = [
        ...new Set(
          (tenantAssinaturas as any[])
            .map((a) => a.barbeiro_id)
            .filter((id): id is string => !!id)
        ),
      ];
      let respBarbeiroNomeMap: Record<string, string> = {};
      if (respBarbeiroIds.length > 0) {
        const { data: respBarbeiros } = await supabase
          .from("barbeiros")
          .select("id, apelido")
          .in("id", respBarbeiroIds);
        for (const b of respBarbeiros || []) {
          respBarbeiroNomeMap[b.id] = b.apelido || "Sem nome";
        }
      }

      /** Mapa: user_id → ActivePlanInfo (a mais recente em caso de múltiplas) */
      const activePlanMap: Record<string, ActivePlanInfo> = {};
      for (const a of tenantAssinaturas as any[]) {
        const isPendingCash = a.status === "pending_cash";
        const limite = isPendingCash ? 1 : a.plano.limite_agendamentos_mes || 4;
        const usados = usosPorAssinatura[a.id] || 0;
        // Mantém apenas uma assinatura por cliente (preferindo a "active" sobre pending_cash)
        const existing = activePlanMap[a.user_id];
        if (existing && existing.status === "active" && a.status !== "active") continue;
        activePlanMap[a.user_id] = {
          assinatura_id: a.id,
          plano_nome: a.plano.nome,
          limite,
          usados,
          restantes: Math.max(0, limite - usados),
          status: a.status,
          is_pending_cash: isPendingCash,
          barbeiro_responsavel_id: a.barbeiro_id || null,
          barbeiro_responsavel_nome: a.barbeiro_id ? respBarbeiroNomeMap[a.barbeiro_id] || null : null,
          created_at: a.created_at,
          next_billing_date: a.next_billing_date || null,
          payment_method: a.payment_method || null,
        };
      }

      /* ── 7. Emails via edge function ── */
      let usersMap: Record<string, { email?: string }> = {};
      try {
        const response = await supabase.functions.invoke("manage-clients", {
          body: { action: "list" },
        });
        if (response.data?.users) usersMap = response.data.users;
      } catch {
        /* silencioso — emails são opcionais */
      }

      /* ── 8. Montar lista final, filtrando barbeiros ── */
      const clientsData: BarberClient[] = (profiles || [])
        .filter((profile) => !barberUserIds.includes(profile.id))
        .map((profile) => {
          const stats = clientMap.get(profile.id);
          const userPoints = pontos?.find((p) => p.user_id === profile.id);
          const userCredits =
            creditos
              ?.filter((c) => c.user_id === profile.id)
              .reduce((sum, c) => sum + (c.valor || 0), 0) || 0;
          const userData = usersMap[profile.id];

          const details = blockDetailsMap[profile.id] || [];
          const isBlocked = details.some(
            (d) =>
              d.scope === "tenant" ||
              d.scope === "unit" ||
              (d.scope === "barber" && d.barbeiro_id === barbeiroId)
          );

          return {
            id: profile.id,
            nome: profile.nome || "Sem nome",
            telefone: profile.telefone || null,
            email: userData?.email || null,
            total_agendamentos: stats?.count || 0,
            agendamentos_mes: stats?.monthCount || 0,
            ultimo_agendamento: stats?.lastDate || null,
            pontos: userPoints?.pontos || 0,
            created_at: tenantRegistrationMap[profile.id] || stats?.firstCreatedAt || profile.created_at,
            creditos: userCredits,
            blocked: isBlocked,
            blockDetails: details,
            activePlan: activePlanMap[profile.id] || null,
          };
        });

      clientsData.sort((a, b) => {
        if (!a.ultimo_agendamento) return 1;
        if (!b.ultimo_agendamento) return -1;
        return b.ultimo_agendamento.localeCompare(a.ultimo_agendamento);
      });

      return { clients: clientsData, tenantId, loyaltyEnabled };
      }
}

/**
 * Hook de clientes do barbeiro — usa fetcher extraído para permitir
 * prefetch fora do componente.
 */
export function useBarberClientes(barbeiroId: string) {
  const cached = barbeiroId ? readSyncCache<BarberClientesResult>(`barber-clientes:${barbeiroId}`) : null;
  return useQuery({
    queryKey: QUERY_KEYS.barbeiro.clientes(barbeiroId),
    queryFn: async () => {
      const data = await fetchBarberClientes(barbeiroId);
      writeSyncCache(`barber-clientes:${barbeiroId}`, data);
      return data;
    },
    staleTime: STALE_TIMES.CLIENTES,
    gcTime: 1000 * 60 * 30,
    enabled: !!barbeiroId,
    placeholderData: keepPreviousData,
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.updatedAt,
  });
}
