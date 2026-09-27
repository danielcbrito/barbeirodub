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

/* ═══════════════════════════════════════════════════════════════════════════
   Tela Inicial (Index) — 100% Idêntica à Referência Luma
   - Mesmas posições, mesma organização, mesmo zoom cobrindo a tela toda
   - Mesma estrela radiante central, mesmas cores pastéis, moderno e minimalista
   - Sem duplicações ou artefatos
   ═══════════════════════════════════════════════════════════════════════════ */
const Index = () => {
  const [showAuth, setShowAuth] = useState(false);
  const [showSplash, setShowSplash] = useState(() => {
    return !sessionStorage.getItem("dub_welcome_visited");
  });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { globalRole, isBarber, isLoading, isAuthenticated, userId } = usePermissions();

  /* ═══ Listener global de auth ═══ */
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
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

      {/* Container Raiz: Fundo branco contínuo idêntico ao modelo Luma */}
      <div className="fixed inset-0 w-full h-[100dvh] bg-white text-zinc-900 overflow-hidden flex flex-col justify-between select-none">
        
        {/* ═══ 1. Hero Superior: O ecossistema orbital Luma 100% idêntico, com o zoom pegando a tela toda ═══ */}
        <div
          className="relative w-full flex-1 min-h-0 flex items-start justify-center overflow-hidden"
          style={{
            paddingTop: "env(safe-area-inset-top, 0px)",
          }}
        >
          <div className="relative w-full max-w-[451px] h-full flex items-start justify-center">
            <img
              src="/luma-assets/luma-hero-orbit.png"
              alt="Ecossistema DUB"
              className="w-full h-full object-cover object-top sm:object-contain pointer-events-none select-none"
              draggable={false}
            />
          </div>
        </div>

        {/* ═══ 2. Seção Inferior: Logo dub✦, Título Sólido e Botões ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: showSplash ? 0 : 1, y: showSplash ? 14 : 0 }}
          transition={{ duration: 0.45, delay: 0.15 }}
          className="relative z-10 w-full max-w-[430px] mx-auto px-6 sm:px-8 pb-3 pt-0 shrink-0 flex flex-col items-center text-center bg-white"
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
          }}
        >
          {/* Logo do app: dub✦ (estilo luma✦) */}
          <div className="flex items-center justify-center gap-0.5 mb-2">
            <span
              className="text-[21px] sm:text-[22px] font-bold text-zinc-500/90 tracking-tight lowercase"
              style={{ fontFamily: "'Plus Jakarta Sans', Inter, -apple-system, sans-serif" }}
            >
              dub
            </span>
            <span className="text-[13px] text-zinc-400 font-semibold mb-1">✦</span>
          </div>

          {/* Título de 2 linhas em texto sólido conforme solicitado */}
          <h1
            className="text-[30px] sm:text-[34px] font-extrabold text-zinc-950 tracking-[-0.035em] leading-[1.12] mb-6 max-w-[340px]"
            style={{ fontFamily: "'Plus Jakarta Sans', Inter, -apple-system, sans-serif" }}
          >
            Eleve sua barbearia<br />ao próximo nível
          </h1>

          {/* Botão Principal: Preto, arredondado pill ("Get Started" da Luma) */}
          <button
            onClick={() => navigate("/login?mode=signup")}
            className="w-full max-w-[340px] h-[54px] sm:h-[56px] rounded-full bg-[#141416] hover:bg-black text-white font-semibold text-[15.5px] sm:text-[16px] tracking-normal flex items-center justify-center shadow-[0_10px_25px_rgba(0,0,0,0.14)] active:scale-[0.98] transition-all cursor-pointer"
          >
            Criar conta
          </button>

          {/* Botão Secundário: Tipografia limpa e elegante */}
          <button
            onClick={() => navigate("/login")}
            className="w-full max-w-[340px] h-[44px] rounded-full text-zinc-900 hover:text-black font-semibold text-[14.5px] sm:text-[15px] tracking-normal flex items-center justify-center mt-2 active:scale-[0.98] transition-all cursor-pointer"
          >
            Entrar no app
          </button>

          {/* Indicador Home Bar do dispositivo móvel */}
          <div className="w-28 h-1 bg-zinc-300/80 rounded-full mx-auto mt-3.5" aria-hidden="true" />
        </motion.div>
      </div>

      <AuthBottomSheet isOpen={showAuth} onClose={() => setShowAuth(false)} />
    </>
  );
};

export default Index;
