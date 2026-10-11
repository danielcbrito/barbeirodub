import { useEffect, Suspense, useState, useRef, useCallback, lazy } from "react";
import { useNavigate, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { differenceInDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { STALE_TIMES } from "@/lib/queryConstants";
import { fetchAgendaDia } from "@/lib/fetchers/agendaFetchers";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BarberSidebar } from "@/components/barber/BarberSidebar";
import { BarberMobileNavigation } from "@/components/barber/mobile/BarberMobileNavigation";
import { BarberMobileDrawer } from "@/components/barber/mobile/BarberMobileDrawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMaintenanceMode } from "@/hooks/useMaintenanceMode";
import { MaintenanceScreen } from "@/components/MaintenanceScreen";
import { MaintenanceWarningBanner } from "@/components/MaintenanceWarningBanner";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { useNotificationPermission } from "@/hooks/useNotificationPermission";
import { useWalletActivationPrompt } from "@/hooks/useWalletActivationPrompt";
import { useWhatsAppStatus } from "@/hooks/useWhatsAppStatus";
import { WalletActivationModal } from "@/components/barber/WalletActivationModal";
import { PendingSetupModal } from "@/components/tenant/PendingSetupModal";
import { useOverdueAppointments } from "@/hooks/useOverdueAppointments";
import { PendingAppointmentsModal } from "@/components/barber/PendingAppointmentsModal";

/* ── Abas primárias (bottom nav): carregadas eager para navegação instantânea ── */
import { BarberDashboard } from "@/components/barber/BarberDashboard";
import { BarberAgenda } from "@/components/barber/BarberAgenda";
import { BarberMobileProfile } from "@/components/barber/mobile/BarberMobileProfile";
import { AdminDisparo } from "@/components/admin/AdminDisparo";
import { AdminCampanhas } from "@/components/admin/AdminCampanhas";
import { BarberCampanhaEmpty } from "@/components/barber/BarberCampanhaEmpty";

/* ── Rotas secundárias: carregadas sob demanda (reduz o bundle inicial) ── */
const BarberHorarios = lazy(() => import("@/components/barber/BarberHorarios").then(m => ({ default: m.BarberHorarios })));
const BarberConfirmacoesPendentes = lazy(() => import("@/components/barber/BarberConfirmacoesPendentes").then(m => ({ default: m.BarberConfirmacoesPendentes })));
const BarberProfile = lazy(() => import("@/components/barber/BarberProfile").then(m => ({ default: m.BarberProfile })));
const EstatisticasRelatorios = lazy(() => import("@/components/shared/EstatisticasRelatorios").then(m => ({ default: m.EstatisticasRelatorios })));
const BarberSettingsPage = lazy(() => import("@/components/profile/BarberSettingsPage").then(m => ({ default: m.BarberSettingsPage })));
const BarberFinanceiro = lazy(() => import("@/components/barber/BarberFinanceiro").then(m => ({ default: m.BarberFinanceiro })));
const BarberClientes = lazy(() => import("@/components/barber/BarberClientes").then(m => ({ default: m.BarberClientes })));
const BarberDadosPessoais = lazy(() => import("@/components/barber/BarberDadosPessoais").then(m => ({ default: m.BarberDadosPessoais })));
const BarberMobileHorarios = lazy(() => import("@/components/barber/mobile/BarberMobileHorarios").then(m => ({ default: m.BarberMobileHorarios })));
const BarberSeguranca = lazy(() => import("@/components/barber/BarberSeguranca").then(m => ({ default: m.BarberSeguranca })));
const BarberSetupScreen = lazy(() => import("@/components/barber/BarberSetupScreen").then(m => ({ default: m.BarberSetupScreen })));
const BarberCortes = lazy(() => import("@/components/barber/BarberCortes").then(m => ({ default: m.BarberCortes })));
const AdminPlanos = lazy(() => import("@/components/admin/AdminPlanos").then(m => ({ default: m.AdminPlanos })));
const AdminMeusPlanos = lazy(() => import("@/components/admin/AdminMeusPlanos").then(m => ({ default: m.AdminMeusPlanos })));
const AdminCupons = lazy(() => import("@/components/admin/AdminCupons").then(m => ({ default: m.AdminCupons })));
const BarberCuponsAtivos = lazy(() => import("@/components/barber/BarberCuponsAtivos").then(m => ({ default: m.BarberCuponsAtivos })));
const AdminIndicacoes = lazy(() => import("@/components/admin/AdminIndicacoes"));
const AdminLoja = lazy(() => import("@/components/admin/loja/AdminLoja").then(m => ({ default: m.AdminLoja })));
const CarteiraPage = lazy(() => import("@/components/barber/CarteiraPage").then(m => ({ default: m.CarteiraPage })));
const AppointmentDetailsPage = lazy(() => import("@/pages/AppointmentDetailsPage"));

import { AlertTriangle } from "lucide-react";
const WhatsAppConnectionPage = lazy(() => import("@/components/whatsapp/WhatsAppConnectionPage").then(m => ({ default: m.WhatsAppConnectionPage })));
const InstagramCallbackHandler = lazy(() => import("@/components/barber/InstagramCallbackHandler").then(m => ({ default: m.InstagramCallbackHandler })));
const PortfolioManager = lazy(() => import("@/components/shared/PortfolioManager").then(m => ({ default: m.PortfolioManager })));
const BarberConfigBarbearia = lazy(() => import("@/components/barber/BarberConfigBarbearia").then(m => ({ default: m.BarberConfigBarbearia })));
const AdminDadosEmpresa = lazy(() => import("@/components/admin/AdminDadosEmpresa").then(m => ({ default: m.AdminDadosEmpresa })));
const AdminAvaliacoes = lazy(() => import("@/components/admin/AdminAvaliacoes").then(m => ({ default: m.AdminAvaliacoes })));
const AdminBarbeiros = lazy(() => import("@/components/admin/AdminBarbeiros").then(m => ({ default: m.AdminBarbeiros })));
const AdminConfiguracoes = lazy(() => import("@/components/admin/AdminConfiguracoes").then(m => ({ default: m.AdminConfiguracoes })));
const AdminUnidades = lazy(() => import("@/components/admin/unidades/AdminUnidades").then(m => ({ default: m.AdminUnidades })));
import { BarberPushPermissionBanner } from "@/components/barber/BarberPushPermissionBanner";
import { SupportChatBubble } from "@/components/support/SupportChatBubble";
import { usePerformanceMonitor } from "@/hooks/usePerformanceMonitor";
import { useAuthReady } from "@/hooks/useAuthReady";
import { applyBarberBootBundle } from "@/lib/prefetch/barberHomeBundlePrefetch";

export interface BarberContext {
  barbeiroId: string;
  apelido: string;
  userId: string;
  /** Se preenchido, barbeiro está em período de graça pós-exclusão */
  deletedAt: string | null;
  /** Dias restantes no período de graça (0-7) */
  graceDaysLeft: number;
  /** ID do tenant (barbearia) ao qual o barbeiro pertence */
  tenantId: string | null;
  /** Controle para regras/UX que só o dono/admin da operação deve ver */
  isTenantAdmin: boolean;
  /** Permissão específica para bloqueio global de clientes na barbearia */
  canManageTenantWideClientBlock: boolean;
}

type BarberAppContextFast = {
  barbeiro: {
    id: string;
    apelido: string | null;
    user_id: string;
    deleted_at: string | null;
    setup_completed: boolean | null;
    tenant_id: string | null;
  } | null;
  roles: string[];
  ownerTenantId: string | null;
  tenantNome: string | null;
  canManageTenantWideClientBlock: boolean | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toStringOrNull = (value: unknown) =>
  typeof value === "string" ? value : null;

const toBooleanOrNull = (value: unknown) =>
  typeof value === "boolean" ? value : null;

const parseBarberAppContext = (value: unknown): BarberAppContextFast => {
  if (!isRecord(value)) {
    return { barbeiro: null, roles: [], ownerTenantId: null, tenantNome: null, canManageTenantWideClientBlock: null };
  }

  const barberRaw = value.barbeiro;
  const barbeiro = isRecord(barberRaw)
    ? {
        id: toStringOrNull(barberRaw.id) || "",
        apelido: toStringOrNull(barberRaw.apelido),
        user_id: toStringOrNull(barberRaw.user_id) || "",
        deleted_at: toStringOrNull(barberRaw.deleted_at),
        setup_completed: toBooleanOrNull(barberRaw.setup_completed),
        tenant_id: toStringOrNull(barberRaw.tenant_id),
      }
    : null;

  return {
    barbeiro: barbeiro?.id ? barbeiro : null,
    roles: Array.isArray(value.roles) ? value.roles.filter((role): role is string => typeof role === "string") : [],
    ownerTenantId: toStringOrNull(value.ownerTenantId),
    tenantNome: toStringOrNull(value.tenantNome),
    canManageTenantWideClientBlock: toBooleanOrNull(value.canManageTenantWideClientBlock),
  };
};

const BARBER_CONTEXT_CACHE_KEY = "dub-barber-context-v1";
const BARBER_PENDING_COUNT_CACHE_KEY_PREFIX = "dub:barber-pending-count:v1:";

type BarberContextApplyResult = "ready" | "redirected";

type CachedBarberSnapshot = {
  barberContext: BarberContext;
  tenantNome: string;
  needsSetup: boolean;
};

import { hasStoredSupabaseSession, getStoredSupabaseUserId, clearDeviceCaches } from "@/lib/sessionGuard";

const readCachedBarberSnapshot = (): CachedBarberSnapshot | null => {
  if (typeof window === "undefined") return null;
  // Segurança: sem sessão Supabase válida no dispositivo, não hidrata cache.
  if (!hasStoredSupabaseSession()) return null;
  try {
    const raw = window.localStorage.getItem(BARBER_CONTEXT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.barberContext?.barbeiroId) return null;
    return parsed as CachedBarberSnapshot;
  } catch {
    return null;
  }
};

const readCachedPendingCount = (barbeiroId?: string | null) => {
  if (!barbeiroId || typeof window === "undefined") return 0;
  if (!hasStoredSupabaseSession()) return 0;
  try {
    const raw = window.localStorage.getItem(BARBER_PENDING_COUNT_CACHE_KEY_PREFIX + barbeiroId);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
};

const writeCachedPendingCount = (barbeiroId: string, count: number) => {
  try {
    window.localStorage.setItem(BARBER_PENDING_COUNT_CACHE_KEY_PREFIX + barbeiroId, String(count));
  } catch {}
};

const Barbeiro = () => {
  const navigate = useNavigate();
  const modoDebug = import.meta.env.VITE_PERF_DEBUG === 'true';
  usePerformanceMonitor(modoDebug);
  const location = useLocation();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  // Hidratação síncrona a partir do localStorage: se o barbeiro já entrou
  // uma vez neste dispositivo, a tela renderiza instantaneamente enquanto
  // revalidamos o contexto em background.
  const [cachedSnapshot] = useState(() => readCachedBarberSnapshot());
  const [authChecked, setAuthChecked] = useState<boolean>(!!cachedSnapshot);
  const [barberContext, setBarberContext] = useState<BarberContext | null>(cachedSnapshot?.barberContext ?? null);
  const [tenantNome, setTenantNome] = useState<string>(cachedSnapshot?.tenantNome ?? "");
  const [needsSetup, setNeedsSetup] = useState(cachedSnapshot?.needsSetup ?? false);
  const authCheckRef = useRef(false);
  const bootBundleAppliedAtRef = useRef(0);
  const { playNotificationSound } = useNotificationSound();
  const { requestPermission, sendBrowserNotification } = useNotificationPermission();
  const walletPrompt = useWalletActivationPrompt(barberContext?.barbeiroId || null);
  const whatsAppStatus = useWhatsAppStatus(barberContext?.barbeiroId || null);
  const [pendingSetupOpen, setPendingSetupOpen] = useState(false);
  const { user: authUser, isReady: isAuthReady } = useAuthReady();

  useEffect(() => {
    try { sessionStorage.setItem("dub-last-barbeiro-route", location.pathname); } catch {}
  }, [location.pathname]);

  // Abrir modal de pendências (1x por sessão) — igual ao TenantAdmin
  useEffect(() => {
    if (!authChecked || !barberContext) return;
    if (whatsAppStatus.isLoading || walletPrompt.isLoading) return;
    if (whatsAppStatus.resolvedBarbeiroId !== barberContext.barbeiroId) return;
    if (walletPrompt.resolvedBarbeiroId !== barberContext.barbeiroId) return;

    const sessionKey = `pending_setup_shown_${barberContext.barbeiroId}`;
    if (sessionStorage.getItem(sessionKey)) return;

    const hasPending = !whatsAppStatus.isConnected || walletPrompt.walletActive === false;
    if (hasPending) {
      setPendingSetupOpen(true);
      sessionStorage.setItem(sessionKey, "1");
    }
  }, [authChecked, barberContext, whatsAppStatus.isLoading, whatsAppStatus.isConnected, whatsAppStatus.resolvedBarbeiroId, walletPrompt.isLoading, walletPrompt.walletActive, walletPrompt.resolvedBarbeiroId]);

  // Monitoramento de agendamentos vencidos/em aberto
  const overdueState = useOverdueAppointments(barberContext?.barbeiroId);
  const [isOverdueModalOpen, setIsOverdueModalOpen] = useState(false);
  const hasAutoPromptedOverdueRef = useRef(false);

  useEffect(() => {
    if (!barberContext?.barbeiroId || overdueState.isLoading) return;

    if (overdueState.count > 0 && !hasAutoPromptedOverdueRef.current) {
      const promptedThisSession = typeof window !== "undefined" && window.sessionStorage.getItem("overdue_prompted_v1") === "1";
      if (overdueState.hasOverduePastDays || !promptedThisSession) {
        setIsOverdueModalOpen(true);
        hasAutoPromptedOverdueRef.current = true;
        try {
          window.sessionStorage.setItem("overdue_prompted_v1", "1");
        } catch {}
      }
    }
  }, [barberContext?.barbeiroId, overdueState.count, overdueState.hasOverduePastDays, overdueState.isLoading]);

  useEffect(() => {
    const handleOpen = () => setIsOverdueModalOpen(true);
    window.addEventListener("open-overdue-modal", handleOpen);
    return () => window.removeEventListener("open-overdue-modal", handleOpen);
  }, []);

  // Verificação de manutenção
  const { 
    isMaintenanceMode, 
    maintenanceMessage, 
    isLoading: maintenanceLoading, 
    isAllowedUser,
    warningActive,
    warningMessage,
    warningPublico,
  } = useMaintenanceMode();

  // Banner de barbeiro: só aparece se o público for 'barbeiro' ou 'ambos'
  const showBarberBanner = warningActive && warningMessage && (warningPublico === 'barbeiro' || warningPublico === 'ambos');

  // Solicitar permissão de notificação ao montar
  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;

        if (event === 'SIGNED_OUT' && !session) {
          authCheckRef.current = false;
          setAuthChecked(false);
          setBarberContext(null);
          // Limpa TODO cache do dispositivo — evita que próxima abertura
          // (mesmo dispositivo, outro usuário) exiba dados anteriores.
          clearDeviceCaches();
          navigate("/", { replace: true });
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  // Carregar contagem de pendentes (agendamentos + planos cash)
  useEffect(() => {
    if (!barberContext) return;
    setPendingCount(readCachedPendingCount(barberContext.barbeiroId));

    const loadPendingCount = async () => {
      const { count } = await supabase
        .from('assinaturas')
        .select('*', { count: 'exact', head: true })
        .eq('barbeiro_id', barberContext.barbeiroId)
        .eq('payment_method', 'cash')
        .or('status.in.(suspended,pending_cash),and(status.eq.active,cash_payment_confirmed.eq.false)');

      const nextCount = count || 0;
      setPendingCount(nextCount);
      writeCachedPendingCount(barberContext.barbeiroId, nextCount);
    };

    loadPendingCount();

    /**
     * Busca dados detalhados do agendamento para montar notificação rica.
     * Inclui nome do cliente, serviço, data e hora — estilo WhatsApp.
     */
    const fetchAppointmentDetails = async (appointmentId: string) => {
      try {
        const { data } = await supabase
          .from("agendamentos")
          .select(`
            data, hora, preco,
            servicos:servico_id ( nome ),
            profiles:user_id ( nome )
          `)
          .eq("id", appointmentId)
          .maybeSingle();

        if (!data) return null;

        const clienteNome = (data.profiles as any)?.nome || "Cliente";
        const servicoNome = (data.servicos as any)?.nome || "Serviço";
        const firstName = clienteNome.split(" ")[0];

        // Formatar data em pt-BR
        const [, mes, dia] = (data.data || "").split("-");
        const dataFormatada = dia && mes ? `${dia}/${mes}` : data.data;

        // Formatar hora (HH:MM)
        const horaFormatada = typeof data.hora === "string"
          ? data.hora.substring(0, 5)
          : data.hora;

        return {
          clienteNome: firstName,
          servicoNome,
          data: dataFormatada,
          hora: horaFormatada,
          preco: data.preco,
        };
      } catch {
        return null;
      }
    };

    let ch1: ReturnType<typeof supabase.channel> | null = null;
    let ch2: ReturnType<typeof supabase.channel> | null = null;
    try {
      ch1 = supabase
        .channel(`barber-pending-agendamentos-${barberContext.barbeiroId}-${Math.random().toString(36).slice(2, 9)}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'agendamentos',
          filter: `barbeiro_id=eq.${barberContext.barbeiroId}`
        }, async (payload) => {
          loadPendingCount();
          if (payload.eventType === 'INSERT') {
            playNotificationSound();

            // Buscar detalhes do agendamento para notificação rica
            const details = await fetchAppointmentDetails(
              (payload.new as Record<string, unknown>).id as string
            );

            if (details) {
              sendBrowserNotification("✂️ Novo Agendamento!", {
                body: `${details.clienteNome} agendou ${details.servicoNome} para ${details.data} às ${details.hora}`,
                tag: `new-appointment-${(payload.new as Record<string, unknown>).id}`,
              });
            } else {
              sendBrowserNotification("✂️ Novo Agendamento!", {
                body: "Um novo cliente agendou com você. Confira sua agenda.",
                tag: "new-appointment",
              });
            }
          }
        }).subscribe();

      ch2 = supabase
        .channel(`barber-pending-planos-${barberContext.barbeiroId}-${Math.random().toString(36).slice(2, 9)}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'assinaturas',
          filter: `barbeiro_id=eq.${barberContext.barbeiroId}`
        }, (payload) => {
          loadPendingCount();
          if (payload.eventType === 'INSERT' && (payload.new as Record<string, unknown>)?.payment_method === 'cash') {
            playNotificationSound();
            sendBrowserNotification("💈 Novo Plano Pendente!", {
              body: "Um cliente solicitou ativação de plano. Confirme o pagamento.",
              tag: "new-plan-payment",
            });
          }
        }).subscribe();
    } catch (err) {
      console.warn('[Barbeiro] Erro ao conectar canais de pendencias:', err);
    }

    return () => {
      if (ch1) {
        try { supabase.removeChannel(ch1); } catch {}
      }
      if (ch2) {
        try { supabase.removeChannel(ch2); } catch {}
      }
    };
  }, [barberContext, playNotificationSound, sendBrowserNotification]);

  const applyValidatedBarberContext = useCallback((userId: string, appContext: unknown): BarberContextApplyResult => {
    const fastContext = parseBarberAppContext(appContext);
    const roles = fastContext.roles;
    const barbeiro = fastContext.barbeiro;
    const ownerTenantId = fastContext.ownerTenantId;

    const hasBarberRole = roles.includes("barber") || roles.includes("barbeiro");
    const hasAdminRole = roles.includes("admin");
    const hasTenantAdminRole = roles.includes("tenant_admin");

    // Se não tem role de barbeiro, ainda permitimos acesso quando existe perfil de barbeiro válido
    if (!hasBarberRole && !barbeiro) {
      if (hasAdminRole) {
        navigate("/admin", { replace: true });
        return "redirected";
      }

      if (hasTenantAdminRole || ownerTenantId) {
        navigate("/admin", { replace: true });
        return "redirected";
      }

      toast.error("Você não tem permissão para acessar este sistema.");
      navigate("/", { replace: true });
      return "redirected";
    }

    if (!barbeiro) {
      toast.error("Seu perfil de barbeiro não foi encontrado.");
      navigate("/", { replace: true });
      return "redirected";
    }

    const resolvedTenantId = barbeiro.tenant_id || ownerTenantId || null;

    // Verificar período de graça (7 dias)
    const deletedAt = barbeiro.deleted_at as string | null;
    let graceDaysLeft = 0;

    if (deletedAt) {
      const daysSinceDeletion = differenceInDays(new Date(), new Date(deletedAt));
      graceDaysLeft = Math.max(0, 7 - daysSinceDeletion);

      if (graceDaysLeft <= 0) {
        toast.error("Seu acesso expirou. Conta removida.");
        navigate("/", { replace: true });
        return "redirected";
      }
    }

    const setupDone = barbeiro.setup_completed === true;
    setNeedsSetup(!setupDone);

    setTenantNome(fastContext.tenantNome || "");

    const canManageTenantWideClientBlock = fastContext.canManageTenantWideClientBlock ?? !!ownerTenantId;

    const nextContext: BarberContext = {
      barbeiroId: barbeiro.id,
      apelido: barbeiro.apelido || "Barbeiro",
      userId,
      deletedAt,
      graceDaysLeft,
      tenantId: resolvedTenantId || null,
      isTenantAdmin: hasTenantAdminRole || hasAdminRole || !!ownerTenantId,
      canManageTenantWideClientBlock,
    };
    setBarberContext(nextContext);

    // Persistir contexto para hidratação instantânea nas próximas montagens
    try {
      window.localStorage.setItem(
        BARBER_CONTEXT_CACHE_KEY,
        JSON.stringify({
          barberContext: nextContext,
          tenantNome: fastContext.tenantNome || "",
          needsSetup: !setupDone,
        }),
      );
    } catch {}

    localStorage.setItem("userRole", "barber");
    localStorage.setItem("barbeiroId", barbeiro.id);
    setAuthChecked(true);
    return "ready";
  }, [navigate]);

  const checkAuth = useCallback(async (userId: string) => {
    try {
      const { data: bootData, error: contextError } = await supabase.rpc("get_barber_boot_bundle");

      if (contextError) {
        throw contextError;
      }

      const { appContext } = applyBarberBootBundle(bootData, queryClient);
      bootBundleAppliedAtRef.current = Date.now();

      if (!appContext) {
        throw new Error("Contexto do barbeiro não retornado pelo bundle de inicialização.");
      }

      applyValidatedBarberContext(userId, appContext);

      /* Prefetch: NÃO chamamos aqui — o useEffect abaixo (dependente de
       * barberContext) já dispara o mesmo cascade em requestIdleCallback
       * assim que o contexto está disponível (inclusive vindo do cache
       * localStorage, antes mesmo desta RPC responder). Duplicar aqui
       * dobrava a carga de rede no cold start. */
    } catch (error) {
      console.error("[Barbeiro] Falha ao validar sessão:", error);

      try {
        // Fallback leve: valida só contexto/role sem depender do snapshot do início.
        const { data: appContext, error: fallbackError } = await supabase.rpc("get_barber_app_context_fast");
        if (!fallbackError && appContext) {
          applyValidatedBarberContext(userId, appContext);
          authCheckRef.current = false;
          return;
        }
        if (fallbackError) {
          console.error("[Barbeiro] Fallback de contexto falhou:", fallbackError);
        }
      } catch (fallbackException) {
        console.error("[Barbeiro] Fallback de contexto indisponível:", fallbackException);
      }

      if (barberContext || cachedSnapshot?.barberContext) {
        // Não destrói/redireciona sessão válida por erro transitório de RPC/rede.
        // Mantém a última tela útil e libera nova tentativa em background.
        setAuthChecked(true);
        authCheckRef.current = false;
        toast.warning("Mantivemos seu acesso. A conexão será revalidada em instantes.");
        return;
      }

      toast.error("Não foi possível validar sua sessão. Tente novamente.");
      navigate("/", { replace: true });
    }
  }, [applyValidatedBarberContext, barberContext, cachedSnapshot, navigate, queryClient]);

  // Pré-aquecimento agressivo: assim que existe contexto (até vindo do cache),
  // dashboard/agenda/perfil/disparo são hidratados em background. A UI nunca
  // espera essas chamadas; ela usa o último snapshot local e atualiza depois.
  useEffect(() => {
    if (!barberContext?.barbeiroId) return;

    const barbeiroId = barberContext.barbeiroId;
    const hoje = new Date().toISOString().split("T")[0];
    const amanha = new Date(Date.now() + 86400000).toISOString().split("T")[0];

    const run = () => {
      if (Date.now() - bootBundleAppliedAtRef.current < 3000) {
        return;
      }

      void Promise.allSettled([
        // Dashboard + Perfil em UMA única chamada ao banco (bundle RPC).
        import("@/lib/prefetch/barberHomeBundlePrefetch").then(({ prefetchBarberHomeBundle }) =>
          prefetchBarberHomeBundle(barbeiroId, authUser?.email ?? "", queryClient),
        ),
        queryClient.prefetchQuery({
          queryKey: QUERY_KEYS.barbeiro.agenda(barbeiroId, hoje),
          queryFn: () => fetchAgendaDia(barbeiroId, hoje),
          staleTime: STALE_TIMES.AGENDA_DIA,
        }),
        queryClient.prefetchQuery({
          queryKey: QUERY_KEYS.barbeiro.agenda(barbeiroId, amanha),
          queryFn: () => fetchAgendaDia(barbeiroId, amanha),
          staleTime: STALE_TIMES.AGENDA_DIA,
        }),
        import("@/hooks/useBarberClientes").then(({ fetchBarberClientes }) =>
          queryClient.prefetchQuery({
            queryKey: QUERY_KEYS.barbeiro.clientes(barbeiroId),
            queryFn: () => fetchBarberClientes(barbeiroId),
            staleTime: 1000 * 60 * 5,
          }),
        ),
      ]);
    };


    // Dispara IMEDIATAMENTE (sem esperar idle) — dashboard/agenda são
    // exatamente o que a UI mostra em seguida, então adiar prejudica o TTI.
    run();
    return () => {};
  }, [barberContext, authUser?.email, queryClient]);

  // Cold start: dispara checkAuth IMEDIATAMENTE se há user id armazenado,
  // sem esperar getSession()/onAuthStateChange resolverem. O supabase-js
  // já anexa o token de localStorage ao header da RPC. Economiza ~500ms-1.5s
  // no primeiro paint quando o usuário abre o app sem cache de contexto.
  useEffect(() => {
    if (authCheckRef.current) return;
    const storedUserId = getStoredSupabaseUserId();
    if (!storedUserId) return;
    authCheckRef.current = true;
    void checkAuth(storedUserId);
  }, [checkAuth]);

  useEffect(() => {
    if (!isAuthReady || authCheckRef.current) return;

    authCheckRef.current = true;

    if (!authUser) {
      if (cachedSnapshot?.barberContext) {
        // Mantém a última tela útil em vez de mostrar loader/redirecionar durante
        // restauração lenta da sessão em iOS/Android. O Supabase revalida em background.
        setAuthChecked(true);
        authCheckRef.current = false;
        return;
      }
      navigate("/", { replace: true });
      return;
    }

    void checkAuth(authUser.id);
  }, [authUser, isAuthReady, navigate, checkAuth, cachedSnapshot]);

  // Se está em manutenção e o usuário NÃO está na lista de permitidos
  if (!maintenanceLoading && authChecked && isMaintenanceMode && !isAllowedUser) {
    return (
      <MaintenanceScreen 
        message={maintenanceMessage || undefined}
        onExit={() => navigate("/")}
      />
    );
  }

  const handleCloseDrawer = () => setIsDrawerOpen(false);

  // Layout Loading
  const LoadingFallback = () => <div className="min-h-[40vh] bg-background" />;

  // Loading state: só bloqueamos se ainda não temos contexto (nem via cache
  // nem via revalidação). A verificação de manutenção roda em background e
  // pode assumir a tela depois — não deve atrasar o primeiro paint.
  if (!barberContext) {
    return <div className="min-h-app bg-background" />;
  }

  // Setup incompleto: se ainda não foi dispensado pelo usuário nesta sessão
  const isSetupDismissed = typeof window !== "undefined" && window.sessionStorage.getItem("barber_setup_dismissed") === "1";
  if (needsSetup && !isSetupDismissed) {
    return (
      <BarberSetupScreen
        barberContext={barberContext}
        onSetupComplete={() => {
          setNeedsSetup(false);
          try { window.sessionStorage.setItem("barber_setup_dismissed", "1"); } catch {}
        }}
      />
    );
  }

  const isInGracePeriod = !!barberContext.deletedAt;

  /** Banner de aviso do período de graça */
  const GracePeriodBanner = () => {
    if (!isInGracePeriod) return null;
    return (
      <div className="mx-3 sm:mx-4 mt-2 mb-1 rounded-xl border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[12px] font-semibold text-destructive">
            Conta removida — {barberContext.graceDaysLeft} dia{barberContext.graceDaysLeft !== 1 ? "s" : ""} restante{barberContext.graceDaysLeft !== 1 ? "s" : ""}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Resolva pendências financeiras antes do encerramento definitivo.
          </p>
        </div>
      </div>
    );
  };

  /** Redireciona rotas restritas para financeiro no período de graça */
  const GraceRedirect = () => <Navigate to="/barbeiro/financeiro" replace />;

  // ========== LAYOUT MOBILE ==========
  if (isMobile) {
    return (
      <div className="flex flex-col min-h-app w-full bg-background">
        {/* Modal de pendências de configuração */}
        <PendingSetupModal
          open={pendingSetupOpen}
          onClose={() => setPendingSetupOpen(false)}
          whatsappConnected={whatsAppStatus.isConnected}
          walletActive={walletPrompt.walletActive === true}
          basePath="/barbeiro"
        />

        {/* Modal automático de ativação da carteira */}
        <WalletActivationModal
          open={walletPrompt.shouldShowModal}
          onOpenChange={(open) => !open && walletPrompt.dismissModal()}
          barbeiroId={barberContext.barbeiroId}
          barberName={walletPrompt.barberName}
          onSuccess={walletPrompt.onActivated}
        />

        {/* Modal de confirmação em lote de agendamentos pendentes */}
        <PendingAppointmentsModal
          open={isOverdueModalOpen}
          onOpenChange={setIsOverdueModalOpen}
          appointments={overdueState.overdueAppointments}
          onCompleteBulk={overdueState.completeBulk}
          isCompleting={overdueState.isCompleting}
        />

        {/* Banner de aviso de manutenção (barbeiro/ambos) */}
        {showBarberBanner && (
          <MaintenanceWarningBanner message={warningMessage!} />
        )}

        {/* Drawer Menu */}
        {!isInGracePeriod && (
          <BarberMobileDrawer 
            isOpen={isDrawerOpen}
            onClose={handleCloseDrawer}
            pendingCount={pendingCount}
            barberContext={barberContext}
          />
        )}

        {/* Banner de período de graça */}
        <GracePeriodBanner />

        {/* Conteúdo Principal */}
        <main
          className={cn(
            "flex-1 min-h-0 bg-background",
            (location.pathname.includes("/barbeiro/promocoes") || location.pathname.includes("/barbeiro/carteira") || location.pathname.includes("/agenda") || location.pathname.includes("/disparo") || location.pathname.includes("/config-barbearia") || location.pathname.includes("/whatsapp")) && "pb-0"
          )}
          style={
            location.pathname.includes("/barbeiro/promocoes") || location.pathname.includes("/barbeiro/carteira") || location.pathname.includes("/agenda") || location.pathname.includes("/disparo") || location.pathname.includes("/config-barbearia") || location.pathname.includes("/whatsapp")
              ? undefined
              : { paddingBottom: "calc(5.25rem + var(--app-safe-bottom, 8px))" }
          }
        >
          <div
            className={cn(
              location.pathname.includes("/perfil") || location.pathname.includes("/barbeiro/carteira") || location.pathname.includes("/barbeiro/promocoes") || location.pathname.includes("/agenda") || location.pathname.includes("/disparo") || location.pathname.includes("/whatsapp") || location.pathname.includes("/config-barbearia")
                ? "p-0"
                : "px-3 sm:px-4 py-2"
            )}
            style={
              location.pathname.includes("/perfil") || location.pathname.includes("/barbeiro/carteira") || location.pathname.includes("/barbeiro/promocoes") || location.pathname.includes("/agenda") || location.pathname.includes("/disparo") || location.pathname.includes("/whatsapp") || location.pathname.includes("/config-barbearia")
                ? undefined
                : { paddingTop: "calc(0.5rem + var(--app-safe-top, env(safe-area-inset-top, 0px)))" }
            }
          >


            {!location.pathname.includes("/barbeiro/promocoes") && !location.pathname.includes("/perfil") && !location.pathname.includes("/config-barbearia") && !location.pathname.includes("/whatsapp") && !isInGracePeriod && (
              <div className="mb-3">
                <BarberPushPermissionBanner barbeiroId={barberContext.barbeiroId} />
              </div>
            )}

            <Suspense fallback={<LoadingFallback />}>
              <Routes>
                {isInGracePeriod ? (
                  <>
                    <Route index element={<GraceRedirect />} />
                    <Route path="financeiro" element={<BarberFinanceiro barberContext={barberContext} />} />
                    <Route path="perfil" element={<BarberMobileProfile barberContext={barberContext} isTenantAdmin={barberContext.isTenantAdmin} />} />
                    <Route path="*" element={<GraceRedirect />} />
                  </>
                ) : (
                  <>
                    <Route index element={<BarberDashboard barberContext={barberContext} isTenantAdmin={barberContext.isTenantAdmin} tenantNome={tenantNome || undefined} />} />
                    <Route path="confirmacoes" element={<BarberConfirmacoesPendentes barberContext={barberContext} />} />
                    <Route path="agenda" element={<BarberAgenda barberContext={barberContext} />} />
                    <Route path="agendamento/:appointmentId" element={<AppointmentDetailsPage basePath="/barbeiro" />} />
                    <Route path="clientes" element={<BarberClientes barberContext={barberContext} />} />
                    <Route path="servicos" element={<BarberCortes barberContext={barberContext} />} />
                    <Route path="relatorios" element={<EstatisticasRelatorios barbeiroId={barberContext.barbeiroId} tenantId={barberContext.tenantId} basePath="/barbeiro/perfil" />} />
                    <Route path="financeiro" element={<BarberFinanceiro barberContext={barberContext} />} />
                    <Route path="horarios" element={<BarberMobileHorarios barberContext={barberContext} />} />
                    <Route path="planos" element={<AdminPlanos tenantId={barberContext.tenantId || undefined} basePath="/barbeiro" />} />
                    <Route path="meus-planos" element={<AdminMeusPlanos basePath="/barbeiro" />} />
                    <Route path="loja" element={barberContext.tenantId ? <AdminLoja tenantId={barberContext.tenantId} readOnly /> : null} />
                    <Route path="cupons" element={<AdminCupons tenantId={barberContext.tenantId || undefined} />} />
                    <Route path="cupons-ativos" element={<BarberCuponsAtivos tenantId={barberContext.tenantId} />} />
                    <Route path="indicacoes" element={barberContext.isTenantAdmin ? <AdminIndicacoes /> : <Navigate to="/barbeiro" replace />} />
                    <Route path="promocoes" element={barberContext.isTenantAdmin ? <AdminCampanhas tenantId={barberContext.tenantId || undefined} basePath="/barbeiro" /> : <BarberCampanhaEmpty basePath="/barbeiro" />} />
                    <Route path="disparo" element={<AdminDisparo barbeiroId={barberContext.barbeiroId} tenantId={barberContext.tenantId || undefined} basePath="/barbeiro" canSelectAllClients={false} />} />
                    <Route path="meus-dados/*" element={<BarberDadosPessoais barberContext={barberContext} />} />
                    <Route path="seguranca/*" element={<BarberSeguranca />} />
                    <Route path="perfil" element={<BarberMobileProfile barberContext={barberContext} isTenantAdmin={barberContext.isTenantAdmin} />} />
                    <Route path="carteira" element={<CarteiraPage barbeiroId={barberContext.barbeiroId} barbeiroNome={barberContext.apelido} basePath="/barbeiro" />} />
                    <Route path="configuracoes-perfil" element={<BarberSettingsPage />} />
                    <Route path="whatsapp" element={<WhatsAppConnectionPage barbeiroId={barberContext.barbeiroId} basePath="/barbeiro" tenantNome={tenantNome} barberName={barberContext.apelido} tenantId={barberContext.tenantId} />} />
                    <Route path="instagram-callback" element={<InstagramCallbackHandler barbeiroId={barberContext.barbeiroId} basePath="/barbeiro" />} />
                    <Route path="portfolio" element={<PortfolioManager barbeiroId={barberContext.barbeiroId} tenantId={barberContext.tenantId} title="Meu Portfólio" showBack onBack={() => navigate("/barbeiro/perfil")} />} />
                    {barberContext.isTenantAdmin && (
                      <>
                        <Route path="config-barbearia" element={<BarberConfigBarbearia barberContext={barberContext} />} />
                        <Route path="dados-empresa/*" element={<AdminDadosEmpresa basePath="/barbeiro" tenantId={barberContext.tenantId} />} />
                        <Route path="avaliacoes" element={<AdminAvaliacoes tenantId={barberContext.tenantId || undefined} basePath="/barbeiro" />} />
                        <Route path="barbeiros" element={<AdminBarbeiros basePath="/barbeiro" />} />
                        <Route path="configuracoes" element={<AdminConfiguracoes />} />
                        <Route path="unidades" element={<AdminUnidades basePath="/barbeiro" />} />
                      </>
                    )}
                  </>
                )}
              </Routes>
            </Suspense>
          </div>
        </main>

        {/* Bottom Navigation Mobile — esconder no período de graça, configurações, horários, financeiro e disparo */}
        {!isInGracePeriod && !location.pathname.includes("configuracoes-perfil") && !location.pathname.includes("horarios") && !location.pathname.includes("financeiro") && !location.pathname.includes("meus-dados") && !location.pathname.includes("seguranca") && !location.pathname.includes("clientes") && !location.pathname.includes("relatorios") && !location.pathname.includes("servicos") && !location.pathname.includes("planos") && !location.pathname.includes("cupons") && !location.pathname.includes("promocoes") && !location.pathname.includes("whatsapp") && !location.pathname.includes("portfolio") && !location.pathname.includes("loja") && !location.pathname.includes("config-barbearia") && !location.pathname.includes("dados-empresa") && !location.pathname.includes("barbeiros") && !location.pathname.includes("avaliacoes") && !location.pathname.includes("configuracoes") && !location.pathname.includes("unidades") && !location.pathname.includes("agendamento") && !location.pathname.includes("disparo") && (
          <BarberMobileNavigation barbeiroId={barberContext?.barbeiroId} />
        )}
        <SupportChatBubble />
      </div>
    );
  }

  // ========== LAYOUT DESKTOP ==========
  return (
    <div className="flex flex-col min-h-screen w-full overflow-hidden bg-background">
      {/* Modal de pendências de configuração (desktop) */}
      <PendingSetupModal
        open={pendingSetupOpen}
        onClose={() => setPendingSetupOpen(false)}
        whatsappConnected={whatsAppStatus.isConnected}
        walletActive={walletPrompt.walletActive === true}
        basePath="/barbeiro"
      />

      {/* Modal de confirmação em lote de agendamentos pendentes (desktop) */}
      <PendingAppointmentsModal
        open={isOverdueModalOpen}
        onOpenChange={setIsOverdueModalOpen}
        appointments={overdueState.overdueAppointments}
        onCompleteBulk={overdueState.completeBulk}
        isCompleting={overdueState.isCompleting}
      />
      {showBarberBanner && (
        <MaintenanceWarningBanner message={warningMessage!} />
      )}

      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar fixa à esquerda */}
        {!isInGracePeriod && <BarberSidebar barberContext={barberContext} pendingCount={pendingCount} tenantNome={tenantNome || undefined} />}
        
        {/* Conteúdo principal */}
        <main className="relative z-10 flex-1 flex flex-col overflow-hidden transition-all duration-300">
          {/* Banner desktop grace period */}
          {isInGracePeriod && (
            <div className="flex-shrink-0 mx-6 mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] font-semibold text-destructive">
                  Conta removida — {barberContext.graceDaysLeft} dia{barberContext.graceDaysLeft !== 1 ? "s" : ""} restante{barberContext.graceDaysLeft !== 1 ? "s" : ""}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Resolva pendências financeiras antes do encerramento definitivo.
                </p>
              </div>
            </div>
          )}
          <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none">
            <div className={cn(
              "max-w-[1600px] mx-auto",
              (location.pathname.includes("/config-barbearia") || location.pathname.includes("/whatsapp") || location.pathname.includes("/perfil"))
                ? "p-0"
                : "p-6 lg:p-8"
            )}>
              <Suspense fallback={<LoadingFallback />}>
                <Routes>
                  {isInGracePeriod ? (
                    <>
                      <Route index element={<GraceRedirect />} />
                      <Route path="financeiro" element={<BarberFinanceiro barberContext={barberContext} />} />
                      <Route path="perfil" element={<div className="max-w-2xl mx-auto"><BarberMobileProfile barberContext={barberContext} isTenantAdmin={barberContext.isTenantAdmin} /></div>} />
                      <Route path="*" element={<GraceRedirect />} />
                    </>
                  ) : (
                    <>
                      <Route index element={<BarberDashboard barberContext={barberContext} isTenantAdmin={barberContext.isTenantAdmin} />} />
                      <Route path="confirmacoes" element={<BarberConfirmacoesPendentes barberContext={barberContext} />} />
                      <Route path="agenda" element={<BarberAgenda barberContext={barberContext} />} />
                      <Route path="agendamento/:appointmentId" element={<AppointmentDetailsPage basePath="/barbeiro" />} />
                      <Route path="clientes" element={<BarberClientes barberContext={barberContext} />} />
                      <Route path="servicos" element={<BarberCortes barberContext={barberContext} />} />
                      <Route path="relatorios" element={<EstatisticasRelatorios barbeiroId={barberContext.barbeiroId} tenantId={barberContext.tenantId} basePath="/barbeiro/perfil" />} />
                      <Route path="financeiro" element={<BarberFinanceiro barberContext={barberContext} />} />
                      <Route path="horarios" element={<BarberHorarios barberContext={barberContext} />} />
                      <Route path="planos" element={<AdminPlanos tenantId={barberContext.tenantId || undefined} basePath="/barbeiro" />} />
                      <Route path="loja" element={barberContext.tenantId ? <AdminLoja tenantId={barberContext.tenantId} readOnly /> : null} />
                      <Route path="cupons" element={<AdminCupons tenantId={barberContext.tenantId || undefined} />} />
                      <Route path="cupons-ativos" element={<BarberCuponsAtivos tenantId={barberContext.tenantId} />} />
                      <Route path="indicacoes" element={barberContext.isTenantAdmin ? <AdminIndicacoes /> : <Navigate to="/barbeiro" replace />} />
                      <Route path="promocoes/preparando" element={<Navigate to="/barbeiro/promocoes" replace />} />
                      <Route path="promocoes" element={barberContext.isTenantAdmin ? <AdminCampanhas tenantId={barberContext.tenantId || undefined} basePath="/barbeiro" /> : <BarberCampanhaEmpty basePath="/barbeiro" />} />
                      <Route path="disparo" element={<AdminDisparo barbeiroId={barberContext.barbeiroId} tenantId={barberContext.tenantId || undefined} basePath="/barbeiro" canSelectAllClients={false} />} />
                      <Route path="meus-dados/*" element={<BarberDadosPessoais barberContext={barberContext} />} />
                      <Route path="seguranca/*" element={<BarberSeguranca />} />
                      <Route path="perfil" element={<div className="max-w-2xl mx-auto"><BarberMobileProfile barberContext={barberContext} isTenantAdmin={barberContext.isTenantAdmin} /></div>} />
                      <Route path="carteira" element={<div className="max-w-2xl mx-auto"><CarteiraPage barbeiroId={barberContext.barbeiroId} barbeiroNome={barberContext.apelido} basePath="/barbeiro" /></div>} />
                      <Route path="whatsapp" element={<WhatsAppConnectionPage barbeiroId={barberContext.barbeiroId} basePath="/barbeiro" tenantNome={tenantNome} barberName={barberContext.apelido} tenantId={barberContext.tenantId} />} />
                      <Route path="instagram-callback" element={<InstagramCallbackHandler barbeiroId={barberContext.barbeiroId} basePath="/barbeiro" />} />
                      <Route path="portfolio" element={<PortfolioManager barbeiroId={barberContext.barbeiroId} tenantId={barberContext.tenantId} title="Meu Portfólio" showBack onBack={() => navigate("/barbeiro/perfil")} />} />
                      {barberContext.isTenantAdmin && (
                        <Route path="config-barbearia" element={<BarberConfigBarbearia barberContext={barberContext} />} />
                      )}
                    </>
                  )}
                </Routes>
              </Suspense>
            </div>
          </div>
        </main>
      </div>
      <SupportChatBubble />
    </div>
  );
};

export default Barbeiro;