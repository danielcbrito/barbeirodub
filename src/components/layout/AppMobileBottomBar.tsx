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
import { useBarbershopPendingFields } from "@/hooks/useBarbershopPendingFields";

interface AppMobileNavProps {
  basePath: string;
  barbeiroId?: string | null;
}

const items = [
  { key: "inicio", label: "Início", path: "", end: true, Icon: HomeNavIcon, countKey: "inicio" },
  { key: "agenda", label: "Agenda", path: "/agenda", Icon: AgendaNavIcon, countKey: "agenda" },
  { key: "carteira", label: "Finanças", path: "/carteira", Icon: FinanceiroNavIcon, countKey: "financeiro" },
  { key: "menu", label: "Mais", path: "/perfil", Icon: MenuGridNavIcon, countKey: "menu" },
];

/**
 * Barra de navegação inferior — Dock flutuante cinza escuro (#202126),
 * pílula ativa branca com texto e ícone escuro, ícones inativos em traço branco (26px),
 * mais larga de cima para baixo (h-[72px], itens h-[56px]) e 100% minimalista e séria.
 */
export function AppMobileBottomBar({ basePath, barbeiroId: propBarbeiroId }: AppMobileNavProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [localBarbeiroId, setLocalBarbeiroId] = useState<string | null>(() => {
    return propBarbeiroId || (typeof window !== "undefined" ? localStorage.getItem("barbeiroId") : null);
  });

  useEffect(() => {
    if (propBarbeiroId) {
      setLocalBarbeiroId(propBarbeiroId);
      return;
    }
    const current = localStorage.getItem("barbeiroId");
    if (current) setLocalBarbeiroId(current);

    const handleStorage = () => {
      const updated = localStorage.getItem("barbeiroId");
      if (updated) setLocalBarbeiroId(updated);
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [propBarbeiroId]);

  const barbeiroId = propBarbeiroId || localBarbeiroId;
  const [tenantId, setTenantId] = useState<string | null>(() => {
    return typeof window !== "undefined" ? localStorage.getItem("tenantId") : null;
  });

  useEffect(() => {
    if (barbeiroId && !tenantId) {
      supabase
        .from("barbeiros")
        .select("tenant_id")
        .eq("id", barbeiroId)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.tenant_id) {
            setTenantId(data.tenant_id);
            try { localStorage.setItem("tenantId", data.tenant_id); } catch {}
          }
        });
    }
  }, [barbeiroId, tenantId]);

  const { totalPendingCount: companyPendingCount } = useBarbershopPendingFields(tenantId);

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

  // Contagem de itens pendentes de configuração para a aba "Menu" (Mais)
  const { data: menuPendingCount = 0 } = useQuery({
    queryKey: ["bottom-nav-menu-pending", barbeiroId],
    staleTime: 60_000,
    queryFn: async () => {
      try {
        // 1. Verifica no localStorage por qualquer cache síncrono do setup completion do barbeiro
        if (typeof window !== "undefined" && barbeiroId) {
          const prefix = `dub:qc:v1:setup-completion:${barbeiroId}`;
          const cachedKey = Object.keys(localStorage).find((k) => k.startsWith(prefix));
          if (cachedKey) {
            try {
              const parsed = JSON.parse(localStorage.getItem(cachedKey) || "");
              if (parsed?.d?.steps && Array.isArray(parsed.d.steps)) {
                const incomplete = parsed.d.steps.filter((s: { completed: boolean }) => !s.completed).length;
                if (incomplete > 0) return incomplete;
              }
            } catch {
              /* ignore json error */
            }
          }
        }

        // 2. Se não encontrou no cache síncrono, consulta no Supabase
        if (barbeiroId) {
          const { data: barb } = await supabase
            .from("barbeiros")
            .select("setup_completed")
            .eq("id", barbeiroId)
            .maybeSingle();
          if (barb && !barb.setup_completed) return 1;
        }
        return 0;
      } catch {
        return 0;
      }
    },
  });

  // Subscription em tempo real para atualizar badges quando houver novos agendamentos ou pagamentos
  useEffect(() => {
    const channel = supabase
      .channel(`bottom-bar-badges-${barbeiroId || "global"}-${Math.random().toString(36).slice(2, 9)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agendamentos",
          filter: barbeiroId ? `barbeiro_id=eq.${barbeiroId}` : undefined,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["day-appointments-count"] });
          if (barbeiroId) {
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.barbeiro.dashboard(barbeiroId) });
          }
        }
      )
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
    if (countKey === "menu") return companyPendingCount > 0 ? companyPendingCount : menuPendingCount;
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
        "fixed left-1/2 -translate-x-1/2 z-[60] pointer-events-none flex justify-center items-center w-full px-3 transition-all duration-200",
        isKeyboardOpen ? "opacity-0 translate-y-16 pointer-events-none" : "opacity-100 translate-y-0"
      )}
      style={{
        bottom: "calc(0.75rem + var(--app-safe-bottom, 8px))",
      }}
    >
        <nav
          aria-label="Navegação do aplicativo"
          className="pointer-events-auto flex items-center justify-between p-2 sm:p-2.5 h-[76px] rounded-full border border-black/[0.08] dark:border-white/15 shadow-[0_14px_40px_rgba(0,0,0,0.12),inset_0_1px_1px_rgba(255,255,255,0.6)] dark:shadow-[0_16px_44px_rgba(0,0,0,0.45),inset_0_1px_1px_rgba(255,255,255,0.18)] w-[calc(100%-1rem)] max-w-[460px] transition-all duration-300 bg-white/75 dark:bg-[#121216]/65 backdrop-blur-3xl backdrop-saturate-[190%]"
        >
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
                  if (key === "agenda") {
                    window.dispatchEvent(new CustomEvent("open-overdue-modal"));
                  }
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
                          ? "h-[58px] px-4 sm:px-4.5 bg-white text-[#09090b] rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.16)] gap-2.5 dark:bg-white/15 dark:border dark:border-white/20 dark:text-white dark:shadow-xs"
                          : "w-[56px] sm:w-[60px] h-[58px] rounded-full flex flex-col items-center justify-center gap-1 text-foreground/60 dark:text-white/60 hover:text-foreground dark:hover:text-white"
                      )}
                    >
                      <div className="relative flex items-center justify-center shrink-0">
                        <Icon
                          active={active}
                          className={cn(
                            "shrink-0 block",
                            active
                              ? "w-[22px] h-[22px] text-[#09090b] dark:text-white"
                              : "w-[22px] h-[22px] text-foreground/75 dark:text-white/75"
                          )}
                          aria-hidden="true"
                        />
                        {hasBadge && (
                          <span
                            className={cn(
                              "absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center leading-none shadow-sm bg-red-500 text-white",
                              active ? "ring-2 ring-white dark:ring-white/20" : "ring-2 ring-white/80 dark:ring-[#141416]"
                            )}
                            aria-label={`${count} pendências`}
                          >
                            {count > 99 ? "99+" : count}
                          </span>
                        )}
                      </div>
                      {active ? (
                        <span className="text-[13px] font-semibold text-[#09090b] dark:text-white tracking-tight leading-none whitespace-nowrap">
                          {label}
                        </span>
                      ) : (
                        <span className="text-[10px] sm:text-[10.5px] font-medium tracking-tight text-foreground/60 dark:text-white/60 leading-none whitespace-nowrap">
                          {label}
                        </span>
                      )}
                    </div>
                  );
                }}
              </NavLink>
            );
          })}
        </nav>
      </div>
  );
}
