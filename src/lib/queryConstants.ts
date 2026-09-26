/**
 * ═══════════════════════════════════════════════════════════
 * CONSTANTES DE CACHE — DUB BARBER
 * ═══════════════════════════════════════════════════════════
 *
 * Define por quanto tempo cada tipo de dado permanece fresco
 * antes de o TanStack Query considerar necessário um refetch.
 *
 * Regra geral:
 * - Dado que muda em tempo real (agendamentos do dia): staleTime curto
 * - Dado que muda raramente (serviços, horários): staleTime longo
 * - Dado de configuração (perfil, planos): staleTime muito longo
 */

export const STALE_TIMES = {
  /** Agendamentos do dia — Realtime mantém sincronizado; cache longo evita loading ao alternar abas */
  AGENDA_DIA: 1000 * 60 * 5,

  /** Lista de clientes — muda quando novo cliente agenda */
  CLIENTES: 1000 * 60 * 5,

  /** Histórico de cortes — dado histórico, raramente muda */
  HISTORICO: 1000 * 60 * 10,

  /** Avaliações — clientes avaliam após o corte */
  AVALIACOES: 1000 * 60 * 10,

  /** Dados financeiros — extrato e comissões */
  FINANCEIRO: 1000 * 60 * 2,

  /** Relatórios — gerados sob demanda */
  RELATORIOS: 1000 * 60 * 30,

  /** Serviços — raramente alterados pelo admin */
  SERVICOS: 1000 * 60 * 30,

  /** Horários de funcionamento — raramente alterados */
  HORARIOS: 1000 * 60 * 30,

  /** Perfil do barbeiro — muda apenas quando ele edita dados pessoais */
  PERFIL_BARBEIRO: 1000 * 60 * 15,

  /** Dados do tenant/barbearia — mudam raramente */
  TENANT: 1000 * 60 * 30,

  /** Health check do sistema (painel TI) */
  HEALTH_CHECK: 1000 * 30,

  /** Logs de auditoria (painel TI) */
  LOGS: 1000 * 60 * 5,

  /** Dispositivos autorizados (painel TI) */
  DISPOSITIVOS: 1000 * 60 * 10,

  /** Permissões e roles — mudam raramente */
  PERMISSOES: 1000 * 60 * 5,

  /** Status de carteira/wallet — muda ao ativar subconta */
  WALLET: 1000 * 60 * 5,

  /** PIN financeiro — muda apenas ao criar/alterar PIN */
  PIN: 1000 * 60 * 5,

  /** Membros de unidade — muda ao adicionar/remover barbeiro */
  UNIDADE_MEMBROS: 1000 * 30,

  /** Webhooks — configuração raramente alterada */
  WEBHOOKS: 1000 * 60 * 10,

  /** Templates de mensagem — raramente alterados */
  TEMPLATES: 1000 * 60 * 15,

  /** Tabelas do banco (contagem) — raramente muda */
  DATABASE: 1000 * 60 * 5,

  /** Senha TI — config raramente muda */
  SENHA_TI: 1000 * 60 * 30,
} as const;

export const GC_TIMES = {
  /** Agenda fica em cache 5 minutos após componente desmontar */
  AGENDA_DIA: 1000 * 60 * 5,

  /** Dados raramente acessados ficam em cache 30 minutos */
  RELATORIOS: 1000 * 60 * 30,

  /** Padrão geral — 10 minutos (mesmo do QueryClient global) */
  DEFAULT: 1000 * 60 * 10,
} as const;

export const REFETCH_INTERVALS = {
  /** Health check do sistema atualiza a cada 60 segundos */
  HEALTH_CHECK: 1000 * 60,

  /** Sem polling (usa Realtime do Supabase) */
  NONE: false,
} as const;
