import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { HomeNavIcon, AgendaNavIcon, FinanceiroNavIcon, MenuGridNavIcon } from "./AppNavIcons";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { STALE_TIMES } from "@/lib/queryConstants";
import { fetchAgendaDia } from "@/lib/fetchers/agendaFetchers";
import { fetchBarberDashboard } from "@/hooks/useBarberDashboard";
import { useMonthAppointmentsCount } from "@/hooks/useMonthAppointmentsCount";
import { supabase } from "@/integrations/supabase/client";
import { readSyncCache } from "@/lib/syncQueryCache";

interface AppMobileNavProps {
  basePath: string;
}

const items = [
  { key: "inicio", label: "Início", path: "", end: true, Icon: HomeNavIcon, countKey: "inicio" },
  { key: "agenda", label: "Agenda", path: "/agenda", Icon: AgendaNavIcon, countKey: "agenda" },
  { key: "carteira", label: "Financeiro", path: "/carteira", Icon: FinanceiroNavIcon, countKey: "financeiro" },
  { key: "menu", label: "Menu", path: "/perfil", Icon: MenuGridNavIcon, countKey: "menu" },
];

/**
 * Barra de navegação inferior — Dock flutuante cinza escuro (#202126),
 * pílula ativa branca com texto e ícone escuro, ícones inativos em traço branco (26px),
 * mais larga de cima para baixo (h-[72px], itens h-[56px]) e 100% minimalista e séria.
 */
