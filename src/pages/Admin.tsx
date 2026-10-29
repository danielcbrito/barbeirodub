import { Loader2, AlertTriangle } from "lucide-react";
import { useEffect, Suspense, useState, useRef, lazy } from "react";
import { useNavigate, Routes, Route, useLocation, Navigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminMobileHeader } from "@/components/admin/mobile/AdminMobileHeader";
import { AdminMobileNavigation } from "@/components/admin/mobile/AdminMobileNavigation";
import { AdminMobileDrawer } from "@/components/admin/mobile/AdminMobileDrawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMaintenanceMode } from "@/hooks/useMaintenanceMode";
import { MaintenanceScreen } from "@/components/MaintenanceScreen";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { useNotificationPermission } from "@/hooks/useNotificationPermission";
import { useTenantSubscription } from "@/hooks/useTenantSubscription";
import { TenantPaywall } from "@/components/tenant/TenantPaywall";

/* ── Abas primárias (bottom nav): eager para navegação instantânea ── */
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { AdminMobileProfile } from "@/components/admin/mobile/AdminMobileProfile";
import { AdminAgenda } from "@/components/admin/AdminAgenda";
import { AdminDisparo } from "@/components/admin/AdminDisparo";
import { AdminCampanhas } from "@/components/admin/AdminCampanhas";

/* ── Rotas secundárias: sob demanda (reduz bundle inicial) ── */
const ProfileSettingsPage = lazy(() => import("@/components/profile/ProfileSettingsPage").then(m => ({ default: m.ProfileSettingsPage })));
const AdminClientes = lazy(() => import("@/components/admin/AdminClientes").then(m => ({ default: m.AdminClientes })));
const AdminFinanceiro = lazy(() => import("@/components/admin/AdminFinanceiro").then(m => ({ default: m.AdminFinanceiro })));
const EstatisticasRelatorios = lazy(() => import("@/components/shared/EstatisticasRelatorios").then(m => ({ default: m.EstatisticasRelatorios })));

const AdminServicos = lazy(() => import("@/components/admin/AdminServicos").then(m => ({ default: m.AdminServicos })));
const AdminAPIs = lazy(() => import("@/components/admin/AdminAPIs").then(m => ({ default: m.AdminAPIs })));
const AdminSeguranca = lazy(() => import("@/components/admin/AdminSeguranca").then(m => ({ default: m.AdminSeguranca })));
const AdminConfiguracoes = lazy(() => import("@/components/admin/AdminConfiguracoes").then(m => ({ default: m.AdminConfiguracoes })));
const AdminConfirmacoesPendentes = lazy(() => import("@/components/admin/AdminConfirmacoesPendentes").then(m => ({ default: m.AdminConfirmacoesPendentes })));
const AdminDev = lazy(() => import("@/components/admin/AdminDev").then(m => ({ default: m.AdminDev })));
const AdminSuportePanel = lazy(() => import("@/components/admin/AdminSuportePanel").then(m => ({ default: m.AdminSuportePanel })));
const AdminSuporteConfig = lazy(() => import("@/components/admin/AdminSuporteConfig").then(m => ({ default: m.AdminSuporteConfig })));
const AdminHorarios = lazy(() => import("@/components/admin/AdminHorarios"));
const AdminMobileHorarios = lazy(() => import("@/components/admin/mobile/AdminMobileHorarios").then(m => ({ default: m.AdminMobileHorarios })));
const AdminBarbeiros = lazy(() => import("@/components/admin/AdminBarbeiros").then(m => ({ default: m.AdminBarbeiros })));
const AdminAvaliacoes = lazy(() => import("@/components/admin/AdminAvaliacoes").then(m => ({ default: m.AdminAvaliacoes })));
const AdminDadosEmpresa = lazy(() => import("@/components/admin/AdminDadosEmpresa").then(m => ({ default: m.AdminDadosEmpresa })));
const WhatsAppConnectionPage = lazy(() => import("@/components/whatsapp/WhatsAppConnectionPage").then(m => ({ default: m.WhatsAppConnectionPage })));
const InstagramConnectionPage = lazy(() => import("@/components/instagram/InstagramConnectionPage").then(m => ({ default: m.InstagramConnectionPage })));
const PortfolioManager = lazy(() => import("@/components/shared/PortfolioManager").then(m => ({ default: m.PortfolioManager })));
const AdminUnidades = lazy(() => import("@/components/admin/unidades/AdminUnidades").then(m => ({ default: m.AdminUnidades })));
const AdminLojaGlobal = lazy(() => import("@/components/admin/loja/AdminLojaGlobal").then(m => ({ default: m.AdminLojaGlobal })));
const AdminEfiCredenciais = lazy(() => import("@/components/admin/AdminEfiCredenciais").then(m => ({ default: m.AdminEfiCredenciais })));
const BarberClientes = lazy(() => import("@/components/barber/BarberClientes").then(m => ({ default: m.BarberClientes })));
const AdminMeusPlanos = lazy(() => import("@/components/admin/AdminMeusPlanos").then(m => ({ default: m.AdminMeusPlanos })));
const AdminIndicacoes = lazy(() => import("@/components/admin/AdminIndicacoes"));
const CarteiraPage = lazy(() => import("@/components/barber/CarteiraPage").then(m => ({ default: m.CarteiraPage })));
const AppointmentDetailsPage = lazy(() => import("@/pages/AppointmentDetailsPage"));
const BarberConfigBarbearia = lazy(() => import("@/components/barber/BarberConfigBarbearia").then(m => ({ default: m.BarberConfigBarbearia })));

