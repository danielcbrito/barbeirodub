import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import barberWelcomeIllustration from "@/assets/barber-welcome-illustration.png";
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

      {/* Container Raiz: Fundo branco puro (#ffffff), sem foto de fundo */}
      <div className="fixed inset-0 w-full h-[100dvh] bg-white text-zinc-900 overflow-hidden flex flex-col justify-between select-none">
        
        {/* ═══ 1. Topo: Título e subtexto estratégicos ═══ */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: showSplash ? 0 : 1, y: showSplash ? -10 : 0 }}
          transition={{ duration: 0.5, delay: 0.12 }}
          className="relative z-10 w-full max-w-[430px] mx-auto px-6 text-center shrink-0 pt-4"
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)",
          }}
        >
          {/* Tag decorativa estratégica */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-100 border border-zinc-200/70 mb-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-semibold text-zinc-700 tracking-wider uppercase">
              DUB Barbearia
            </span>
          </div>

          <h1
            className="text-[27px] sm:text-[32px] font-extrabold text-zinc-950 tracking-[-0.03em] leading-[1.16] mx-auto max-w-[340px]"
            style={{ fontFamily: "'Plus Jakarta Sans', Inter, -apple-system, sans-serif" }}
          >
            Leve sua barbearia<br />ao próximo nível
          </h1>
          <p className="mt-2 text-[13.5px] sm:text-[14px] text-zinc-500 font-normal leading-relaxed max-w-[280px] mx-auto">
            Agendamentos, clientes e gestão completa na palma da sua mão.
          </p>
        </motion.div>

        {/* ═══ 2. Centro: Desenho do Barbeiro & Cliente com elementos interativos ═══ */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: showSplash ? 0 : 1, scale: showSplash ? 0.95 : 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="relative flex-1 w-full max-w-[430px] mx-auto flex items-center justify-center px-6 my-auto min-h-0"
        >
          <div className="relative w-full max-w-[320px] sm:max-w-[350px] max-h-[46vh] aspect-square flex items-center justify-center">
            {/* Ilustração principal do barbeiro atendendo cliente no traço editorial */}
            <motion.img
              src={barberWelcomeIllustration}
              alt="Barbeiro atendendo cliente na barbearia DUB"
              className="w-full h-full object-contain select-none pointer-events-auto"
              draggable={false}
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
            />

            {/* Badge interativa 1 (Topo direito - Barbeiro na régua) */}
            <motion.div
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0, y: [0, -4, 0] }}
              transition={{
                opacity: { delay: 0.45, duration: 0.4 },
                y: { duration: 3.4, repeat: Infinity, ease: "easeInOut", delay: 0.2 },
              }}
              className="absolute -top-1 sm:top-1 right-0 sm:right-1 bg-white/95 backdrop-blur-md border border-zinc-200/90 shadow-[0_8px_20px_rgba(0,0,0,0.07)] rounded-2xl px-3 py-1.5 flex items-center gap-2 select-none hover:scale-105 transition-transform"
            >
              <span className="text-[14px]">✂️</span>
              <div className="text-left">
                <p className="text-[11px] font-bold text-zinc-900 leading-tight">Corte & Barba</p>
                <p className="text-[9.5px] text-zinc-500 font-medium">Na régua máxima</p>
              </div>
            </motion.div>

            {/* Badge interativa 2 (Inferior esquerdo - Satisfação do cliente) */}
            <motion.div
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0, y: [0, 4, 0] }}
              transition={{
                opacity: { delay: 0.55, duration: 0.4 },
                y: { duration: 3.8, repeat: Infinity, ease: "easeInOut", delay: 0.5 },
              }}
              className="absolute bottom-3 sm:bottom-4 left-0 sm:left-1 bg-white/95 backdrop-blur-md border border-zinc-200/90 shadow-[0_8px_20px_rgba(0,0,0,0.07)] rounded-2xl px-3 py-1.5 flex items-center gap-2 select-none hover:scale-105 transition-transform"
            >
              <span className="text-[14px]">⭐</span>
              <div className="text-left">
                <p className="text-[11px] font-bold text-zinc-900 leading-tight">5.0 Estrelas</p>
                <p className="text-[9.5px] text-zinc-500 font-medium">Clientes satisfeitos</p>
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* ═══ 3. Rodapé: Botões Criar conta e Entrar no app ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: showSplash ? 0 : 1, y: showSplash ? 16 : 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="relative z-10 w-full max-w-[430px] mx-auto px-6 sm:px-8 pb-3 pt-2 shrink-0 flex flex-col items-center"
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
          }}
        >
          {/* Botão Principal: Preto, arredondado pill, fonte fina e minimalista */}
          <button
            onClick={() => navigate("/login?mode=signup")}
            className="w-full max-w-[340px] h-[54px] sm:h-[56px] rounded-full bg-[#18181b] hover:bg-black text-white font-semibold text-[15.5px] tracking-normal flex items-center justify-center shadow-[0_8px_24px_rgba(0,0,0,0.14)] active:scale-[0.98] transition-all cursor-pointer"
          >
            Criar conta
          </button>

          {/* Botão Secundário: Tipografia limpa e elegante */}
          <button
            onClick={() => navigate("/login")}
            className="w-full max-w-[340px] h-[46px] rounded-full text-zinc-900 hover:text-black font-semibold text-[14.5px] sm:text-[15px] tracking-normal flex items-center justify-center mt-1.5 active:scale-[0.98] transition-all cursor-pointer"
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

