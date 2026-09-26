/**
 * ═══════════════════════════════════════════════════════════
 * QUERY KEYS CENTRALIZADAS — DUB BARBER
 * ═══════════════════════════════════════════════════════════
 *
 * Todas as query keys do app ficam aqui.
 * Nunca use strings soltas em queryKey — sempre use este objeto.
 *
 * Padrão: ['entidade', 'sub-entidade', identificador, filtros]
 */

export const QUERY_KEYS = {
  // ── BARBEIRO ────────────────────────────────────────────
  barbeiro: {
    perfil: (barbeiroId: string) =>
      ['barbeiro', 'perfil', barbeiroId] as const,

    perfilPrefix: (barbeiroId: string) =>
      ['barbeiro', 'perfil', barbeiroId] as const,

    dadosPessoais: (barbeiroId: string) =>
      ['barbeiro', 'dados-pessoais', barbeiroId] as const,

    dashboard: (barbeiroId: string) =>
      ['barbeiro', 'dashboard', barbeiroId] as const,

    agenda: (barbeiroId: string, data: string) =>
      ['barbeiro', 'agenda', barbeiroId, data] as const,

    agendaMes: (barbeiroId: string, mes: string) =>
      ['barbeiro', 'agenda-mes', barbeiroId, mes] as const,

    clientes: (barbeiroId: string) =>
      ['barbeiro', 'clientes', barbeiroId] as const,

    clienteHistorico: (userId: string, barbeiroId: string) =>
      ['barbeiro', 'cliente-historico', userId, barbeiroId] as const,

    historico: (barbeiroId: string, pagina: number) =>
      ['barbeiro', 'historico', barbeiroId, pagina] as const,

    avaliacoes: (barbeiroId: string) =>
      ['barbeiro', 'avaliacoes', barbeiroId] as const,

    horarios: (barbeiroId: string) =>
      ['barbeiro', 'horarios', barbeiroId] as const,

    horarioConfig: (barbeiroId: string) =>
      ['barbeiro', 'horarios', barbeiroId] as const,

    horariosExcepcionais: (barbeiroId: string) =>
      ['barbeiro', 'horarios-excepcionais', barbeiroId] as const,

    servicos: (barbeiroId: string, tenantId: string | null) =>
      ['barbeiro', 'servicos', barbeiroId, tenantId] as const,

    confirmacoesPendentes: (barbeiroId: string) =>
      ['barbeiro', 'confirmacoes-pendentes', barbeiroId] as const,

    pendingPlanPayments: (barbeiroId: string) =>
      ['barbeiro', 'pending-plan-payments', barbeiroId] as const,

    financeiro: {
      overview: (barbeiroId: string) =>
        ['barbeiro', 'financeiro', 'overview', barbeiroId] as const,

      extrato: (barbeiroId: string, pagina: number) =>
        ['barbeiro', 'financeiro', 'extrato', barbeiroId, pagina] as const,

      relatorios: (barbeiroId: string, periodo: string) =>
        ['barbeiro', 'financeiro', 'relatorios', barbeiroId, periodo] as const,
    },
  },

  // ── ADMIN ───────────────────────────────────────────────
  admin: {
    agenda: (data: string, unidadeId?: string) =>
      ['admin', 'agenda', data, unidadeId] as const,

    barbeiros: (tenantId: string) =>
      ['admin', 'barbeiros', tenantId] as const,

    clientes: (tenantId: string, pagina: number) =>
      ['admin', 'clientes', tenantId, pagina] as const,

    servicos: (tenantId: string) =>
      ['admin', 'servicos', tenantId] as const,

    horarios: (tenantId: string) =>
      ['admin', 'horarios', tenantId] as const,

    dashboard: (tenantId: string, data: string) =>
      ['admin', 'dashboard', tenantId, data] as const,

    avaliacoes: (tenantId: string) =>
      ['admin', 'avaliacoes', tenantId] as const,

    unidades: (tenantId: string) =>
      ['admin', 'unidades', tenantId] as const,

    timeline: (data: string, barbeiroId?: string | null) =>
      ['admin', 'timeline', data, barbeiroId] as const,

    promocoes: (tenantId: string | null) =>
      ['admin', 'promocoes', tenantId] as const,

    planos: (tenantId: string | null) =>
      ['admin', 'planos', tenantId] as const,

    cupons: (tenantId: string | null) =>
      ['admin', 'cupons', tenantId] as const,

    horariosExcepcionais: () =>
      ['admin', 'horarios-excepcionais'] as const,
  },

  // ── TI ──────────────────────────────────────────────────
  ti: {
    health: () => ['ti', 'health'] as const,
    stats: () => ['ti', 'stats'] as const,
    logs: (pagina: number, dataInicio: string, dataFim: string) =>
      ['ti', 'logs', pagina, dataInicio, dataFim] as const,
    logsPrefix: () => ['ti', 'logs'] as const,
    logsAll: () => ['ti', 'logs-all'] as const,
    dispositivos: () => ['ti', 'dispositivos'] as const,
    webhooks: () => ['ti', 'webhooks'] as const,
    clientes: () => ['ti', 'clientes'] as const,
    database: () => ['ti', 'database'] as const,
    templates: () => ['ti', 'templates'] as const,
    senha: () => ['ti', 'senha'] as const,
  },

  // ── ADMIN ── (sub-módulos)
  adminSub: {
    suporteLogsIA: (filterType: string, filterSuccess: string) =>
      ['admin', 'suporte-logs-ia', filterType, filterSuccess] as const,
    suporteLogsIAPrefix: () => ['admin', 'suporte-logs-ia'] as const,
  },

  // ── FINANCEIRO ─────────────────────────────────────────
  financeiro: {
    overview: (userId: string, barbeiroId?: string | null) =>
      ['financeiro', 'overview', userId, barbeiroId] as const,

    extrato: (userId: string, barbeiroId?: string | null, pagina: number = 0) =>
      ['financeiro', 'extrato', userId, barbeiroId, pagina] as const,

    relatorios: (userId: string, barbeiroId?: string | null) =>
      ['financeiro', 'relatorios', userId, barbeiroId] as const,

    seguranca: (userId: string) =>
      ['financeiro', 'seguranca', userId] as const,

    configuracoes: (userId: string) =>
      ['financeiro', 'configuracoes', userId] as const,

    saque: (userId: string) =>
      ['financeiro', 'saque', userId] as const,
  },

  // ── COMPARTILHADO ────────────────────────────────────────
  shared: {
    tenant: (tenantId: string) =>
      ['shared', 'tenant', tenantId] as const,

    unidades: (tenantId: string) =>
      ['shared', 'unidades', tenantId] as const,

    manutencao: () => ['shared', 'manutencao'] as const,

    permissoes: (userId?: string | null) =>
      userId ? ['user-permissions', userId] as const : ['user-permissions'] as const,

    businessHours: (dayOfWeek: number, barbeiroId: string) =>
      ['business-hours', dayOfWeek, barbeiroId] as const,

    walletStatus: (barbeiroId: string) =>
      ['wallet-status', barbeiroId] as const,

    pinStatus: (userId: string, refreshKey: number) =>
      ['pin-status', userId, refreshKey] as const,

    unitMembers: (unidadeId: string) =>
      ['barber-unit-members', unidadeId] as const,

    estatisticas: (barbeiroId: string | null, period: string, month: string) =>
      ['shared', 'estatisticas', barbeiroId, period, month] as const,
  },

  // ── TENANT ─────────────────────────────────────────────
  tenant: {
    disparo: (tenantId: string, barbeiroId: string) =>
      ['tenant', 'disparo', tenantId, barbeiroId] as const,
  },

  // ── LOJA ──────────────────────────────────────────────
  loja: {
    produtos: (tenantId: string) =>
      ['loja', 'produtos', tenantId] as const,

    produtosAdmin: (tenantId: string) =>
      ['loja', 'produtos-admin', tenantId] as const,

    pedidos: (tenantId: string) =>
      ['loja', 'pedidos', tenantId] as const,

    meusPedidos: (userId: string) =>
      ['loja', 'meus-pedidos', userId] as const,

    stats: (tenantId: string) =>
      ['loja', 'stats', tenantId] as const,

    cupons: (tenantId: string) =>
      ['loja', 'cupons', tenantId] as const,

    vendas: (tenantId: string, periodo: string) =>
      ['loja', 'vendas', tenantId, periodo] as const,

    statsGlobal: () =>
      ['loja', 'stats-global'] as const,
  },
} as const;
