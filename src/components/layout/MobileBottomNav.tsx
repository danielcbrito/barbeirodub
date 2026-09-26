import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ShoppingCart, User } from "lucide-react";
import { HomeNavIcon } from "./AppNavIcons";

/**
 * MobileBottomNav
 * Barra inferior fixa, respeita safe-area-inset-bottom e segue a
 * largura do MobileShell (max-w-lg). Ícones autorais outline de 26px.
 */
export default function MobileBottomNav() {
  const tabs = [
    { to: "/cliente", label: "Início", icon: HomeNavIcon },
    { to: "/cliente/agendar", label: "Agendar", icon: ShoppingCart },
    { to: "/cliente/perfil", label: "Perfil", icon: User },
  ];


  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[60] mx-auto max-w-lg bg-background/95 backdrop-blur-md border-t border-border/30 overflow-visible"
      style={{
        bottom: "var(--app-bottom-nav-offset, 0px)",
        paddingBottom: "var(--app-safe-bottom, env(safe-area-inset-bottom, 0px))",
      }}
      aria-label="Navegação principal"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-background"
        style={{ height: "var(--app-bottom-nav-bleed, 0px)" }}
      />
      <ul className="flex h-16 items-stretch justify-around px-1">
        {tabs.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center justify-start gap-2 pt-2 pb-2 px-1 transition-all duration-200 active:scale-[0.94]",
                  isActive
                    ? "text-primary"
                    : "text-foreground"
                )
              }
              style={{ touchAction: "manipulation" }}
            >
              {({ isActive }) => (
                <>
                  <Icon className="w-[26px] h-[26px]" strokeWidth={isActive ? 2.2 : 1.8} />
                  <span className={cn("text-[10px] leading-none tracking-wide", isActive ? "font-medium" : "font-normal")}>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
