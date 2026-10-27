import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { BrowserRouter, Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { useEffect, lazy as reactLazy, Suspense } from "react";
import { useMaintenanceMode } from "@/hooks/useMaintenanceMode";
import { MaintenanceScreen } from "@/components/MaintenanceScreen";
import { MaintenanceWarningBanner } from "@/components/MaintenanceWarningBanner";
import { captureReferralFromUrl } from "@/lib/referral";
import { useRefreshRequired } from "@/hooks/useRefreshRequired";
import { RefreshRequiredScreen } from "@/components/RefreshRequiredScreen";
import { ScrollRestoration } from "@/components/layout/ScrollRestoration";
import { applyStatusBarColor } from "@/hooks/useStatusBarColor";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { LoadingScreen } from "@/components/shared/LoadingScreen";
import { InstallPwaPrompt } from "@/components/pwa/InstallPwaPrompt";
import { supabase } from "@/integrations/supabase/client";
import { clearDeviceCaches } from "@/lib/sessionGuard";

// Landing e Login são eager (páginas de entrada — quase todo primeiro paint cai aqui).
import Index from "./pages/Index";
import Auth from "./pages/Auth";

// Todas as demais rotas são lazy: reduz drasticamente o bundle inicial
// (Admin/Barbeiro/Cliente carregam só quando o usuário navega até elas).
// Após uma publicação, arquivos antigos deixam de existir: recarrega 1x em silêncio.
const lazyRetry = <T,>(fn: () => Promise<T>) => async () => {
  try {
    const mod = await fn();
    sessionStorage.removeItem("dub-chunk-reload");
    return mod;
  } catch (err) {
    if (!sessionStorage.getItem("dub-chunk-reload")) {
      sessionStorage.setItem("dub-chunk-reload", "1");
      window.location.reload();
      return new Promise<T>(() => {});
    }
    throw err;
  }
};
const lazy = <T extends React.ComponentType<any>>(fn: () => Promise<{ default: T }>) =>
  reactLazy(lazyRetry(fn));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Admin = lazy(() => import("./pages/Admin"));
const Barbeiro = lazy(() => import("./pages/Barbeiro"));
const AdminRelatoriosMensais = lazy(() => import("./pages/AdminRelatoriosMensais"));
const AgendaFullScreen = lazy(() => import("./pages/AgendaFullScreen"));
const Cliente = lazy(() => import("./pages/Cliente"));
const ClienteAssinar = lazy(() => import("./pages/ClienteAssinar"));
const TestAutoLogin = lazy(() => import("./pages/TestAutoLogin"));
const ClienteAgendar = lazy(() => import("./pages/ClienteAgendar"));
const SupportChat = lazy(() => import("./pages/SupportChat"));
const NotFound = lazy(() => import("./pages/NotFound"));
const TenantPublicPage = lazy(() => import("./pages/TenantPublicPage"));
const UnitAdminAuth = lazy(() => import("./pages/UnitAdminAuth"));
const UnitAdminDashboard = lazy(() => import("./pages/UnitAdminDashboard"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Dado permanece fresco por 5 minutos — evita loading ao alternar abas
      staleTime: 1000 * 60 * 5,
      // Cache sobrevive 30 minutos após o componente desmontar
      gcTime: 1000 * 60 * 30,
      // Barbeiros alternam entre WhatsApp/Instagram constantemente
      refetchOnWindowFocus: false,
      // Conexões móveis oscilam — não recarregar tudo a cada reconexão
      refetchOnReconnect: false,
      // Apenas 1 tentativa em caso de erro
      retry: 1,
      // Delay exponencial: 2s, 4s, máximo 10s
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
      // Usa cache imediatamente ao montar; refaz em background só se stale
      refetchOnMount: false,
    },
    mutations: {
      // Ações do barbeiro nunca devem executar duas vezes
      retry: 0,
    },
  },
});

// Persistir cache do react-query em localStorage: dashboard, agenda e demais
// queries do barbeiro voltam instantaneamente ao remontar a página.
const queryPersister =
  typeof window !== "undefined"
    ? createSyncStoragePersister({
        storage: window.localStorage,
        // v1 persistia praticamente todas as queries do app. Em celulares, esse
        // JSON podia ficar grande e travar a thread principal na troca de abas.
        // v2 é um cache curto e seletivo, focado só nas telas críticas.
        key: "dub-rq-cache-v2-lite",
        throttleTime: 1000,
      })
    : undefined;

const isCriticalFastQuery = (queryKey: readonly unknown[]) => {
  const [scope, area] = queryKey;
  if (scope === "barbeiro" && ["dashboard", "agenda", "clientes"].includes(String(area))) {
    return true;
  }
  if (scope === "tenant" && area === "disparo") {
    return true;
  }
  return false;
};

