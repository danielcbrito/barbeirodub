import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invokeAuthenticatedFunction } from "@/lib/invokeAuthenticatedFunction";
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
  cash_payment_confirmed: boolean | null;
  preco_mensal: number;
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
 * Pontuação determinística para escolher a assinatura mais relevante/atual do cliente.
 * Prioriza ciclos pendentes/ativos mais recentes e datas de cobrança/renovação futuras.
 */
export function getSubscriptionRelevanceScore(sub: any): number {
  if (!sub) return 0;
  let statusScore = 0;
  if (sub.status === "pending_cash") statusScore = 400;
  else if (sub.status === "active") statusScore = 300;
  else if (sub.status === "pending_renewal") statusScore = 200;
  else if (sub.status === "suspended") statusScore = 100;

  const billingTime = sub.next_billing_date ? new Date(sub.next_billing_date + "T12:00:00").getTime() : 0;
  const updatedTime = sub.updated_at ? new Date(sub.updated_at).getTime() : 0;
  const createdTime = sub.created_at ? new Date(sub.created_at).getTime() : 0;

  // statusScore é a ordem de grandeza principal, seguido pela data da renovação (ciclo mais recente)
  return statusScore * 1e12 + Math.max(billingTime, updatedTime, createdTime);
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

      /* ── 3. Buscar agendamentos do barbeiro (inclui barbeiroId e barberUserId se diferente) ── */
      let agQuery = supabase
        .from("agendamentos")
        .select("user_id, data, created_at")
        .order("data", { ascending: false })
        .limit(3000);

      if (barberUserId && barberUserId !== barbeiroId) {
        agQuery = agQuery.or(`barbeiro_id.eq.${barbeiroId},barbeiro_id.eq.${barberUserId}`);
      } else {
        agQuery = agQuery.eq("barbeiro_id", barbeiroId);
      }
      const { data: agendamentos, error: agError } = await agQuery;
      if (agError) throw agError;

      /* ── 3b. Buscar clientes com planos vinculados a este barbeiro ── */
      let subQuery = supabase
        .from("assinaturas")
        .select("user_id")
        .in("status", ["active", "pending_cash", "pending_renewal", "suspended"]);

      if (barberUserId && barberUserId !== barbeiroId) {
        subQuery = subQuery.or(`barbeiro_id.eq.${barbeiroId},barbeiro_id.eq.${barberUserId}`);
      } else {
        subQuery = subQuery.eq("barbeiro_id", barbeiroId);
      }
      const { data: assinaturasDoBarbeiro } = await subQuery;
      const subUserIds = (assinaturasDoBarbeiro || []).map((s) => s.user_id);

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

      const combinedUserIds = [
        ...new Set([
          ...(agendamentos || []).map((a) => a.user_id),
          ...subUserIds,
          ...manualClientIds,
        ]),
      ].filter((id) => !barberUserIds.includes(id));

      if (combinedUserIds.length === 0) {
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
      for (const extraId of [...subUserIds, ...manualClientIds]) {
        if (!clientMap.has(extraId)) {
          clientMap.set(extraId, { count: 0, monthCount: 0, lastDate: null, firstCreatedAt: null });
        }
      }

      const userIds = combinedUserIds;

      /* ── 6. Batch fetch perfis, pontos, créditos e assinaturas ativas ── */
      const [{ data: profiles }, { data: pontos }, { data: creditos }, { data: assinaturas }] =
        await Promise.all([
          supabase.from("profiles").select("id, nome, telefone, created_at").in("id", userIds),
          supabase.from("pontos").select("user_id, pontos").in("user_id", userIds),
          supabase.from("creditos").select("user_id, valor, usado").in("user_id", userIds).eq("usado", false),
          supabase
            .from("assinaturas")
            .select(
              "id, user_id, status, payment_method, cash_payment_confirmed, barbeiro_id, created_at, updated_at, next_billing_date, ciclo_inicio, ciclo_fim, usos_ciclo_atual, plano:planos(nome, preco_mensal, limite_agendamentos_mes, tenant_id)"
            )
            .in("user_id", userIds)
            .in("status", ["active", "pending_cash", "pending_renewal", "suspended"])
            .order("created_at", { ascending: false }),
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

      tenantAssinaturas.sort(
        (a: any, b: any) => getSubscriptionRelevanceScore(b) - getSubscriptionRelevanceScore(a)
      );

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
        // Se já capturamos a assinatura mais recente deste cliente, não sobrescreve com antigas
        if (activePlanMap[a.user_id]) continue;

        const isCash = a.payment_method === "cash";
        const isPendingCash = a.status === "pending_cash" || (isCash && (a.cash_payment_confirmed === false || a.cash_payment_confirmed === null));
        const limite = a.plano?.limite_agendamentos_mes || 4;
        // Prioriza usos_ciclo_atual (que reseta na renovação); fallback para contagem
        const usados = a.usos_ciclo_atual != null ? Math.max(0, Number(a.usos_ciclo_atual)) : (usosPorAssinatura[a.id] || 0);

        activePlanMap[a.user_id] = {
          assinatura_id: a.id,
          plano_nome: a.plano.nome,
          limite,
          usados,
          restantes: Math.max(0, limite - usados),
          status: a.status,
          is_pending_cash: isPendingCash,
          cash_payment_confirmed: a.cash_payment_confirmed,
          preco_mensal: Number(a.plano?.preco_mensal || 0),
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
        const response = await invokeAuthenticatedFunction("manage-clients", {
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
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 30,
    enabled: !!barbeiroId,
    placeholderData: keepPreviousData,
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.updatedAt,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}

/**
 * Fetcher otimizado para carregar todos os clientes do tenant em paralelo,
 * eliminando as 8 chamadas sequenciais que atrasavam a tela.
 */
export async function fetchTenantClientes(
  tenantId: string,
  unitId?: string | null,
  currentBarbeiroId?: string | null
): Promise<BarberClient[]> {
  // LOTE 1 (PARALELO): Barbeiros, Tenant Clientes e Bloqueios
  const [allBarbeirosRes, tenantBarbersRes, tenantClientesRes, blocksRes] = await Promise.all([
    supabase.from("barbeiros").select("user_id").not("user_id", "is", null),
    supabase.from("barbeiros").select("id, user_id, apelido").eq("tenant_id", tenantId).eq("ativo", true),
    supabase.from("tenant_clientes").select("user_id, created_at").eq("tenant_id", tenantId),
    supabase.from("client_booking_blocks").select("id, client_user_id, scope, barbeiro_id, unidade_id").eq("tenant_id", tenantId),
  ]);

  const barberUserIds = new Set(allBarbeirosRes.data?.map((b) => b.user_id).filter(Boolean) || []);
  const tenantBarbers = tenantBarbersRes.data || [];
  const tenantBarberIds = tenantBarbers.map((b) => b.id);
  const respBarbeiroNomeMap: Record<string, string> = {};
  for (const b of tenantBarbers) {
    respBarbeiroNomeMap[b.id] = b.apelido || "Sem nome";
  }

  const tenantClientes = tenantClientesRes.data || [];
  const manualClientIds = tenantClientes.map((tc) => tc.user_id);
  const tenantRegistrationMap: Record<string, string> = {};
  for (const tc of tenantClientes) {
    tenantRegistrationMap[tc.user_id] = tc.created_at;
  }

  const blockMap: Record<string, BlockDetail[]> = {};
  for (const b of blocksRes.data || []) {
    const detail: BlockDetail = {
      id: b.id,
      scope: b.scope as BlockDetail["scope"],
      barbeiro_id: b.barbeiro_id,
      unidade_id: b.unidade_id,
      unidade_nome: null,
    };
    if (!blockMap[b.client_user_id]) blockMap[b.client_user_id] = [];
    blockMap[b.client_user_id].push(detail);
  }

  // LOTE 2: Agendamentos com limit razoável
  let agQuery = supabase
    .from("agendamentos")
    .select("user_id, barbeiro_id, unidade_id, data, created_at")
    .in("barbeiro_id", tenantBarberIds.length > 0 ? tenantBarberIds : ["__none__"])
    .order("data", { ascending: false })
    .limit(3000);

  if (unitId) {
    agQuery = agQuery.eq("unidade_id", unitId);
  }

  const { data: agendamentos } = await agQuery;
  const agClientIds = (agendamentos || []).map((a) => a.user_id);

  // Buscar assinaturas do tenant para não perder clientes que possuem plano ativo/pendente
  const { data: tenantSubsRes } = await supabase
    .from("assinaturas")
    .select("user_id, plano:planos!inner(tenant_id)")
    .eq("plano.tenant_id", tenantId)
    .in("status", ["active", "pending_cash", "pending_renewal", "suspended"]);
  const subClientIds = (tenantSubsRes || []).map((s: any) => s.user_id);

  const allClientIds = [...new Set([...agClientIds, ...manualClientIds, ...subClientIds])].filter(
    (id) => !barberUserIds.has(id)
  );

  if (allClientIds.length === 0) return [];

  // LOTE 3 (PARALELO): Profiles, Pontos e Assinaturas
  const [profilesRes, pontosRes, assinaturasRes] = await Promise.all([
    supabase.from("profiles").select("id, nome, telefone, created_at").in("id", allClientIds),
    supabase.from("pontos").select("user_id, pontos").in("user_id", allClientIds),
    supabase
      .from("assinaturas")
      .select("id, user_id, status, payment_method, cash_payment_confirmed, barbeiro_id, created_at, updated_at, next_billing_date, ciclo_inicio, ciclo_fim, usos_ciclo_atual, plano:planos(nome, preco_mensal, limite_agendamentos_mes, tenant_id)")
      .in("user_id", allClientIds)
      .in("status", ["active", "pending_cash", "pending_renewal", "suspended"])
      .order("created_at", { ascending: false }),
  ]);

  const profiles = profilesRes.data || [];
  const userIds = profiles.map((p) => p.id);
  if (userIds.length === 0) return [];

  // LOTE 4: Usos de plano (se houver assinaturas)
  const tenantAssinaturas = (assinaturasRes.data || []).filter(
    (a: any) => a.plano && a.plano.tenant_id === tenantId
  );
  const assinaturaIds = tenantAssinaturas.map((a: any) => a.id);
  const usosMap: Record<string, number> = {};

  if (assinaturaIds.length > 0) {
    const { data: usos } = await supabase
      .from("plano_agendamentos_usos")
      .select("assinatura_id")
      .in("assinatura_id", assinaturaIds)
      .is("released_at", null);
    for (const u of usos || []) {
      usosMap[u.assinatura_id] = (usosMap[u.assinatura_id] || 0) + 1;
    }
  }

  tenantAssinaturas.sort(
    (a: any, b: any) => getSubscriptionRelevanceScore(b) - getSubscriptionRelevanceScore(a)
  );

  const planMap: Record<string, BarberClient["activePlan"]> = {};
  for (const a of tenantAssinaturas as any[]) {
    // Se já capturou a mais relevante/recente deste cliente, ignora
    if (planMap[a.user_id]) continue;

    const isCash = a.payment_method === "cash";
    const isPendingCash = a.status === "pending_cash" || (isCash && (a.cash_payment_confirmed === false || a.cash_payment_confirmed === null));
    const limite = a.plano?.limite_agendamentos_mes || 4;
    const usados = a.usos_ciclo_atual != null ? Math.max(0, Number(a.usos_ciclo_atual)) : (usosMap[a.id] || 0);

    planMap[a.user_id] = {
      assinatura_id: a.id,
      plano_nome: a.plano?.nome || "Plano",
      limite,
      usados,
      restantes: Math.max(0, limite - usados),
      status: a.status,
      is_pending_cash: isPendingCash,
      cash_payment_confirmed: a.cash_payment_confirmed,
      preco_mensal: Number(a.plano?.preco_mensal || 0),
      barbeiro_responsavel_id: a.barbeiro_id || null,
      barbeiro_responsavel_nome: a.barbeiro_id ? respBarbeiroNomeMap[a.barbeiro_id] || null : null,
      created_at: a.created_at,
      next_billing_date: a.next_billing_date || null,
      payment_method: a.payment_method || null,
    };
  }

  // Stats
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const clientStats = new Map<string, { count: number; monthCount: number; lastDate: string | null }>();
  for (const ag of agendamentos || []) {
    const isThisMonth = typeof ag.data === "string" && ag.data.startsWith(monthPrefix);
    const existing = clientStats.get(ag.user_id);
    if (!existing) {
      clientStats.set(ag.user_id, { count: 1, monthCount: isThisMonth ? 1 : 0, lastDate: ag.data });
    } else {
      existing.count += 1;
      if (isThisMonth) existing.monthCount += 1;
      if (ag.data > (existing.lastDate || "")) existing.lastDate = ag.data;
    }
  }

  const pontosMap = new Map<string, number>();
  for (const pt of pontosRes.data || []) {
    pontosMap.set(pt.user_id, pt.pontos || 0);
  }

  const result: BarberClient[] = profiles.map((p) => {
    const stats = clientStats.get(p.id);
    const details = blockMap[p.id] || [];
    const isBlocked = details.some(
      (d) =>
        d.scope === "tenant" ||
        d.scope === "unit" ||
        (d.scope === "barber" && currentBarbeiroId && d.barbeiro_id === currentBarbeiroId)
    );
    return {
      id: p.id,
      nome: p.nome || "Sem nome",
      telefone: p.telefone || null,
      email: null,
      total_agendamentos: stats?.count || 0,
      agendamentos_mes: stats?.monthCount || 0,
      ultimo_agendamento: stats?.lastDate || null,
      pontos: pontosMap.get(p.id) || 0,
      created_at: tenantRegistrationMap[p.id] || p.created_at,
      creditos: 0,
      blocked: isBlocked,
      blockDetails: details,
      activePlan: planMap[p.id] || null,
    };
  });

  result.sort((a, b) => {
    if (!a.ultimo_agendamento) return 1;
    if (!b.ultimo_agendamento) return -1;
    return b.ultimo_agendamento.localeCompare(a.ultimo_agendamento);
  });

  return result;
}

/**
 * Hook com cache síncrono instantâneo para todos os clientes da barbearia.
 * Renderiza em 0ms se já acessado antes, e revalida imediatamente em segundo plano.
 */
export function useTenantClientes(
  tenantId: string | null | undefined,
  unitId?: string | null,
  currentBarbeiroId?: string | null
) {
  const cacheKey = `tenant-clientes:${tenantId || ""}:${unitId || "all"}`;
  const cached = tenantId ? readSyncCache<BarberClient[]>(cacheKey) : null;

  return useQuery({
    queryKey: ["tenant-clientes", tenantId, unitId ?? "all"],
    queryFn: async () => {
      if (!tenantId) return [];
      const data = await fetchTenantClientes(tenantId, unitId, currentBarbeiroId);
      writeSyncCache(cacheKey, data);
      return data;
    },
    staleTime: 1000 * 30, // 30 segundos
    gcTime: 1000 * 60 * 30,
    enabled: !!tenantId,
    placeholderData: keepPreviousData,
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.updatedAt,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook em tempo real para obter os dados 100% frescos e revalidados do plano ativo de um cliente específico.
 * Usado na tela de detalhe individual (?view=ID) para garantir zero discrepância entre abas/dispositivos.
 */
export function useClientSubscriptionDetail(clientId: string | null | undefined, tenantId?: string | null) {
  return useQuery({
    queryKey: ["client-subscription-detail", clientId, tenantId || "all"],
    queryFn: async (): Promise<ActivePlanInfo | null> => {
      if (!clientId) return null;

      const { data: subs, error: subError } = await supabase
        .from("assinaturas")
        .select(`
          id, user_id, status, payment_method, cash_payment_confirmed,
          barbeiro_id, created_at, updated_at, next_billing_date,
          ciclo_inicio, ciclo_fim, usos_ciclo_atual,
          plano:planos(nome, preco_mensal, limite_agendamentos_mes, tenant_id)
        `)
        .eq("user_id", clientId)
        .in("status", ["active", "pending_cash", "pending_renewal", "suspended"]);

      if (subError || !subs || subs.length === 0) return null;

      const tenantSubs = subs.filter((s: any) => {
        if (!s.plano) return false;
        if (tenantId) return s.plano.tenant_id === tenantId;
        return true;
      });

      if (tenantSubs.length === 0) return null;

      tenantSubs.sort((a: any, b: any) => getSubscriptionRelevanceScore(b) - getSubscriptionRelevanceScore(a));
      const sub: any = tenantSubs[0];

      let usosCount = 0;
      if (sub.usos_ciclo_atual != null) {
        usosCount = Math.max(0, Number(sub.usos_ciclo_atual));
      } else {
        const { count } = await supabase
          .from("plano_agendamentos_usos")
          .select("id", { count: "exact", head: true })
          .eq("assinatura_id", sub.id)
          .is("released_at", null);
        usosCount = count || 0;
      }

      let respBarbeiroNome: string | null = null;
      if (sub.barbeiro_id) {
        const { data: barb } = await supabase
          .from("barbeiros")
          .select("apelido")
          .eq("id", sub.barbeiro_id)
          .maybeSingle();
        respBarbeiroNome = barb?.apelido || null;
      }

      const isCash = sub.payment_method === "cash";
      const isPendingCash =
        sub.status === "pending_cash" ||
        (isCash && (sub.cash_payment_confirmed === false || sub.cash_payment_confirmed === null));
      const limite = sub.plano?.limite_agendamentos_mes || 4;

      return {
        assinatura_id: sub.id,
        plano_nome: sub.plano?.nome || "Plano",
        limite,
        usados: usosCount,
        restantes: Math.max(0, limite - usosCount),
        status: sub.status,
        is_pending_cash: isPendingCash,
        cash_payment_confirmed: sub.cash_payment_confirmed,
        preco_mensal: Number(sub.plano?.preco_mensal || 0),
        barbeiro_responsavel_id: sub.barbeiro_id || null,
        barbeiro_responsavel_nome: respBarbeiroNome,
        created_at: sub.created_at,
        next_billing_date: sub.next_billing_date || null,
        payment_method: sub.payment_method || null,
      };
    },
    enabled: !!clientId,
    staleTime: 1000 * 5, // 5 segundos
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}
