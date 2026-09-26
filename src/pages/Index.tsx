import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import barberWelcomeHero from "@/assets/barber-welcome-hero.jpg";
import { SplashScreen } from "@/components/SplashScreen";
import AuthBottomSheet from "@/components/AuthBottomSheet";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { ROLE_REDIRECTS } from "@/lib/roles";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { LoadingScreen } from "@/components/shared/LoadingScreen";
import { resolveOldestOwnedTenant } from "@/lib/tenantOwnership";

const Index = () => {
  const [showAuth, setShowAuth] = useState(false);
  const [showSplash, setShowSplash] = useState(() => {
    // Exibe splash apenas na primeira visita da sessão
    return !sessionStorage.getItem("dub_welcome_visited");
  });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { globalRole, isBarber, isLoading, isAuthenticated, userId } = usePermissions();

  /* ═══ Listener global de auth — invalida cache ao logar/deslogar ═══ */
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

  /* ═══ Splash timer (curto e suave) ═══ */
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

      // Cliente autenticado sem role especial → tela do cliente
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

      {/* Container Raiz: Imagem pega a tela toda (Full-bleed 100dvh em branco puro) */}
      <div className="fixed inset-0 w-full h-[100dvh] bg-white text-zinc-900 overflow-hidden flex flex-col justify-between select-none">
        
        {/* ═══ 1. Imagem de Fundo Estilo Notion (Pega a tela toda com traço autêntico e avental marrom) ═══ */}
        <motion.div
          initial={{ opacity: 0, scale: 1.03 }}
          animate={{ opacity: showSplash ? 0 : 1, scale: showSplash ? 1.03 : 1 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="absolute inset-0 w-full h-full pointer-events-none"
        >
          <img
            src={barberWelcomeHero}
            alt="Barbeiro DUB Estilo Notion"
            className="w-full h-full object-cover object-[center_35%] sm:object-contain sm:object-center select-none pointer-events-none"
            draggable={false}
          />
        </motion.div>

        {/* Gradiente superior sutil para máxima legibilidade do título */}
        <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-white via-white/80 to-transparent pointer-events-none z-[5]" />

        {/* ═══ 2. Título Superior (Apenas o título, sem descrição, limpo e direto) ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: showSplash ? 0 : 1, y: showSplash ? 12 : 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="relative z-10 w-full max-w-[430px] mx-auto px-6 text-center shrink-0"
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 32px)",
          }}
        >
          <h1
            className="text-[28px] sm:text-[32px] font-bold text-zinc-950 tracking-[-0.02em] leading-[1.16] mx-auto max-w-[340px]"
            style={{ fontFamily: "'Plus Jakarta Sans', Inter, -apple-system, sans-serif" }}
          >
            Leve sua barbearia<br />ao próximo nível
          </h1>
        </motion.div>

        {/* ═══ 3. Área Inferior com Desfoque onde transparece o tom da imagem de fundo ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: showSplash ? 0 : 1, y: showSplash ? 16 : 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="relative z-20 w-full flex flex-col items-center mt-auto"
        >
          {/* Camada de desfoque / blur com translucidez para que o marrom/ambiente de fundo transpareça */}
          <div
            className="absolute inset-x-0 bottom-0 h-[230px] bg-gradient-to-t from-white/92 via-white/65 to-transparent backdrop-blur-[20px] pointer-events-none"
            aria-hidden="true"
          />

          <div
            className="relative z-10 w-full max-w-[430px] px-6 sm:px-8 pb-3 pt-6 flex flex-col items-center"
            style={{
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
            }}
          >
            {/* Botão Principal: Preto, arredondado pill, fonte fina e minimalista */}
            <button
              onClick={() => navigate("/login?mode=signup")}
              className="w-full max-w-[340px] h-[54px] sm:h-[56px] rounded-full bg-[#18181b] hover:bg-black text-white font-medium text-[15px] sm:text-[15.5px] tracking-normal flex items-center justify-center shadow-[0_8px_24px_rgba(0,0,0,0.18)] active:scale-[0.98] transition-all cursor-pointer"
            >
              Criar conta
            </button>

            {/* Botão Secundário: Tipografia fina, clean e elegante */}
            <button
              onClick={() => navigate("/login")}
              className="w-full max-w-[340px] h-[44px] rounded-full text-zinc-900 hover:text-black font-medium text-[14.5px] sm:text-[15px] tracking-normal flex items-center justify-center mt-2.5 active:scale-[0.98] transition-all cursor-pointer"
            >
              Entrar no app
            </button>

            {/* Indicador Home Bar do dispositivo móvel */}
            <div className="w-28 h-1 bg-zinc-400/50 rounded-full mx-auto mt-3.5" aria-hidden="true" />
          </div>
        </motion.div>
      </div>

      <AuthBottomSheet isOpen={showAuth} onClose={() => setShowAuth(false)} />
    </>
  );
};

export default Index;

