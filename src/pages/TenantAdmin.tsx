import { useEffect, Suspense, useState, useRef, useCallback } from "react";
import { useNavigate, Routes, Route, useLocation, useSearchParams, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { resolveOldestOwnedTenant } from "@/lib/tenantOwnership";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminMobileDrawer } from "@/components/admin/mobile/AdminMobileDrawer";
import { AdminMobileNavigation } from "@/components/admin/mobile/AdminMobileNavigation";
import { AdminMobileProfile } from "@/components/admin/mobile/AdminMobileProfile";
import { AdminMeusPlanos } from "@/components/admin/AdminMeusPlanos";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { useNotificationPermission } from "@/hooks/useNotificationPermission";
import { useWalletActivationPrompt } from "@/hooks/useWalletActivationPrompt";
import { useWhatsAppStatus } from "@/hooks/useWhatsAppStatus";
import { useTenantSubscription } from "@/hooks/useTenantSubscription";
import { WalletActivationModal } from "@/components/barber/WalletActivationModal";
import { PendingSetupModal } from "@/components/tenant/PendingSetupModal";
import { TrialBanner } from "@/components/tenant/TrialBanner";
import { TenantPaywall } from "@/components/tenant/TenantPaywall";
import { TenantSubscriptionPage } from "@/components/tenant/TenantSubscriptionPage";
import { Loader2 } from "lucide-react";

// Componentes Admin reutilizados (idênticos ao /admin)
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { AdminAgenda } from "@/components/admin/AdminAgenda";
import { AdminClientes } from "@/components/admin/AdminClientes";
import { AdminFinanceiro } from "@/components/admin/AdminFinanceiro";

import { AdminCampanhas } from "@/components/admin/AdminCampanhas";
import { AdminServicos } from "@/components/admin/AdminServicos";
import { AdminConfirmacoesPendentes } from "@/components/admin/AdminConfirmacoesPendentes";
import AdminHorarios from "@/components/admin/AdminHorarios";
import { AdminMobileHorarios } from "@/components/admin/mobile/AdminMobileHorarios";
import { AdminDisparo } from "@/components/admin/AdminDisparo";
import { AdminAvaliacoes } from "@/components/admin/AdminAvaliacoes";
import { TenantBarbeiros } from "@/components/tenant/TenantBarbeiros";
import { AdminSeguranca } from "@/components/admin/AdminSeguranca";
import { EstatisticasRelatorios } from "@/components/shared/EstatisticasRelatorios";
import { AdminDadosEmpresa } from "@/components/admin/AdminDadosEmpresa";
import { WhatsAppConnectionPage } from "@/components/whatsapp/WhatsAppConnectionPage";
import { PortfolioManager } from "@/components/shared/PortfolioManager";
import { SupportChatBubble } from "@/components/support/SupportChatBubble";
import { AdminUnidades } from "@/components/admin/unidades/AdminUnidades";
import { AdminLoja } from "@/components/admin/loja/AdminLoja";
import AdminIndicacoes from "@/components/admin/AdminIndicacoes";
import { BarberConfigBarbearia } from "@/components/barber/BarberConfigBarbearia";

import { BarberClientes } from "@/components/barber/BarberClientes";
import { useAuthReady } from "@/hooks/useAuthReady";

import type { AdminContext } from "@/pages/Admin";

/* ─── Tenant Context ──────────── */
export interface TenantContext {
  tenantId: string;
  tenantNome: string;
  tenantLogoUrl: string;
  ownerUserId: string;
}

const BASE = "/tenant/admin";

interface ResolvedTenantOwnerBarber {
  id: string;
  apelido: string;
}

/**
 * Resolve o perfil profissional do dono da barbearia com fallback defensivo.
 * Primeiro reutiliza um barbeiro já existente; se não houver, tenta criar
 * via RPC e consulta novamente para evitar loops de loading quando há dados legados.
 */