import { cn } from "@/lib/utils";
import { SupportChatBubble } from "@/components/support/SupportChatBubble";
import { hasStoredSupabaseSession, getStoredSupabaseUserId } from "@/lib/sessionGuard";

// Mapeamento de rotas para títulos
const routeTitles: Record<string, string> = {
  "/admin": "Visão Geral",
  "/admin/agenda": "Agenda",
  "/admin/confirmacoes-pendentes": "Confirmações",
  "/admin/barbeiros": "Barbeiros",
  "/admin/clientes": "Clientes",
  "/admin/avaliacoes": "Avaliações",
  "/admin/financeiro": "Financeiro",
  "/admin/relatorios": "Relatórios",
  "/admin/servicos/cortes": "Cortes",
  "/admin/servicos/planos": "Planos",
  "/admin/promocoes": "Promoções",
  "/admin/suporte": "Suporte",
  "/admin/suporte-config": "Configurações",
  "/admin/configuracoes": "Configurações",
  "/admin/apis": "APIs",
  "/admin/seguranca": "Segurança",
  "/admin/horarios": "Horários",
  "/admin/dev": "Dev Tools",
  "/admin/disparo": "Disparo de Mensagens",
  "/admin/dados-empresa": "Configurações da Empresa",
  "/admin/loja": "Loja",
  "/admin/efi-credenciais": "Credenciais Efí Bank",
};

/**
 * Contexto do Admin - inclui barbeiro_id se o admin também for barbeiro
 * Isso permite filtrar agendamentos por barbeiro quando necessário
 */
export interface AdminContext {
  barbeiroId: string | null;  // null = admin puro (vê tudo), string = admin que é barbeiro
  apelido: string | null;
  userId: string;
  isAdmin: boolean;
  tenantId?: string | null;
  tenantBarberIds?: string[];
}


