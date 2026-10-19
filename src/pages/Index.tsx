import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { SplashScreen } from "@/components/SplashScreen";
import AuthBottomSheet from "@/components/AuthBottomSheet";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { ROLE_REDIRECTS } from "@/lib/roles";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { LoadingScreen } from "@/components/shared/LoadingScreen";
import { resolveOldestOwnedTenant } from "@/lib/tenantOwnership";
import { applyStatusBarColor } from "@/hooks/useStatusBarColor";

/**
 * Tela de Boas-Vindas (Index)
 * Minimalista, estratégica e sem sobrecarga de informação:
 * - Fundo com gradiente suave e clarinho (SEMPRE versão branca)
 * - Logo oficial "d" estilizado da marca + "ub"
 * - Ilustração dos barbeiros de canto a canto (full bleed)
 * - Botão "Criar conta" branco com sombra suave e texto escuro nítido
 * - Preserva a preferência de tema escuro do usuário ao ir para login/dashboard
 */
const Index = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, globalRole, isBarber, userId } = usePermissions();
  const [showSplash, setShowSplash] = useState(() => !sessionStorage.getItem("dub_welcome_visited"));
  const [showAuth, setShowAuth] = useState(false);

  /* ═══ Garantia absoluta de versão branca na tela de boas-vindas ═══ */
  useEffect(() => {
    if (typeof document === "undefined") return;

    // Força tema claro na tela inicial independente do tema salvo
    document.documentElement.classList.remove("dark");
    document.documentElement.classList.add("light");
    document.documentElement.style.colorScheme = "light";
    applyStatusBarColor("#FAF5F2");

    return () => {
      // Ao sair da tela de boas-vindas (ex: ir para /login ou dashboard), restaura a preferência salva
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
    };
  }, []);

  /* ═══ Listener global de auth ═══ */
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        void supabase.auth.getUser().then(({ data: { user } }) => {
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.shared.permissoes(user?.id) });
        });
      }
      if (event === "SIGNED_OUT") {
        queryClient.clear();
      }
    });
    return () => subscription.unsubscribe();
  }, [queryClient]);

  /* ═══ Splash timer ═══ */
  useEffect(() => {
    if (!showSplash) return;
    const timer = setTimeout(() => {
      setShowSplash(false);
      sessionStorage.setItem("dub_welcome_visited", "true");
    }, 1100);
    return () => clearTimeout(timer);
  }, [showSplash]);

  /* ═══ Auto-redirect se autenticado ═══ */
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) return;

    const doRedirect = async () => {
      if (globalRole && ROLE_REDIRECTS[globalRole]) {
        if (globalRole === "tenant_admin" && userId) {
          const { data: tenant } = await resolveOldestOwnedTenant<{
            onboarding_completed: boolean | null;
          }>(userId, "onboarding_completed");

          if (tenant?.onboarding_completed) {
            navigate("/minha-barbearia", { replace: true });
          } else {
            navigate("/onboarding", { replace: true });
          }
          return;
        }
        navigate(ROLE_REDIRECTS[globalRole], { replace: true });
        return;
      }

      if (isBarber) {
        navigate("/barbeiro", { replace: true });
        return;
      }

      navigate("/cliente", { replace: true });
    };

    doRedirect();
  }, [isLoading, isAuthenticated, globalRole, isBarber, userId, navigate]);

  if (isAuthenticated && !isLoading) {
    return <LoadingScreen message="Redirecionando..." />;
  }

  return (
    <>
      <SplashScreen visible={showSplash} />

      <div
        data-theme="light"
        className="index-welcome-page light fixed inset-0 w-full h-[100dvh] text-zinc-900 overflow-hidden flex flex-col justify-between items-center select-none"
        style={{
          background:
            "linear-gradient(175deg, #EAF1F7 0%, #FAF5F2 32%, #F6F2F7 65%, #EFF3F8 100%)",
          color: "#18181b",
          colorScheme: "light",
        }}
      >
        {/* Luzes difusas sutis para profundidade do gradiente claro */}
        <div className="absolute -top-20 -left-16 w-96 h-96 bg-[#DEEAF5]/50 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -top-20 -right-16 w-96 h-96 bg-[#FDF1E8]/40 rounded-full blur-3xl pointer-events-none" />

        {/* ─── 1. Header: Apenas a Logo dub (D oficial estilizado + ub) ─── */}
        <header
          className="relative z-20 w-full max-w-[430px] px-6 sm:px-8 flex items-center justify-center shrink-0"
          style={{
            paddingTop: "max(calc(var(--app-safe-top, env(safe-area-inset-top, 0px)) + 18px), 24px)",
          }}
        >
          <div className="flex items-center gap-1 select-none">
            <img
              src="/auth-assets/dub_logo_d.png"
              alt="D"
              className="h-[27px] sm:h-[29px] w-auto object-contain block drop-shadow-sm"
              draggable={false}
            />
            <span
              className="welcome-logo-text text-[28px] sm:text-[30px] font-bold text-zinc-800 tracking-[-0.04em] lowercase"
              style={{ fontFamily: "'Plus Jakarta Sans', Inter, -apple-system, sans-serif", color: "#27272a" }}
            >
              ub
            </span>
          </div>
        </header>

        {/* ─── 2. Hero: Ilustração dos Barbeiros de Canto a Canto (Tela Toda) ─── */}
        <div className="relative z-10 w-full flex-1 min-h-0 flex items-center justify-center overflow-hidden">
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: showSplash ? 0 : 1, scale: showSplash ? 0.97 : 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="w-full max-w-[500px] flex items-center justify-center"
          >
            <img
              src="/auth-assets/barber_crew_edge.png"
              alt="Barbeiros Dub"
              className="w-full h-auto max-h-[46dvh] object-contain px-2 sm:px-4 select-none pointer-events-none"
              draggable={false}
              loading="eager"
            />
          </motion.div>
        </div>

        {/* ─── 3. Seção Inferior: Título Curto + Botão Branco + Link Entrar ─── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: showSplash ? 0 : 1, y: showSplash ? 12 : 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="relative z-20 w-full max-w-[380px] px-6 sm:px-8 flex flex-col items-center text-center shrink-0 mb-6 sm:mb-8"
          style={{
            paddingBottom: "max(calc(var(--app-safe-bottom, env(safe-area-inset-bottom, 0px)) + 12px), 24px)",
          }}
        >
          {/* Título direto, sem poluição de texto */}
          <h1
            className="welcome-title text-[30px] sm:text-[34px] font-extrabold tracking-[-0.035em] text-zinc-900 leading-[1.12] mb-6 max-w-[340px]"
            style={{ fontFamily: "'Plus Jakarta Sans', Inter, -apple-system, sans-serif", color: "#18181b", textShadow: "none" }}
          >
            Eleve sua barbearia<br />ao próximo nível
          </h1>

          {/* Botão Branco: Criar Conta */}
          <button
            onClick={() => navigate("/login?mode=signup")}
            className="w-full max-w-[340px] h-[54px] sm:h-[56px] rounded-full bg-white hover:bg-zinc-50 text-zinc-950 font-semibold text-[16px] sm:text-[16.5px] tracking-tight flex items-center justify-center shadow-[0_10px_28px_rgba(0,0,0,0.08)] border border-white/80 active:scale-[0.985] transition-all cursor-pointer"
            style={{ color: "#09090b" }}
          >
            Criar conta
          </button>

          {/* Link Secundário: Já tem uma barbearia? Entrar */}
          <p
            className="welcome-sub-text text-[13.5px] sm:text-[14px] text-zinc-500 font-normal mt-3.5"
            style={{ color: "#71717a" }}
          >
            Já tem uma barbearia?{" "}
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="welcome-link text-zinc-900 font-semibold underline underline-offset-4 hover:text-black transition-colors cursor-pointer inline-flex"
              style={{ color: "#18181b" }}
            >
              Entrar
            </button>
          </p>
        </motion.div>
      </div>

      <AuthBottomSheet isOpen={showAuth} onClose={() => setShowAuth(false)} />
    </>
  );
};

export default Index;