async function resolveTenantOwnerBarber(
  userId: string,
  tenantId: string,
  tenantName: string
): Promise<ResolvedTenantOwnerBarber | null> {
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const normalizeName = (value: string | null | undefined) =>
    value?.trim().toLocaleLowerCase("pt-BR") || "";

  const mapResolvedBarber = (barber: { id: string; apelido: string | null }) => ({
    id: barber.id,
    apelido: barber.apelido || tenantName,
  });

  const findExistingBarber = async () => {
    const { data, error } = await supabase
      .from("barbeiros")
      .select("id, apelido")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .eq("ativo", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    return data ? mapResolvedBarber(data) : null;
  };

  const findLegacyTenantBarber = async () => {
    const { data, error } = await supabase
      .from("barbeiros")
      .select("id, apelido, user_id")
      .eq("tenant_id", tenantId)
      .eq("ativo", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(10);

    if (error) throw error;
    if (!data?.length) return null;

    const normalizedTenantName = normalizeName(tenantName);

    const preferredBarber =
      data.find((barber) => barber.user_id === userId) ??
      data.find((barber) => normalizeName(barber.apelido) !== normalizedTenantName) ??
      data[0];

    return preferredBarber ? mapResolvedBarber(preferredBarber) : null;
  };

  const existingBarber = await findExistingBarber();
  const legacyTenantBarber = await findLegacyTenantBarber();

  if (
    existingBarber &&
    legacyTenantBarber &&
    existingBarber.id !== legacyTenantBarber.id &&
    normalizeName(existingBarber.apelido) === normalizeName(tenantName)
  ) {
    return legacyTenantBarber;
  }

  if (existingBarber) return existingBarber;
  if (legacyTenantBarber) return legacyTenantBarber;

  const { data: createdBarberId, error: ensureError } = await supabase.rpc(
    "ensure_tenant_barber",
    {
      p_user_id: userId,
      p_apelido: tenantName,
    }
  );

  if (ensureError) {
    console.error("[TenantAdmin] Falha ao garantir barbeiro do tenant:", ensureError);
  }

  if (createdBarberId) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const { data: createdBarber, error: createdBarberError } = await supabase
        .from("barbeiros")
        .select("id, apelido")
        .eq("id", createdBarberId)
        .maybeSingle();

      if (createdBarberError) throw createdBarberError;

      if (createdBarber) {
        return mapResolvedBarber(createdBarber);
      }

      const retryExisting = await findExistingBarber();
      if (retryExisting) return retryExisting;

      await wait(350);
    }
  }

  return findExistingBarber();
}

/**
 * Painel do Tenant Admin — interface 100% idêntica ao painel Admin (/admin).
 * Reutiliza os mesmos componentes Admin*, com dados isolados por tenant_id.
 */