export function AppMobileBottomBar({ basePath }: AppMobileNavProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [barbeiroId, setBarbeiroId] = useState<string | null>(() => localStorage.getItem("barbeiroId"));

  useEffect(() => {
    setBarbeiroId(localStorage.getItem("barbeiroId"));
  }, []);

  // Ocultar completamente a barra de navegação em telas imersivas como disparo de mensagens
  if (location.pathname.includes("/disparo")) {
    return null;
  }

  // Contagem de agendamentos de hoje para a aba "Agenda"
  const { data: agendaCount = 0 } = useMonthAppointmentsCount(barbeiroId);

  // Contagem de confirmações/pendências financeiras para a aba "Financeiro"
  const { data: finPendingCount = 0 } = useQuery({
    queryKey: ["bottom-nav-fin-pending", barbeiroId, basePath],
    staleTime: 30_000,
    queryFn: async () => {
      try {
        let q = supabase
          .from("assinaturas")
          .select("id", { count: "exact", head: true })
          .eq("payment_method", "cash")
          .or("status.in.(suspended,pending_cash),and(status.eq.active,cash_payment_confirmed.eq.false)");
        if (barbeiroId) {
          q = q.eq("barbeiro_id", barbeiroId);
        }
        const { count } = await q;
        return count ?? 0;
      } catch {
        return 0;
      }
    },
  });

  // Contagem de itens pendentes de configuração para a aba "Menu"
  const { data: menuPendingCount = 0 } = useQuery({
    queryKey: ["bottom-nav-menu-pending", barbeiroId],
    staleTime: 60_000,
    queryFn: async () => {
      try {
        if (!barbeiroId) return 0;
        // Verifica no cache síncrono do setup completion se há etapas pendentes
        const cached = readSyncCache<{ steps: { completed: boolean }[] }>(`setup-completion:${barbeiroId}:`);
        if (cached?.data?.steps) {
          const incomplete = cached.data.steps.filter((s) => !s.completed).length;
          return incomplete;
        }
        const { data: barb } = await supabase
          .from("barbeiros")
          .select("setup_completed")
          .eq("id", barbeiroId)
          .maybeSingle();
        return barb && !barb.setup_completed ? 1 : 0;
      } catch {
        return 0;
      }
    },
  });

  // Subscription em tempo real para atualizar badges quando houver novos agendamentos ou pagamentos
  useEffect(() => {
    const channel = supabase
      .channel(`bottom-bar-badges-${barbeiroId || "global"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "agendamentos" }, () => {
        queryClient.invalidateQueries({ queryKey: ["day-appointments-count"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "assinaturas" }, () => {
        queryClient.invalidateQueries({ queryKey: ["bottom-nav-fin-pending"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [barbeiroId, queryClient]);

  const getBadgeCount = (countKey?: string) => {
    if (countKey === "agenda") return agendaCount;
    if (countKey === "financeiro") return finPendingCount;
    if (countKey === "menu") return menuPendingCount;
    return 0;
  };

  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  // Detecta teclado virtual para esconder a barra de navegação e evitar que ela suba na tela
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        setIsKeyboardOpen(true);
      }
    };

    const handleFocusOut = () => {
      setTimeout(() => {
        const active = document.activeElement as HTMLElement | null;
        if (!active || (active.tagName !== "INPUT" && active.tagName !== "TEXTAREA" && !active.isContentEditable)) {
          setIsKeyboardOpen(false);
        }
      }, 120);
    };

    const handleViewportResize = () => {
      if (window.visualViewport) {
        const isKeyboard = window.visualViewport.height < window.innerHeight * 0.75;
        setIsKeyboardOpen(isKeyboard);
      }
    };

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleViewportResize);
    }

    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleViewportResize);
      }
    };
  }, []);

  /** Pré-carrega dados de cada aba ao tocar/hover */
  const prefetchTab = (key: string) => {
    if (!barbeiroId) return;
    if (key === "agenda") {
      const hoje = new Date().toISOString().split("T")[0];
      void queryClient.prefetchQuery({
        queryKey: QUERY_KEYS.barbeiro.agenda(barbeiroId, hoje),
        queryFn: () => fetchAgendaDia(barbeiroId, hoje),
        staleTime: STALE_TIMES.AGENDA_DIA,
      });
    } else if (key === "inicio") {
      void queryClient.prefetchQuery({
        queryKey: QUERY_KEYS.barbeiro.dashboard(barbeiroId),
        queryFn: () => fetchBarberDashboard(barbeiroId),
        staleTime: 1000 * 60 * 5,
      });
    }
  };

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-[60] w-full transition-transform duration-200 pointer-events-none",
        isKeyboardOpen ? "translate-y-full opacity-0" : "translate-y-0 opacity-100"
      )}
    >
      <nav
        aria-label="Navegação do aplicativo"
        className="pointer-events-auto relative w-full bg-[#202126] border-t border-white/10 shadow-[0_-4px_24px_rgba(0,0,0,0.25)] transition-all duration-300 dark:bg-[#121820]/95 dark:backdrop-blur-xl dark:border-white/[0.08] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.55)]"
        style={{
          paddingBottom: "max(var(--app-safe-bottom, 0px), env(safe-area-inset-bottom, 0px))",
        }}
      >
        {/* Bleed inferior para garantir cobertura total atrás do home indicator e em bounce scroll no iOS */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-[#202126] dark:bg-[#121820]"
          style={{ height: "60px" }}
        />

        <div className="flex items-center justify-around px-2 sm:px-4 h-[68px] max-w-lg mx-auto">
          {items.map(({ key, label, path, end, Icon, countKey }) => {
            const to = `${basePath}${path}`;
            const cleanCurrent = location.pathname.replace(/\/$/, "");
            const cleanTarget = to.replace(/\/$/, "");
            const isItemActive =
              key === "inicio"
                ? cleanCurrent === cleanTarget || cleanCurrent === basePath.replace(/\/$/, "")
                : key === "carteira"
                ? cleanCurrent.startsWith(`${basePath}/carteira`) || cleanCurrent.startsWith(`${basePath}/financeiro`)
                : cleanCurrent === cleanTarget || cleanCurrent.startsWith(`${cleanTarget}/`);

            const count = getBadgeCount(countKey);
            const hasBadge = count > 0;

            return (
              <NavLink
                key={key}
                to={to}
                end={end}
                title={label}
                onPointerEnter={() => prefetchTab(key)}
                onPointerDown={() => prefetchTab(key)}
                onClick={(e) => {
                  prefetchTab(key);
                  if (location.pathname !== to) {
                    e.preventDefault();
                    navigate(to);
                  }
                }}
                className="relative flex items-center justify-center touch-manipulation select-none"
              >
                {({ isActive: routerIsActive }) => {
                  const active = isItemActive || routerIsActive;
                  return (
                    <div
                      className={cn(
                        "relative flex items-center justify-center transition-all duration-300 active:scale-95 shrink-0",
                        active
                          ? "h-[54px] px-4 sm:px-4.5 bg-white text-[#09090b] rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.22)] gap-2.5 dark:bg-white/10 dark:hover:bg-white/[0.14] dark:border dark:border-white/15 dark:text-white dark:shadow-xs"
                          : "w-[52px] sm:w-[56px] h-[52px] rounded-full text-white/95 hover:text-white dark:text-white/50 dark:hover:text-white/80"
                      )}
                    >
                      <div className="relative flex items-center justify-center shrink-0">
                        <Icon
                          active={active}
                          className={cn(
                            "w-[26px] h-[26px] shrink-0 block",
                            active ? "text-[#09090b] dark:text-white" : "text-white dark:text-white/60"
                          )}
                          aria-hidden="true"
                        />
                        {hasBadge && (
                          <span
                            className={cn(
                              "absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-1 rounded-full text-[9.5px] font-bold flex items-center justify-center leading-none shadow-sm bg-red-500 text-white",
                              active ? "ring-2 ring-white dark:ring-white/20" : "ring-2 ring-[#202126] dark:ring-[#121820]"
                            )}
                            aria-label={`${count} pendências`}
                          >
                            {count > 99 ? "99+" : count}
                          </span>
                        )}
                      </div>
                      {active && (
                        <span className="text-[13.5px] font-bold text-[#09090b] dark:font-semibold dark:text-white tracking-tight leading-none whitespace-nowrap">
                          {label}
                        </span>
                      )}
                    </div>
                  );
                }}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