const Admin = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const prevPendingCount = useRef(0);
  const [authChecked, setAuthChecked] = useState(false);
  const { playNotificationSound } = useNotificationSound();
  const { requestPermission, sendBrowserNotification } = useNotificationPermission();
  const [adminContext, setAdminContext] = useState<AdminContext | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const subscription = useTenantSubscription(adminContext?.tenantId || null);
  
  // Verificação de manutenção
  const { 
    isMaintenanceMode, 
    maintenanceMessage, 
    isLoading: maintenanceLoading, 
    isAllowedUser 
  } = useMaintenanceMode();

  // Carregar contagem de pendentes (filtrado por barbeiro se aplicável)
  useEffect(() => {
    if (!adminContext) return;

    const loadPendingCount = async () => {
      let query = supabase
        .from('assinaturas')
        .select('*', { count: 'exact', head: true })
        .eq('payment_method', 'cash')
        .or('status.in.(suspended,pending_cash),and(status.eq.active,cash_payment_confirmed.eq.false)');
      
      if (adminContext.barbeiroId) {
        query = query.eq('barbeiro_id', adminContext.barbeiroId);
      }
      
      const { count } = await query;
      setPendingCount(count || 0);
    };

    loadPendingCount();

    // Configurar subscription com filtro apropriado
    const channelId = adminContext.barbeiroId || adminContext.tenantId || 'global';
    const uniqueChannelName = `admin-pending-count-${channelId}-${Math.random().toString(36).slice(2, 9)}`;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = adminContext.barbeiroId
        ? supabase
            .channel(uniqueChannelName)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos', filter: `barbeiro_id=eq.${adminContext.barbeiroId}` } as const, (payload) => {
              loadPendingCount();
              if (payload.eventType === 'INSERT') {
                playNotificationSound();
                sendBrowserNotification("Novo Agendamento!", {
                  body: "Um novo cliente agendou. Verifique as confirmações pendentes.",
                  tag: "new-appointment",
                });
              }
            })
        : supabase
            .channel(uniqueChannelName)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos' } as const, (payload) => {
              loadPendingCount();
              if (payload.eventType === 'INSERT') {
                playNotificationSound();
                sendBrowserNotification("Novo Agendamento!", {
                  body: "Um novo cliente agendou. Verifique as confirmações pendentes.",
                  tag: "new-appointment",
                });
              }
            });

      channel.subscribe();
    } catch (err) {
      console.warn('[Admin] Erro ao conectar canal Realtime:', err);
    }

    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {}
      }
    };
  }, [adminContext, playNotificationSound, sendBrowserNotification]);

  // Solicitar permissão de notificação ao montar
  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

  const authCheckRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;
        if (event === 'SIGNED_OUT' && !session) {
          navigate("/login");
        }
        if (event === 'TOKEN_REFRESHED' && session) {
          return;
        }
      }
    );

    if (!authCheckRef.current) {
      authCheckRef.current = true;
      checkAuth();
    }

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const ADMIN_CTX_KEY = "dub:admin-ctx:v1";

  const cacheAdminContext = (ctx: AdminContext) => {
    try {
      localStorage.setItem(ADMIN_CTX_KEY, JSON.stringify(ctx));
    } catch { /* ignore */ }
  };

  /**
   * Boot instantâneo: hidrata o contexto do admin a partir do cache local
   * (0ms) e revalida em background — mesma estratégia do app do barbeiro.
   */
  useEffect(() => {
    try {
      if (!hasStoredSupabaseSession()) return;
      const currentUserId = getStoredSupabaseUserId();
      if (!currentUserId) return;

      const raw = localStorage.getItem(ADMIN_CTX_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as AdminContext;
      if (parsed?.userId) {
        if (parsed.userId !== currentUserId) {
          localStorage.removeItem(ADMIN_CTX_KEY);
          return;
        }
        setAdminContext(parsed);
        setAuthChecked(true);
      }
    } catch { /* ignore */ }
  }, []);

  const checkAuth = async () => {
    setAuthError(null);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      if (!session) {
        try { localStorage.removeItem(ADMIN_CTX_KEY); } catch { /* ignore */ }
        navigate("/login");
        return;
      }

      // Uma única ida ao banco em paralelo: roles + perfil de barbeiro
      const [{ data: roles, error: rolesError }, { data: ownBarber, error: barberError }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", session.user.id),
        supabase
          .from("barbeiros")
          .select("id, apelido, tenant_id")
          .eq("user_id", session.user.id)
          .eq("ativo", true)
          .is("deleted_at", null)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);

      if (rolesError) throw rolesError;
      if (barberError) throw barberError;

      const roleList = (roles || []).map((r) => r.role as string);
      const isAdminRole = roleList.includes("admin");
      const isTenantAdminRole = roleList.includes("tenant_admin");
      const isBarberRole = roleList.includes("barber");

      if (isAdminRole || isTenantAdminRole) {
        let tenantId: string | null = ownBarber?.tenant_id || null;
        if (!tenantId) {
          const { data: tm } = await supabase
            .from("tenant_members")
            .select("tenant_id")
            .eq("user_id", session.user.id)
            .limit(1)
            .maybeSingle();
          tenantId = tm?.tenant_id || null;
        }
        if (!tenantId) {
          const { data: ownedTenant } = await supabase
            .from("tenants")
            .select("id")
            .eq("owner_user_id", session.user.id)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          tenantId = ownedTenant?.id || null;
        }
        const ctx: AdminContext = {
          barbeiroId: ownBarber?.id || null,
          apelido: ownBarber?.apelido || null,
          userId: session.user.id,
          isAdmin: true,
          tenantId,
        };

        setAdminContext(ctx);
        cacheAdminContext(ctx);

        localStorage.setItem("userRole", "admin");
        if (ownBarber?.id) {
          localStorage.setItem("barbeiroId", ownBarber.id);
        } else {
          localStorage.removeItem("barbeiroId");
        }
        setAuthChecked(true);
        return;
      }

      try { localStorage.removeItem(ADMIN_CTX_KEY); } catch { /* ignore */ }

      if (isBarberRole) {
        navigate("/barbeiro");
        return;
      }

      // Não é admin, barbeiro ou tenant_admin
      toast.error("Você não tem permissão para acessar este sistema.");
      navigate("/");
    } catch (err: any) {
      console.error("[Admin checkAuth error]", err);
      if (!adminContext) {
        setAuthError(err?.message || "Não foi possível carregar as informações da sua conta.");
      }
    }
  };


  // Se está em manutenção e o usuário NÃO está na lista de permitidos
  if (!maintenanceLoading && authChecked && isMaintenanceMode && !isAllowedUser) {
    return (
      <MaintenanceScreen 
        message={maintenanceMessage || undefined}
        onExit={() => navigate("/")}
      />
    );
  }

  // Obter título da rota atual
  const getCurrentTitle = () => {
    // Verificar correspondência exata primeiro
    if (routeTitles[location.pathname]) {
      return routeTitles[location.pathname];
    }
    // Verificar se começa com alguma rota conhecida
    for (const [path, title] of Object.entries(routeTitles)) {
      if (location.pathname.startsWith(path) && path !== "/admin") {
        return title;
      }
    }
    return "Visão Geral";
  };

  const handleOpenDrawer = () => setIsDrawerOpen(true);
  const handleCloseDrawer = () => setIsDrawerOpen(false);
  const isPromocoesRoute = location.pathname.includes("/admin/promocoes");
  const isProfileRoute = location.pathname.includes("/admin/perfil");
  const isCarteiraRoute = location.pathname.includes("/admin/carteira");
  const isFinanceiroRoute = location.pathname.includes("/admin/financeiro");
  const isAppointmentRoute = location.pathname.includes("/admin/agendamento");
  const isUnidadesRoute = location.pathname.includes("/admin/unidades");
  const isAgendaRoute = location.pathname.includes("/admin/agenda");
  const isDisparoRoute = location.pathname.includes("/disparo");
  const isConfigBarbeariaRoute = location.pathname.includes("/config-barbearia");
  const isWhatsAppRoute = location.pathname.includes("/whatsapp");
  const isInstagramRoute = location.pathname.includes("/instagram");
  const isHorariosRoute = location.pathname.includes("/horarios");
  const isMeusClientesRoute = location.pathname.includes("/meus-clientes");
  const isImmersiveRoute = isPromocoesRoute || isProfileRoute || isCarteiraRoute || isFinanceiroRoute || isAppointmentRoute || isAgendaRoute || isDisparoRoute || isConfigBarbeariaRoute || isWhatsAppRoute || isInstagramRoute || isHorariosRoute || isMeusClientesRoute;

  // Layout Loading
  const LoadingFallback = () => (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
        <p className="text-muted-foreground text-sm">Carregando...</p>
      </div>
    </div>
  );

  if (authError && !adminContext) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="w-full max-w-sm space-y-4 text-center">
          <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <p className="text-sm text-muted-foreground">{authError}</p>
          <button
            type="button"
            onClick={() => {
              authCheckRef.current = false;
              checkAuth();
            }}
            className="h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-all cursor-pointer"
          >
            Tentar novamente
          </button>
          <button
            type="button"
            onClick={() => navigate("/", { replace: true })}
            className="h-11 w-full rounded-xl border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted transition-all cursor-pointer"
          >
            Voltar para o início
          </button>
        </div>
      </div>
    );
  }

  // Só bloqueia a tela quando ainda não há contexto (cache local já hidrata em ~0ms)
  if (!adminContext) {
    return (
      <div className="flex items-center justify-center min-h-app bg-background">
        <LoadingFallback />
      </div>
    );
  }

  // ═══════ PAYWALL: Trial expirou ou atraso > 4 dias ═══════
  if (!subscription.loading && subscription.isBlocked && !subscription.isExempt) {
    return (
      <TenantPaywall
        tenantNome={adminContext.apelido || "Barbearia"}
        isOverdue={subscription.isOverdue}
        onLogout={async () => {
          await supabase.auth.signOut();
          navigate("/login");
        }}
      />
    );
  }

  // ========== LAYOUT MOBILE ==========
  if (isMobile) {
    return (
      <div className="relative min-h-app w-full bg-background">
        {/* Background limpo */}

        {/* Drawer Menu */}
        <AdminMobileDrawer 
          isOpen={isDrawerOpen}
          onClose={handleCloseDrawer}
          pendingCount={pendingCount}
        />

        {/* Conteúdo Principal - padding otimizado para mobile */}
        <main
          className={cn(
            isImmersiveRoute && !isCarteiraRoute && !isFinanceiroRoute ? "relative min-h-screen bg-background" : "relative min-h-[calc(100vh-56px)] bg-background",
            isImmersiveRoute && !isCarteiraRoute && !isFinanceiroRoute && "pb-0"
          )}
          style={
            (isImmersiveRoute && !isCarteiraRoute && !isFinanceiroRoute) || location.pathname.includes("/perfil")
              ? undefined
              : { paddingBottom: "calc(7.5rem + var(--app-safe-bottom, 8px) + env(safe-area-inset-bottom, 0px))" }
          }
        >
          <div
            className={cn(
              "px-4 py-4 lg:px-8",
              (location.pathname === "/admin" || location.pathname === "/admin/") && "p-0",
              isImmersiveRoute && "p-0",
              isUnidadesRoute && "p-0",
              location.pathname.includes("/perfil") && "p-0",
              location.pathname.includes("/whatsapp") && "p-0",
              location.pathname.includes("/instagram") && "p-0",
              location.pathname.includes("/promocoes") && "p-0",
              location.pathname.includes("/relatorios") && "p-0",
              location.pathname.includes("/financeiro") && "p-0",
              location.pathname.includes("/carteira") && "p-0"
            )}
            style={
              (location.pathname === "/admin" || location.pathname === "/admin/") || isImmersiveRoute || isUnidadesRoute || location.pathname.includes("/perfil") || location.pathname.includes("/whatsapp") || location.pathname.includes("/instagram") || location.pathname.includes("/promocoes") || location.pathname.includes("/relatorios") || location.pathname.includes("/financeiro") || location.pathname.includes("/carteira")
                ? undefined
                : { paddingTop: "calc(0.75rem + var(--app-safe-top, env(safe-area-inset-top, 0px)))" }
            }
          >

            <Suspense fallback={<LoadingFallback />}>
                <Routes>
                  <Route index element={<AdminDashboard adminContext={adminContext} />} />
                  <Route path="agenda" element={<AdminAgenda adminContext={adminContext} />} />
                  <Route path="agendamento/:appointmentId" element={<AppointmentDetailsPage basePath="/admin" />} />
                  <Route path="confirmacoes-pendentes" element={<AdminConfirmacoesPendentes adminContext={adminContext} />} />
                <Route path="barbeiros" element={<AdminBarbeiros />} />
                <Route
                  path="clientes"
                  element={<Navigate to="/admin/config-barbearia?screen=clientes" replace />}
                />
                <Route
                  path="meus-clientes"
                  element={<Navigate to="/admin/config-barbearia?screen=clientes-meus" replace />}
                />
                <Route
                  path="meu-plano"
                  element={<Navigate to="/admin/config-barbearia?screen=meu-plano" replace />}
                />
                <Route
                  path="assinatura"
                  element={<Navigate to="/admin/config-barbearia?screen=meu-plano" replace />}
                />
                <Route path="config-barbearia" element={
                  adminContext ? (
                    <BarberConfigBarbearia
                      barberContext={{
                        barbeiroId: adminContext.barbeiroId || "",
                        apelido: adminContext.apelido || "Admin",
                        userId: adminContext.userId,
                        deletedAt: null,
                        graceDaysLeft: 0,
                        tenantId: adminContext.tenantId || null,
                        isTenantAdmin: true,
                        canManageTenantWideClientBlock: true,
                      }}
                      basePath="/admin/config-barbearia"
                      appBasePath="/admin"
                    />
                  ) : (
                    <div className="flex items-center justify-center min-h-[60vh]">
                      <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
                    </div>
                  )
                } />
                <Route path="avaliacoes" element={<AdminAvaliacoes />} />
                <Route path="financeiro" element={<AdminFinanceiro barbeiroId={adminContext?.barbeiroId || (adminContext?.tenantBarberIds && adminContext.tenantBarberIds.length > 0 ? adminContext.tenantBarberIds[0] : null)} userName={adminContext?.apelido || "Admin"} basePath="/admin" />} />
                <Route path="relatorios" element={<EstatisticasRelatorios isGlobal barbeiroId={adminContext?.barbeiroId ?? null} tenantId={adminContext?.tenantId} basePath="/admin/perfil" />} />
                <Route path="servicos/*" element={<AdminServicos />} />
                <Route path="promocoes/preparando" element={<Navigate to="/admin/promocoes" replace />} />
                <Route path="promocoes" element={<AdminCampanhas basePath="/admin" />} />
                <Route path="suporte" element={<AdminSuportePanel />} />
                <Route path="suporte-config" element={<AdminSuporteConfig />} />
                <Route path="configuracoes" element={<AdminConfiguracoes />} />
                <Route path="apis" element={<AdminAPIs />} />
                <Route path="seguranca/*" element={<AdminSeguranca />} />
                <Route path="horarios" element={<Navigate to="/admin/config-barbearia?screen=horarios" replace />} />
                <Route path="dev" element={<AdminDev />} />
                <Route path="disparo" element={<AdminDisparo />} />
                <Route path="perfil" element={<AdminMobileProfile />} />
                <Route path="carteira" element={
                  (adminContext.barbeiroId || (adminContext.tenantBarberIds && adminContext.tenantBarberIds.length > 0)) ? (
                    <CarteiraPage
                      barbeiroId={adminContext.barbeiroId || adminContext.tenantBarberIds![0]}
                      barbeiroNome={adminContext.apelido || "Admin"}
                      basePath="/admin"
                    />
                  ) : (
                    <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                      Sua conta de administrador não está vinculada a um barbeiro, então não há carteira disponível.
                    </div>
                  )
                } />
                <Route path="meus-planos" element={<AdminMeusPlanos basePath="/admin" />} />
                <Route path="configuracoes-perfil" element={<Navigate to="/admin/config-barbearia" replace />} />
                <Route path="dados-empresa/*" element={<AdminDadosEmpresa basePath="/admin" tenantId={adminContext?.tenantId} />} />
                <Route path="whatsapp" element={<WhatsAppConnectionPage barbeiroId={adminContext?.barbeiroId} userId={adminContext?.userId} basePath="/admin" tenantId={adminContext?.tenantId} />} />
                <Route path="instagram" element={<InstagramConnectionPage barbeiroId={adminContext?.barbeiroId} basePath="/admin" tenantNome={adminContext?.apelido} />} />
                <Route path="portfolio" element={adminContext?.barbeiroId ? <PortfolioManager barbeiroId={adminContext.barbeiroId} title="Portfólio da Barbearia" showBack onBack={() => navigate("/admin")} /> : null} />
                <Route path="unidades" element={<AdminUnidades basePath="/admin" />} />
                <Route path="loja/*" element={<AdminLojaGlobal />} />
                <Route path="efi-credenciais" element={<AdminEfiCredenciais />} />
                <Route path="indicacoes" element={<AdminIndicacoes />} />
                <Route path="minhas-indicacoes" element={<AdminIndicacoes />} />
                <Route path="*" element={<Navigate to="/admin" replace />} />
              </Routes>
            </Suspense>
          </div>
        </main>

        {/* Bottom Navigation Mobile — esconder nas configurações, edição de serviços, horários e disparo */}
        {!location.pathname.includes("configuracoes-perfil") && !location.pathname.includes("config-barbearia") && !location.pathname.includes("servicos/cortes") && !location.pathname.includes("servicos/planos") && !location.pathname.includes("horarios") && !location.pathname.includes("dados-empresa") && !location.pathname.includes("seguranca") && !location.pathname.includes("clientes") && !location.pathname.includes("meus-clientes") && !location.pathname.includes("barbeiros") && !location.pathname.includes("avaliacoes") && !location.pathname.includes("promocoes") && !location.pathname.includes("relatorios") && !location.pathname.includes("whatsapp") && !location.pathname.includes("instagram") && !location.pathname.includes("portfolio") && !location.pathname.includes("unidades") && !location.pathname.includes("agendamento") && !location.pathname.includes("disparo") && (
          <div className="lg:hidden">
            <AdminMobileNavigation barbeiroId={adminContext?.barbeiroId} />
          </div>
        )}
        <SupportChatBubble />
      </div>
    );
  }

  // ========== LAYOUT DESKTOP ==========
  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-background">
        {/* Background limpo */}
        
        {/* Sidebar fixa à esquerda */}
        <AdminSidebar />
        
        {/* Conteúdo principal */}
        <main className="relative z-10 flex-1 flex flex-col h-screen overflow-hidden transition-all duration-300">
          <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none">
            <div className={cn(
              "max-w-[1600px] mx-auto",
              (location.pathname.includes("/config-barbearia") || location.pathname.includes("/whatsapp") || location.pathname.includes("/instagram") || location.pathname.includes("/perfil") || location.pathname.includes("/relatorios") || location.pathname.includes("/carteira") || location.pathname.includes("/financeiro"))
                ? "p-0"
                : "p-6 lg:p-8"
            )}>
              <Suspense fallback={<LoadingFallback />}>
                <Routes>
                  <Route index element={<AdminDashboard adminContext={adminContext} />} />
                  <Route path="agenda" element={<AdminAgenda adminContext={adminContext} />} />
                  <Route path="agendamento/:appointmentId" element={<AppointmentDetailsPage basePath="/admin" />} />
                  <Route path="confirmacoes-pendentes" element={<AdminConfirmacoesPendentes adminContext={adminContext} />} />
                  <Route path="barbeiros" element={<AdminBarbeiros />} />
                  <Route
                    path="clientes"
                    element={
                      adminContext ? (
                        <BarberClientes
                          barberContext={{
                            barbeiroId: adminContext.barbeiroId || "",
                            apelido: adminContext.apelido || "Admin",
                            userId: adminContext.userId,
                            tenantId: adminContext.tenantId || null,
                            isTenantAdmin: true,
                            deletedAt: null,
                            graceDaysLeft: 0,
                            canManageTenantWideClientBlock: true,
                          }}
                          basePath="/admin"
                        />
                      ) : null
                    }
                  />
                  <Route
                    path="meus-clientes"
                    element={
                      adminContext.barbeiroId ? (
                        <BarberClientes
                          barberContext={{
                            barbeiroId: adminContext.barbeiroId,
                            apelido: adminContext.apelido || "",
                            userId: adminContext.userId,
                            tenantId: adminContext.tenantId || null,
                            isTenantAdmin: true,
                            deletedAt: null,
                            graceDaysLeft: 0,
                            canManageTenantWideClientBlock: true,
                          }}
                          basePath="/admin"
                          forceViewMode="meus"
                        />
                      ) : null
                    }
                  />
                  <Route path="avaliacoes" element={<AdminAvaliacoes />} />
                  <Route path="financeiro" element={<AdminFinanceiro barbeiroId={adminContext?.barbeiroId} userName={adminContext?.apelido || "Admin"} />} />
                  <Route path="relatorios" element={<EstatisticasRelatorios isGlobal barbeiroId={adminContext.barbeiroId} tenantId={adminContext.tenantId} basePath="/admin/perfil" />} />
                  <Route path="servicos/*" element={<AdminServicos />} />
                  <Route path="promocoes/preparando" element={<Navigate to="/admin/promocoes" replace />} />
                  <Route path="promocoes" element={<AdminCampanhas basePath="/admin" />} />
                  <Route path="suporte" element={<AdminSuportePanel />} />
                  <Route path="suporte-config" element={<AdminSuporteConfig />} />
                  <Route path="configuracoes" element={<AdminConfiguracoes />} />
                  <Route path="apis" element={<AdminAPIs />} />
                  <Route path="seguranca/*" element={<AdminSeguranca />} />
                  <Route path="horarios" element={<AdminDesktopHorariosRoute barbeiroId={adminContext?.barbeiroId || undefined} tenantId={adminContext?.tenantId || undefined} />} />
                  <Route path="dev" element={<AdminDev />} />
                  <Route path="disparo" element={<AdminDisparo />} />
                  <Route path="dados-empresa/*" element={<AdminDadosEmpresa basePath="/admin" tenantId={adminContext?.tenantId} />} />
                  <Route path="whatsapp" element={<WhatsAppConnectionPage barbeiroId={adminContext?.barbeiroId} userId={adminContext?.userId} basePath="/admin" tenantId={adminContext?.tenantId} />} />
                  <Route path="instagram" element={<InstagramConnectionPage barbeiroId={adminContext?.barbeiroId} basePath="/admin" tenantNome={adminContext?.apelido} />} />
                  <Route path="portfolio" element={adminContext?.barbeiroId ? <PortfolioManager barbeiroId={adminContext.barbeiroId} title="Portfólio da Barbearia" showBack onBack={() => navigate("/admin")} /> : null} />
                  <Route path="unidades" element={<AdminUnidades basePath="/admin" />} />
                  <Route path="meus-planos" element={<AdminMeusPlanos basePath="/admin" />} />
                  <Route path="loja/*" element={<AdminLojaGlobal />} />
                  <Route path="efi-credenciais" element={<AdminEfiCredenciais />} />
                  <Route path="indicacoes" element={<AdminIndicacoes />} />
                  <Route path="minhas-indicacoes" element={<AdminIndicacoes />} />
                  <Route path="perfil" element={<div className="max-w-2xl mx-auto"><AdminMobileProfile /></div>} />
                  <Route path="carteira" element={adminContext.barbeiroId ? (
                    <div className="max-w-2xl mx-auto">
                      <CarteiraPage barbeiroId={adminContext.barbeiroId} barbeiroNome={adminContext.apelido || "Admin"} basePath="/admin" />
                    </div>
                  ) : (
                    <div className="max-w-2xl mx-auto px-5 py-10 text-center text-sm text-muted-foreground">
                      Sua conta de administrador não está vinculada a um barbeiro, então não há carteira disponível.
                    </div>
                  )} />
                  <Route path="config-barbearia" element={
                    adminContext ? (
                      <BarberConfigBarbearia
                        barberContext={{
                          barbeiroId: adminContext.barbeiroId || "",
                          apelido: adminContext.apelido || "Admin",
                          userId: adminContext.userId,
                          deletedAt: null,
                          graceDaysLeft: 0,
                          tenantId: adminContext.tenantId || null,
                          isTenantAdmin: true,
                          canManageTenantWideClientBlock: true,
                        }}
                        basePath="/admin/config-barbearia"
                        appBasePath="/admin"
                      />
                    ) : (
                      <div className="flex items-center justify-center min-h-[60vh]">
                        <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
                      </div>
                    )
                  } />
                  <Route path="*" element={<Navigate to="/admin" replace />} />
                </Routes>
              </Suspense>
            </div>
          </div>
      </main>
      <SupportChatBubble />
    </div>
  );
};

function AdminMobileHorariosRoute({ barbeiroId, tenantId }: { barbeiroId?: string; tenantId?: string }) {
  const [searchParams] = useSearchParams();
  const isCompanyMode = searchParams.get("empresa") === "1" || searchParams.get("scope") === "company";

  return (
    <AdminMobileHorarios
      key={isCompanyMode ? 'company-mobile' : 'personal-mobile'}
      basePath="/admin"
      barbeiroId={isCompanyMode ? undefined : barbeiroId}
      companyMode={isCompanyMode}
      tenantId={tenantId}
    />
  );
}

function AdminDesktopHorariosRoute({ barbeiroId, tenantId }: { barbeiroId?: string; tenantId?: string }) {
  const [searchParams] = useSearchParams();
  const isCompanyMode = searchParams.get("empresa") === "1" || searchParams.get("scope") === "company" || !barbeiroId;

  return (
    <AdminHorarios
      key={isCompanyMode ? 'company-desktop' : 'personal-desktop'}
      barbeiroId={isCompanyMode ? undefined : barbeiroId}
      companyMode={isCompanyMode}
      tenantId={tenantId}
    />
  );
}

export default Admin;