const TenantAdmin = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [authChecked, setAuthChecked] = useState(false);
  const [adminContext, setAdminContext] = useState<AdminContext | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isTestTenant, setIsTestTenant] = useState(false);
  const authCheckRef = useRef(false);
  const [tenantNome, setTenantNome] = useState<string>("");
  const [setupError, setSetupError] = useState<string | null>(null);
  const { playNotificationSound } = useNotificationSound();
  const { requestPermission, sendBrowserNotification } = useNotificationPermission();
  const walletPrompt = useWalletActivationPrompt(adminContext?.barbeiroId || null);
  const whatsAppStatus = useWhatsAppStatus(adminContext?.barbeiroId || null);
  const subscription = useTenantSubscription(tenantId);
  /** Acesso vitalício: ativo sem plano vinculado e sem trial */
  const isLifetimeAccess = subscription.isActive && !subscription.planName && !subscription.isTrial;
  const [pendingSetupOpen, setPendingSetupOpen] = useState(false);
  const { user: authUser, isReady: isAuthReady } = useAuthReady();

  // Abrir modal de pendências quando auth estiver checado e houver pendências
  useEffect(() => {
    if (!authChecked || !adminContext) return;
    if (whatsAppStatus.isLoading || walletPrompt.isLoading) return;
    if (whatsAppStatus.resolvedBarbeiroId !== adminContext.barbeiroId) return;
    if (walletPrompt.resolvedBarbeiroId !== adminContext.barbeiroId) return;

    const sessionKey = `pending_setup_shown_${adminContext.barbeiroId}`;
    if (sessionStorage.getItem(sessionKey)) return;

    const hasPending = !whatsAppStatus.isConnected || walletPrompt.walletActive === false;
    if (hasPending) {
      setPendingSetupOpen(true);
      sessionStorage.setItem(sessionKey, "1");
    }
  }, [authChecked, adminContext, whatsAppStatus.isLoading, whatsAppStatus.isConnected, whatsAppStatus.resolvedBarbeiroId, walletPrompt.isLoading, walletPrompt.walletActive, walletPrompt.resolvedBarbeiroId]);

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
          setAdminContext(null);
          navigate("/", { replace: true });
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  // Carregar contagem de pendentes (tenant-wide para dono da barbearia)
  useEffect(() => {
    if (!adminContext) return;

    let isCancelled = false;

    const loadPendingCount = async () => {
      try {
        let query = supabase
          .from("assinaturas")
          .select("*", { count: "exact", head: true })
          .eq("payment_method", "cash")
          .or("status.in.(suspended,pending_cash),and(status.eq.active,cash_payment_confirmed.eq.false)");

        if (!adminContext.isAdmin) {
          const { data: tenant } = await resolveOldestOwnedTenant<{ id: string }>(
            adminContext.userId,
            "id"
          );

          if (!tenant?.id) {
            if (!isCancelled) setPendingCount(0);
            return;
          }

          const { data: tenantBarbers } = await supabase
            .from("barbeiros")
            .select("id")
            .eq("tenant_id", tenant.id)
            .eq("ativo", true)
            .is("deleted_at", null);

          const barberIds = (tenantBarbers || []).map((b) => b.id);
          if (barberIds.length === 0) {
            if (!isCancelled) setPendingCount(0);
            return;
          }

          query = query.in("barbeiro_id", barberIds);
        } else if (adminContext.barbeiroId) {
          query = query.eq("barbeiro_id", adminContext.barbeiroId);
        }

        const { count } = await query;
        if (!isCancelled) setPendingCount(count || 0);
      } catch (error) {
        console.error("Erro ao carregar pendências de planos:", error);
      }
    };

    loadPendingCount();

    const ch1 = supabase
      .channel("tenant-pending-count-agendamentos")
      .on("postgres_changes", {
        event: "*", schema: "public", table: "agendamentos",
      }, (payload: any) => {
        loadPendingCount();
        if (payload.eventType === "INSERT") {
          playNotificationSound();
          sendBrowserNotification("Novo Agendamento!", {
            body: "Um novo cliente agendou com você. Verifique suas confirmações.",
            tag: "new-appointment",
          });
        }
      }).subscribe();

    const ch2 = supabase
      .channel("tenant-pending-count-planos")
      .on("postgres_changes", {
        event: "*", schema: "public", table: "assinaturas",
      }, (payload: any) => {
        loadPendingCount();
        // Notificação silenciosa apenas para INSERTs vindos do próprio cliente (autoatendimento via PIX/cash).
        // Ativações feitas pelo admin/barbeiro NÃO devem disparar som — esse evento já é gerado por ele mesmo.
        // Para evitar confusão, removido o som aqui; novos planos pendentes aparecem no badge de contagem.
      }).subscribe();

    return () => {
      isCancelled = true;
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
  }, [adminContext, playNotificationSound, sendBrowserNotification]);

  const checkAuth = useCallback(async (userId: string) => {
    try {
      setSetupError(null);
      const { data: tenant } = await supabase
        .from("tenants")
        .select("id, nome, logo_url, owner_user_id, onboarding_completed, is_test")
        .eq("owner_user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!tenant) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId);

        const isTenantAdmin = roles?.some((r) => r.role === "tenant_admin");

        if (isTenantAdmin) {
          navigate("/onboarding", { replace: true });
          return;
        }

        navigate("/", { replace: true });
        return;
      }

      if (!tenant.onboarding_completed) {
        navigate("/onboarding", { replace: true });
        return;
      }

      setTenantId(tenant.id);
      setTenantNome(tenant.nome || "");
      setIsTestTenant(!!tenant.is_test);

      const resolvedBarber = await resolveTenantOwnerBarber(
        userId,
        tenant.id,
        tenant.nome || "Proprietário"
      );

      if (!resolvedBarber?.id) {
        setSetupError("Não foi possível preparar seu perfil profissional. Toque em tentar novamente.");
        setAuthChecked(true);
        authCheckRef.current = false;
        return;
      }

      // Configurar adminContext no mesmo formato que o Admin usa
      setAdminContext({
        barbeiroId: resolvedBarber.id,
        apelido: resolvedBarber.apelido,
        userId,
        isAdmin: false, // é tenant_admin, não admin global
      });

      setAuthChecked(true);
    } catch (error) {
      console.error("Erro ao verificar autenticação:", error);
      // Não destrói a sessão em erros de rede — preserva tokens para reconexão
      setSetupError("Não foi possível validar sua sessão. Toque em tentar novamente.");
      setAuthChecked(true);
      authCheckRef.current = false;
    }
  }, [navigate]);

  useEffect(() => {
    if (!isAuthReady || authCheckRef.current) return;

    authCheckRef.current = true;

    if (!authUser) {
      navigate("/", { replace: true });
      return;
    }

    void checkAuth(authUser.id);
  }, [authUser, isAuthReady, navigate, checkAuth]);

  // Loading state
  const LoadingFallback = () => (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
        <p className="text-muted-foreground text-sm">Carregando...</p>
      </div>
    </div>
  );

  if (setupError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="w-full max-w-sm space-y-4 text-center">
          <p className="text-sm text-muted-foreground">{setupError}</p>
          <button
            type="button"
            onClick={() => {
              if (!authUser) return;
              setAuthChecked(false);
              setSetupError(null);
              authCheckRef.current = true;
              void checkAuth(authUser.id);
            }}
            className="h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            Tentar novamente
          </button>
          <button
            type="button"
            onClick={() => navigate("/", { replace: true })}
            className="h-11 w-full rounded-xl border border-border px-4 text-sm font-semibold text-foreground"
          >
            Voltar para o início
          </button>
        </div>
      </div>
    );
  }

  if (!authChecked || !adminContext) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-6 w-6 text-primary animate-spin" />
      </div>
    );
  }

  // ═══════ PAYWALL: Trial expirou e não assinou ═══════
  // Rotas sempre acessíveis: barbeiros, dados-empresa, perfil, assinatura
  const ALWAYS_ALLOWED = ["barbeiros", "dados-empresa", "perfil", "configuracoes-perfil", "config-barbearia", "assinatura", "loja"];
  const currentSubPath = location.pathname.replace(BASE + "/", "").replace(BASE, "");
  const isAllowedRoute = ALWAYS_ALLOWED.some((r) => currentSubPath.startsWith(r)) || currentSubPath === "";
  const isSubscriptionRoute = currentSubPath.startsWith("assinatura");

  if (!subscription.loading && subscription.isExpired && !isAllowedRoute && !isTestTenant) {
    return (
      <TenantPaywall
        tenantNome={tenantNome}
        onLogout={async () => {
          await supabase.auth.signOut();
          navigate("/login");
        }}
      />
    );
  }

  // Função para navegar para a tela de assinatura
  const goToSubscription = () => navigate(`${BASE}/assinatura`);

  const tenantAdminBarberContext = adminContext.barbeiroId ? {
    barbeiroId: adminContext.barbeiroId,
    apelido: adminContext.apelido || tenantNome || "Administrador",
    userId: adminContext.userId,
    deletedAt: null,
    graceDaysLeft: 0,
    tenantId,
    isTenantAdmin: true,
    canManageTenantWideClientBlock: true,
  } : null;

  // ========== LAYOUT MOBILE ==========
  if (isMobile) {
    return (
      <div className={`relative w-full bg-background ${isSubscriptionRoute ? "h-[var(--app-height,100dvh)] flex flex-col overflow-hidden" : "min-h-[var(--app-height,100dvh)]"}`}>
        {/* Modal de pendências de configuração */}
        <PendingSetupModal
          open={pendingSetupOpen}
          onClose={() => setPendingSetupOpen(false)}
          whatsappConnected={whatsAppStatus.isConnected}
          walletActive={walletPrompt.walletActive === true}
          basePath={BASE}
        />

        {/* Modal de ativação da carteira — só abre quando o PendingSetupModal está fechado,
            evitando que dois modais sobre o mesmo assunto apareçam empilhados. */}
        <WalletActivationModal
          open={walletPrompt.shouldShowModal && !pendingSetupOpen}
          onOpenChange={(open) => !open && walletPrompt.dismissModal()}
          barbeiroId={adminContext.barbeiroId!}
          barberName={walletPrompt.barberName}
          onSuccess={walletPrompt.onActivated}
        />

        {/* Drawer Menu — idêntico ao Admin */}
        <AdminMobileDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          pendingCount={pendingCount}
          basePath={BASE}
          tenantNome={tenantNome}
        />

        {/* Trial warning banner */}
        {subscription.showTrialWarning && (
          <TrialBanner daysRemaining={subscription.daysRemaining} onSubscribe={goToSubscription} />
        )}

        {/* Conteúdo Principal */}
        {isSubscriptionRoute ? (
          <div className="flex-1 min-h-0 px-3 pt-3">
            <Suspense fallback={<LoadingFallback />}>
              <Routes>
                <Route path="assinatura" element={<TenantSubscriptionPage subscription={subscription} basePath={BASE} tenantId={tenantId} />} />
              </Routes>
            </Suspense>
          </div>
        ) : (
          <main className={cn(
            "relative min-h-[calc(var(--app-height,100dvh)-56px)] bg-background",
            location.pathname.includes("/tenant/admin/promocoes") ? "pb-0 overflow-hidden" : "pb-20"
          )}>
            <div
              className={cn("px-4 py-4 lg:px-8", location.pathname.includes("/tenant/admin/promocoes") && "h-full p-0", location.pathname.includes("/perfil") && "p-0", location.pathname.includes("/config-barbearia") && "p-0", location.pathname.includes("/unidades") && "h-full p-0")}
              style={
                location.pathname.includes("/perfil") || location.pathname.includes("/config-barbearia") || location.pathname.includes("/unidades")
                  ? undefined
                  : { paddingTop: "calc(0.75rem + var(--app-safe-top, env(safe-area-inset-top, 0px)))" }
              }
            >

              <Suspense fallback={<LoadingFallback />}>
                <Routes>
                  <Route index element={<AdminDashboard adminContext={adminContext} basePath={BASE} tenantId={tenantId} />} />
                  <Route path="agenda" element={<AdminAgenda adminContext={adminContext} tenantId={tenantId} />} />
                  <Route path="confirmacoes-pendentes" element={<AdminConfirmacoesPendentes adminContext={adminContext} />} />
                  <Route path="barbeiros" element={tenantId ? <TenantBarbeiros tenantId={tenantId} basePath={BASE} subscriptionStatus={subscription.status} subscriptionPriceMonthly={subscription.priceMonthly} /> : null} />
                  <Route path="clientes" element={adminContext.barbeiroId ? <BarberClientes barberContext={{ barbeiroId: adminContext.barbeiroId, apelido: adminContext.apelido || "", userId: adminContext.userId, tenantId: tenantId || null, isTenantAdmin: true, deletedAt: null, graceDaysLeft: 0, canManageTenantWideClientBlock: true }} basePath={BASE} forceViewMode="todos" /> : null} />
                  <Route path="meus-clientes" element={adminContext.barbeiroId ? <BarberClientes barberContext={{ barbeiroId: adminContext.barbeiroId, apelido: adminContext.apelido || "", userId: adminContext.userId, tenantId: tenantId || null, isTenantAdmin: true, deletedAt: null, graceDaysLeft: 0, canManageTenantWideClientBlock: true }} basePath={BASE} forceViewMode="meus" /> : null} />
                  <Route path="avaliacoes" element={<AdminAvaliacoes tenantId={tenantId || undefined} basePath={BASE} />} />
                  <Route path="financeiro" element={<AdminFinanceiro userId={adminContext.userId} userName={adminContext.apelido} barbeiroId={adminContext.barbeiroId} basePath={BASE} />} />
                  <Route path="relatorios" element={<EstatisticasRelatorios isGlobal barbeiroId={adminContext.barbeiroId} tenantId={tenantId} basePath="/tenant/admin/perfil" />} />
                  <Route path="servicos/*" element={tenantId ? <AdminServicos tenantId={tenantId} basePath={BASE} /> : null} />
                  <Route path="promocoes/preparando" element={<Navigate to={`${BASE}/promocoes`} replace />} />
                  <Route path="promocoes" element={<AdminCampanhas tenantId={tenantId || undefined} basePath={BASE} />} />
                  <Route path="horarios" element={<TenantAdminMobileHorariosRoute barbeiroId={adminContext?.barbeiroId || undefined} tenantId={tenantId || undefined} />} />
                  <Route path="disparo" element={<AdminDisparo tenantId={tenantId || undefined} basePath={BASE} barbeiroId={adminContext?.barbeiroId || undefined} canSelectAllClients />} />
                  <Route path="seguranca" element={<AdminSeguranca basePath={BASE} />} />
                  <Route path="dados-empresa/*" element={<AdminDadosEmpresa basePath={BASE} tenantId={tenantId} />} />
                  <Route path="perfil" element={<AdminMobileProfile basePath={BASE} isTenant />} />
                  <Route path="configuracoes-perfil" element={tenantAdminBarberContext ? <BarberConfigBarbearia barberContext={tenantAdminBarberContext} basePath={`${BASE}/config-barbearia`} appBasePath={BASE} /> : null} />
                  <Route path="config-barbearia" element={tenantAdminBarberContext ? <BarberConfigBarbearia barberContext={tenantAdminBarberContext} basePath={`${BASE}/config-barbearia`} appBasePath={BASE} /> : null} />
                  <Route path="assinatura" element={<TenantSubscriptionPage subscription={subscription} basePath={BASE} tenantId={tenantId} />} />
                  <Route path="whatsapp" element={<WhatsAppConnectionPage barbeiroId={adminContext?.barbeiroId} userId={adminContext?.userId} basePath={BASE} tenantNome={tenantNome} barberName={adminContext?.apelido} />} />
                  <Route path="portfolio" element={adminContext?.barbeiroId ? <PortfolioManager barbeiroId={adminContext.barbeiroId} tenantId={tenantId} title="Portfólio da Barbearia" showBack onBack={() => navigate(`${BASE}/perfil`)} /> : null} />
                  <Route path="unidades" element={<AdminUnidades basePath={BASE} />} />
                  <Route path="meus-planos" element={<AdminMeusPlanos basePath={BASE} />} />
                  <Route path="loja" element={tenantId ? <AdminLoja tenantId={tenantId} /> : null} />
                  <Route path="indicacoes" element={<AdminIndicacoes />} />
                  <Route path="minhas-indicacoes" element={<AdminIndicacoes />} />
                </Routes>
              </Suspense>
            </div>
          </main>
        )}

        {/* Bottom Navigation — esconder nas configurações, edição de serviços/planos e horários */}
        {!location.pathname.includes("configuracoes-perfil") && !location.pathname.includes("config-barbearia") && !location.pathname.includes("servicos/cortes") && !location.pathname.includes("servicos/planos") && !location.pathname.includes("horarios") && !location.pathname.includes("financeiro") && !location.pathname.includes("dados-empresa") && !location.pathname.includes("seguranca") && !location.pathname.includes("clientes") && !location.pathname.includes("barbeiros") && !location.pathname.includes("avaliacoes") && !location.pathname.includes("promocoes") && !location.pathname.includes("relatorios") && !location.pathname.includes("whatsapp") && !location.pathname.includes("assinatura") && !location.pathname.includes("portfolio") && !location.pathname.includes("unidades") && !location.pathname.includes("loja") && (
          <div className="lg:hidden">
            <AdminMobileNavigation
              basePath={BASE}
            />
          </div>
        )}
        <SupportChatBubble />
      </div>
    );
  }

  // ========== LAYOUT DESKTOP ==========
  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-background">
      {/* Modal de pendências de configuração (desktop) */}
      <PendingSetupModal
        open={pendingSetupOpen}
        onClose={() => setPendingSetupOpen(false)}
        whatsappConnected={whatsAppStatus.isConnected}
        walletActive={walletPrompt.walletActive === true}
        basePath={BASE}
      />

      {/* Modal de ativação da carteira (desktop) — não abrir junto com PendingSetupModal */}
      <WalletActivationModal
        open={walletPrompt.shouldShowModal && !pendingSetupOpen}
        onOpenChange={(open) => !open && walletPrompt.dismissModal()}
        barbeiroId={adminContext.barbeiroId!}
        barberName={walletPrompt.barberName}
        onSuccess={walletPrompt.onActivated}
      />

      {/* Sidebar — idêntica ao Admin, com basePath e tenantNome */}
      <AdminSidebar
        basePath={BASE}
        tenantNome={tenantNome}
        pendingCount={pendingCount}
      />

      {/* Conteúdo principal — layout idêntico ao Admin */}
      <main className="relative z-10 flex-1 flex flex-col h-screen overflow-hidden transition-all duration-300">
        {/* Trial banner desktop */}
        {subscription.showTrialWarning && (
          <TrialBanner daysRemaining={subscription.daysRemaining} onSubscribe={goToSubscription} />
        )}
        <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none">
          <div className={isSubscriptionRoute ? "h-full" : "p-6 lg:p-8 max-w-[1600px] mx-auto"}>
            <Suspense fallback={<LoadingFallback />}>
              <Routes>
                <Route index element={<AdminDashboard adminContext={adminContext} basePath={BASE} tenantId={tenantId} />} />
                <Route path="agenda" element={<AdminAgenda adminContext={adminContext} tenantId={tenantId} />} />
                <Route path="confirmacoes-pendentes" element={<AdminConfirmacoesPendentes adminContext={adminContext} />} />
                <Route path="barbeiros" element={tenantId ? <TenantBarbeiros tenantId={tenantId} basePath={BASE} subscriptionStatus={subscription.status} subscriptionPriceMonthly={subscription.priceMonthly} /> : null} />
                <Route path="clientes" element={adminContext.barbeiroId ? <BarberClientes barberContext={{ barbeiroId: adminContext.barbeiroId, apelido: adminContext.apelido || "", userId: adminContext.userId, tenantId: tenantId || null, isTenantAdmin: true, deletedAt: null, graceDaysLeft: 0, canManageTenantWideClientBlock: true }} basePath={BASE} forceViewMode="todos" /> : null} />
                <Route path="meus-clientes" element={adminContext.barbeiroId ? <BarberClientes barberContext={{ barbeiroId: adminContext.barbeiroId, apelido: adminContext.apelido || "", userId: adminContext.userId, tenantId: tenantId || null, isTenantAdmin: true, deletedAt: null, graceDaysLeft: 0, canManageTenantWideClientBlock: true }} basePath={BASE} forceViewMode="meus" /> : null} />
                <Route path="avaliacoes" element={<AdminAvaliacoes tenantId={tenantId || undefined} basePath={BASE} />} />
                <Route path="financeiro" element={<AdminFinanceiro userId={adminContext.userId} userName={adminContext.apelido} barbeiroId={adminContext.barbeiroId} basePath={BASE} />} />
                <Route path="relatorios" element={<EstatisticasRelatorios isGlobal barbeiroId={adminContext.barbeiroId} tenantId={tenantId} basePath="/tenant/admin/perfil" />} />
                <Route path="servicos/*" element={tenantId ? <AdminServicos tenantId={tenantId} basePath={BASE} /> : null} />
                <Route path="promocoes/preparando" element={<Navigate to={`${BASE}/promocoes`} replace />} />
                <Route path="promocoes" element={<AdminCampanhas tenantId={tenantId || undefined} basePath={BASE} />} />
                <Route path="horarios" element={<TenantAdminHorariosRoute barbeiroId={adminContext?.barbeiroId || undefined} tenantId={tenantId || undefined} />} />
                <Route path="disparo" element={<AdminDisparo tenantId={tenantId || undefined} basePath={BASE} barbeiroId={adminContext?.barbeiroId || undefined} canSelectAllClients />} />
                <Route path="seguranca" element={<AdminSeguranca basePath={BASE} />} />
                <Route path="dados-empresa/*" element={<AdminDadosEmpresa basePath={BASE} tenantId={tenantId} />} />
                <Route path="configuracoes-perfil" element={tenantAdminBarberContext ? <BarberConfigBarbearia barberContext={tenantAdminBarberContext} basePath={`${BASE}/config-barbearia`} appBasePath={BASE} /> : null} />
                <Route path="config-barbearia" element={tenantAdminBarberContext ? <BarberConfigBarbearia barberContext={tenantAdminBarberContext} basePath={`${BASE}/config-barbearia`} appBasePath={BASE} /> : null} />
                <Route path="assinatura" element={<TenantSubscriptionPage subscription={subscription} basePath={BASE} tenantId={tenantId} />} />
                <Route path="whatsapp" element={<WhatsAppConnectionPage barbeiroId={adminContext?.barbeiroId} userId={adminContext?.userId} basePath={BASE} tenantNome={tenantNome} barberName={adminContext?.apelido} />} />
                <Route path="portfolio" element={adminContext?.barbeiroId ? <PortfolioManager barbeiroId={adminContext.barbeiroId} tenantId={tenantId} title="Portfólio da Barbearia" showBack onBack={() => navigate(BASE)} /> : null} />
                <Route path="unidades" element={<AdminUnidades basePath={BASE} />} />
                <Route path="loja" element={tenantId ? <AdminLoja tenantId={tenantId} /> : null} />
                <Route path="indicacoes" element={<AdminIndicacoes />} />
                <Route path="minhas-indicacoes" element={<AdminIndicacoes />} />
              </Routes>
            </Suspense>
          </div>
        </div>
      </main>
      <SupportChatBubble />
    </div>
  );
};

/**
 * Wrapper para rota de horários — detecta ?empresa=1 para ativar companyMode.
 * Em companyMode, NÃO passa barbeiroId → lê/escreve da tabela global configuracoes_horario.
 */
function TenantAdminHorariosRoute({ barbeiroId, tenantId }: { barbeiroId?: string; tenantId?: string }) {
  const [searchParams] = useSearchParams();
  const isCompanyMode = searchParams.get("empresa") === "1";

  return (
    <AdminHorarios
      key={isCompanyMode ? 'company' : 'personal'}
      barbeiroId={isCompanyMode ? undefined : barbeiroId}
      companyMode={isCompanyMode}
      tenantId={tenantId}
    />
  );
}

function TenantAdminMobileHorariosRoute({ barbeiroId, tenantId }: { barbeiroId?: string; tenantId?: string }) {
  const [searchParams] = useSearchParams();
  const isCompanyMode = searchParams.get("empresa") === "1";

  return (
    <AdminMobileHorarios
      key={isCompanyMode ? 'company-mobile' : 'personal-mobile'}
      basePath={BASE}
      barbeiroId={isCompanyMode ? undefined : barbeiroId}
      companyMode={isCompanyMode}
      tenantId={tenantId}
    />
  );
}

export default TenantAdmin;