function QueryCacheHousekeeping() {
  useEffect(() => {
    try {
      // Remove o cache antigo pesado uma vez, sem bloquear renderização inicial.
      window.requestIdleCallback?.(() => window.localStorage.removeItem("dub-rq-cache-v1"));
      if (!window.requestIdleCallback) {
        window.setTimeout(() => window.localStorage.removeItem("dub-rq-cache-v1"), 1200);
      }
    } catch {}

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        clearDeviceCaches();
        queryClient.clear();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return null;
}

function AppStatusBarSync() {
  useEffect(() => {
    const sync = () => {
      const path = typeof window !== "undefined" ? window.location.pathname : "";
      if (path === "/") {
        applyStatusBarColor("#FAF5F2");
      } else if (path.includes("carteira") || path.includes("financeiro")) {
        applyStatusBarColor("#144439");
      } else {
        applyStatusBarColor("app-background");
      }
    };

    sync();

    const observer = new MutationObserver(() => {
      sync();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    window.addEventListener("pageshow", sync);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);

    return () => {
      observer.disconnect();
      window.removeEventListener("pageshow", sync);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return null;
}

// Routes that are always accessible (before login)
const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/auth',
  '/esqueci-senha',
  '/resetar-senha'
];

function MaintenanceWrapper({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { 
    isMaintenanceMode, 
    maintenanceMessage, 
    isLoading, 
    isAllowedUser,
    isAuthenticated,
    warningActive,
    warningMessage,
    warningPublico
  } = useMaintenanceMode();

  // Check if current route is public (before login) or onboarding
  const isPublicRoute = PUBLIC_ROUTES.some(route => 
    location.pathname === route || location.pathname.startsWith('/auth')
  );
  
  // Onboarding não deve exibir banner de manutenção
  const isOnboardingRoute = location.pathname === '/onboarding' || location.pathname === '/cadastro';
  
  // Rotas de staff (admin, barbeiro, ti) gerenciam seu próprio banner e controle de manutenção internamente.
  // A agenda em tela cheia também é uma rota autenticada de staff; se ela passar pelo fluxo
  // público/cliente, pode ser tratada como slug público e voltar para a tela inicial.
  const isStaffRoute = location.pathname.startsWith('/admin') || 
                       location.pathname.startsWith('/ti') ||
                       location.pathname.startsWith('/barbeiro') ||
                       location.pathname === '/agenda' ||
                       location.pathname.startsWith('/agenda-fullscreen');

  // Public routes (login, etc.) are always accessible
  if (isPublicRoute) {
    return <>{children}</>;
  }

  // Onboarding: renderizar sem banner de manutenção
  if (isOnboardingRoute) {
    return <>{children}</>;
  }

  // Rotas de staff: não interferir — elas gerenciam banner e manutenção internamente
  if (isStaffRoute) {
    return <>{children}</>;
  }

  // Enquanto carrega o status de manutenção, mostra loading apenas nas rotas
  // realmente controladas por este wrapper. Rotas de staff já retornaram acima,
  // então Início/Agenda/Disparo do barbeiro não ficam presos no loading global.
  if (isLoading) {
    return <LoadingScreen message="Carregando..." />;
  }

  // Banner de cliente: só aparece se o público for 'cliente' ou 'ambos'
  const showClientBanner = warningActive && warningMessage && (warningPublico === 'cliente' || warningPublico === 'ambos');

  // Allowed users (admins or in email whitelist) can access everything
  if (isAllowedUser) {
    return (
      <div className="flex flex-col min-h-app">
        {showClientBanner && (
          <MaintenanceWarningBanner message={warningMessage} />
        )}
        <div className="flex-1 flex flex-col min-h-0">
          {children}
        </div>
      </div>
    );
  }

  // If user is authenticated but NOT allowed, and maintenance is active
  if (isAuthenticated && isMaintenanceMode) {
    return (
      <MaintenanceScreen 
        message={maintenanceMessage || undefined}
        onExit={() => {
          navigate('/');
        }}
      />
    );
  }

  // Normal flow - show warning banner if active
  return (
    <div className="flex flex-col min-h-app">
      {showClientBanner && (
        <MaintenanceWarningBanner message={warningMessage} />
      )}
      <div className="flex-1 flex flex-col min-h-0">
        {children}
      </div>
    </div>
  );
}

function AppRoutes() {
  const { showRefreshOverlay, handleRefresh } = useRefreshRequired();
  const location = useLocation();

  // Sincronização inteligente de tema por rota:
  // - Na Landing Page ("/"): SEMPRE força a versão branca (tema claro), garantindo contraste e legibilidade perfeita.
  // - Nas demais telas (login, barbeiro, admin, cliente, etc.): restaura a preferência salva do usuário (escuro/claro).
  useEffect(() => {
    if (typeof document === "undefined") return;

    if (location.pathname === "/") {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
      document.documentElement.style.colorScheme = "light";
      applyStatusBarColor("#FAF5F2");
    } else {
      const savedTheme = localStorage.getItem("dub-theme-v3") || "light";
      if (savedTheme === "dark") {
        document.documentElement.classList.remove("light");
        document.documentElement.classList.add("dark");
        document.documentElement.style.colorScheme = "dark";
      } else {
        document.documentElement.classList.remove("dark");
        document.documentElement.classList.add("light");
        document.documentElement.style.colorScheme = "light";
      }

      if (location.pathname.includes("carteira") || location.pathname.includes("financeiro")) {
        applyStatusBarColor("#144439");
      } else {
        applyStatusBarColor("app-background");
      }
    }
  }, [location.pathname]);

  // Captura o código de indicação (?ref=) de qualquer rota de entrada
  useEffect(() => {
    void captureReferralFromUrl();
  }, [location.pathname, location.search]);

  return (
    <>
      {showRefreshOverlay && <RefreshRequiredScreen onRefresh={handleRefresh} />}
      <MaintenanceWrapper>
        <Suspense fallback={<LoadingScreen message="Carregando..." />}>
        <Routes>
        {/* Landing page */}
        <Route path="/" element={<Index />} />
        
        {/* Login/cadastro em tela cheia (Mr Caseiro-style, 2 etapas) */}
        <Route path="/login" element={<Auth />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/auth" element={<Navigate to="/" replace />} />
        <Route path="/esqueci-senha" element={<ForgotPassword />} />
        <Route path="/resetar-senha" element={<ResetPassword />} />

        {/* ─── Fluxo SaaS: cadastro de donos de barbearia ─── */}
        <Route path="/cadastro" element={<Navigate to="/" replace />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/minha-barbearia" element={<Navigate to="/admin" replace />} />
        <Route path="/tenant/admin/*" element={<Navigate to="/admin" replace />} />
        <Route path="/home" element={<Navigate to="/barbeiro" replace />} />
        <Route path="/inicio" element={<Navigate to="/barbeiro" replace />} />
        
        {/* Rotas administrativas DUB original */}
        <Route path="/agenda" element={<AgendaFullScreen />} />
        <Route path="/agenda-fullscreen" element={<AgendaFullScreen />} />
        <Route path="/admin/relatorios-mensais" element={<AdminRelatoriosMensais />} />
        <Route path="/admin/*" element={<Admin />} />
        <Route path="/barbeiro/*" element={<Barbeiro />} />
        {/* Painel TI removido — vive em outro projeto. */}
        <Route path="/ti/*" element={<Navigate to="/admin" replace />} />
        
        {/* Admin de Unidade — login separado */}
        <Route path="/admin-unidade/login" element={<UnitAdminAuth />} />
        <Route path="/admin-unidade" element={<UnitAdminDashboard />} />
        
        {/* Auto-login para testes */}
        <Route path="/test-login" element={<TestAutoLogin />} />
        
        {/* Rotas do cliente */}
        <Route path="/cliente" element={<Cliente />} />
        <Route path="/cliente/assinar" element={<ClienteAssinar />} />
        <Route path="/cliente/agendar" element={<ClienteAgendar />} />
        <Route path="/suporte" element={<SupportChat />} />
        
        {/* Rota pública: slug do tenant → agendamento */}
        <Route path="/b/:slug" element={<TenantPublicPage />} />
        <Route path="/:slug" element={<TenantPublicPage />} />
        
        {/* Catch-all */}
        <Route path="*" element={<NotFound />} />
      </Routes>
        </Suspense>
      </MaintenanceWrapper>
    </>
  );
}

const App = () => (
<ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="dub-theme-v3">
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister!,
        maxAge: 1000 * 60 * 60 * 24, // 24h
        buster: "v3-clean",
        dehydrateOptions: {
          shouldDehydrateQuery: (q) =>
            q.state.status === "success" && isCriticalFastQuery(q.queryKey),
        },
      }}
    >
      <TooltipProvider>
        <AppErrorBoundary>
          <QueryCacheHousekeeping />
          <AppStatusBarSync />
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <ScrollRestoration />
            <InstallPwaPrompt />
            <AppRoutes />
          </BrowserRouter>
        </AppErrorBoundary>
      </TooltipProvider>
    </PersistQueryClientProvider>
  </ThemeProvider>
);

export default App;
