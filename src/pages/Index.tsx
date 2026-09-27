import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import lumaBarberOrbit from "@/assets/luma-barber-orbit.png";
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

      {/* Container Raiz: Fundo pastel idêntico ao modelo Luma (celeste no topo-esquerdo, pêssego/rosa no topo-direito) */}
      <div
        className="fixed inset-0 w-full h-[100dvh] text-zinc-900 overflow-hidden flex flex-col justify-between select-none"
        style={{
          background:
            "radial-gradient(ellipse 75% 45% at 10% 8%, rgba(210, 233, 255, 0.75) 0%, transparent 65%), radial-gradient(ellipse 75% 45% at 90% 8%, rgba(255, 222, 222, 0.75) 0%, transparent 65%), #ffffff",
        }}
      >
        {/* ═══ 1. Centro/Superior: Sistema Orbital de Órbitas Concéntricas com Ícones 3D e Memojis ═══ */}
        <div
          className="relative flex-1 w-full max-w-[430px] mx-auto flex items-center justify-center px-2 min-h-0"
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: showSplash ? 0 : 1, scale: showSplash ? 0.96 : 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="relative w-full max-w-[360px] sm:max-w-[390px] aspect-square flex items-center justify-center"
          >
            <img
              src={lumaBarberOrbit}
              alt="Ecossistema Barbearia DUB"
              className="w-full h-full object-contain select-none pointer-events-none"
              draggable={false}
            />
          </motion.div>
        </div>

        {/* ═══ 2. Inferior: Logo dub✦, Título Sólido e Botões (100% no padrão Luma) ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: showSplash ? 0 : 1, y: showSplash ? 14 : 0 }}
          transition={{ duration: 0.45, delay: 0.15 }}
          className="relative z-10 w-full max-w-[430px] mx-auto px-6 sm:px-8 pb-3 pt-1 shrink-0 flex flex-col items-center text-center"
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

          {/* Título de 2 linhas em texto sólido (sem cores coloridas nas letras como pedido) */}
          <h1
            className="text-[30px] sm:text-[34px] font-extrabold text-zinc-950 tracking-[-0.035em] leading-[1.12] mb-6 max-w-[340px]"
            style={{ fontFamily: "'Plus Jakarta Sans', Inter, -apple-system, sans-serif" }}
          >
            Cortes Incríveis<br />Começam Aqui
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

