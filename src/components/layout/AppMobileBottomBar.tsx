import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { User } from "lucide-react";
import { HomeNavIcon, AgendaNavIcon, DisparoNavIcon } from "./AppNavIcons";
import { useMonthAppointmentsCount } from "@/hooks/useMonthAppointmentsCount";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { STALE_TIMES } from "@/lib/queryConstants";
import { fetchAgendaDia } from "@/lib/fetchers/agendaFetchers";
import { fetchBarberDashboard } from "@/hooks/useBarberDashboard";
import { fetchBarberClientes } from "@/hooks/useBarberClientes";

interface AppMobileNavProps {
  basePath: string;
}

const items = [
  { key: "inicio", label: "Início", path: "", end: true, Icon: HomeNavIcon },
  { key: "agenda", label: "Agenda", path: "/agenda", Icon: AgendaNavIcon, badge: true },
  { key: "disparo", label: "Disparo", path: "/disparo", Icon: DisparoNavIcon },
  { key: "perfil", label: "Perfil", path: "/perfil", Icon: User },
];

/**
 * Barra de navegação inferior — estilo referência (iFood/Shopee).
 * Contornos pretos no inativo, ativo em accent-red preenchido.
 * Badge redondo em cima do ícone da Agenda com total de agendamentos do mês.
 */
export function AppMobileBottomBar({ basePath }: AppMobileNavProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [barbeiroId, setBarbeiroId] = useState<string | null>(() => localStorage.getItem("barbeiroId"));

  useEffect(() => {
    setBarbeiroId(localStorage.getItem("barbeiroId"));
  }, []);

  const { data: monthCount = 0 } = useMonthAppointmentsCount(barbeiroId);

  /** Pré-carrega dados de cada aba ao tocar/hover — quando o clique navega, já está em cache */
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
    } else if (key === "disparo") {
      void queryClient.prefetchQuery({
        queryKey: QUERY_KEYS.barbeiro.clientes(barbeiroId),
        queryFn: () => fetchBarberClientes(barbeiroId),
        staleTime: STALE_TIMES.CLIENTES,
      });
    }
  };


  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[60] bg-background/95 backdrop-blur-md border-t border-border/30 overflow-visible"
      style={{
        bottom: "var(--app-bottom-nav-offset, 0px)",
        paddingBottom: "var(--app-safe-bottom, env(safe-area-inset-bottom, 0px))",
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-background"
        style={{ height: "var(--app-bottom-nav-bleed, 0px)" }}
      />
      <div className="flex h-16 items-stretch justify-around px-1">
        {items.map(({ key, label, path, end, Icon, badge }) => {
          const to = `${basePath}${path}`;
          const showBadge = badge;
          return (
            <NavLink
              key={key}
              to={to}
              end={end}
              onPointerEnter={() => prefetchTab(key)}
              onPointerDown={(e) => {
                if (e.pointerType === "mouse" && e.button !== 0) return;
                prefetchTab(key);
                if (location.pathname !== to) navigate(to);
              }}
              onClick={(e) => e.preventDefault()}
              className={({ isActive }) =>
                cn(
                  "flex flex-1 flex-col items-center justify-start gap-2 pt-2 pb-2 px-1 transition-colors duration-200 touch-manipulation select-none active:scale-[0.94]",
                  isActive ? "text-primary" : "text-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div className="relative">
                    <Icon
                      className="h-[26px] w-[26px]"
                      strokeWidth={isActive ? 2.2 : 1.8}
                      aria-hidden="true"
                    />
                    {showBadge && monthCount > 0 && (
                      <span
                        className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center leading-none ring-2 ring-background"
                        aria-label={`${monthCount} agendamentos no mês`}
                      >
                        {monthCount > 99 ? "99+" : monthCount}
                      </span>
                    )}

                  </div>
                  <span
                    className={cn(
                      "text-[10px] leading-none tracking-wide",
                      isActive ? "font-medium" : "font-normal"
                    )}
                  >
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
