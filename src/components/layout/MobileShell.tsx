import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useStatusBarColor } from "@/hooks/useStatusBarColor";
import { InstallPwaPrompt } from "@/components/pwa/InstallPwaPrompt";

/**
 * MobileShell
 * Container mobile-first centralizado. Sincroniza status bar (theme-color)
 * com o tema ativo (light/dark), bloqueia scroll horizontal acidental e
 * reserva espaço para a bottom nav.
 */
export default function MobileShell() {
  const [isDark, setIsDark] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark"),
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  // Rotas de perfil controlam sua própria status bar (banner immersivo)
  const location = useLocation();
  const isImmersiveRoute = /\/perfil(\/|$)/.test(location.pathname);

  // Cores derivadas do próprio fundo do app. Em perfil, a status bar fica escura
  // para fundir com o banner enquanto o conteúdo continua usando bg-background.
  useStatusBarColor(
    isImmersiveRoute ? "#0D0D0D" : isDark ? "#0D0D0D" : "#FFFFFF",
  );

  return (
    <div
      className="mx-auto w-full max-w-lg antialiased overflow-x-hidden bg-background text-foreground"
      style={{
        minHeight: "var(--app-height, 100svh)",
        // Reserva a área da status bar (notch/dynamic island no iPhone)
        // exceto em rotas imersivas, que gerenciam o topo por conta própria.
        paddingTop: isImmersiveRoute ? 0 : "var(--app-safe-top, env(safe-area-inset-top, 0px))",
        paddingBottom: "calc(6rem + var(--app-safe-bottom, env(safe-area-inset-bottom, 0px)))",
      }}
    >
      <Outlet />
      <InstallPwaPrompt />
    </div>
  );
}
