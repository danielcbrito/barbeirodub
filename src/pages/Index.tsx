import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import barberWelcomeHero from "@/assets/barber-welcome-hero.png";
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

      {/* Container Raiz: Fundo branco puro 100dvh, modelo idêntico à referência */}
      <div className="fixed inset-0 w-full h-[100dvh] bg-white text-zinc-900 overflow-hidden flex flex-col justify-between select-none">
        
        {/* ═══ 1. Topo: Título e subtexto 100% minimalistas (Sem badge) ═══ */}
        <div
          className="relative z-10 w-full max-w-[430px] mx-auto px-6 text-center shrink-0"
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 28px)",
          }}
        >
          <h1
            className="text-[28px] sm:text-[32px] font-bold text-zinc-950 tracking-[-0.025em] leading-[1.18] mx-auto max-w-[340px]"
            style={{ fontFamily: "'Plus Jakarta Sans', Inter, -apple-system, sans-serif" }}
          >
            Leve sua barbearia<br />ao próximo nível
          </h1>
          <p className="mt-2.5 text-[14px] text-zinc-500 font-normal leading-relaxed max-w-[295px] mx-auto">
            Agendamentos, clientes e gestão completa na palma da sua mão.
          </p>
        </div>

        {/* ═══ 2. Centro: Imagem estática e minimalista 100% idêntica ao modelo ═══ */}
        <div className="relative flex-1 w-full max-w-[430px] mx-auto flex items-center justify-center px-4 my-auto min-h-0">
          <div className="relative w-full max-w-[320px] sm:max-w-[360px] max-h-[50vh] flex items-center justify-center">
            <img
              src={barberWelcomeHero}
              alt="Barbearia DUB"
              className="w-full h-full max-h-[48vh] object-contain select-none pointer-events-none"
              draggable={false}
            />
          </div>
        </div>

        {/* ═══ 3. Rodapé: Botões Criar conta e Entrar no app ═══ */}
        <div
          className="relative z-10 w-full max-w-[430px] mx-auto px-6 sm:px-8 pb-3 pt-2 shrink-0 flex flex-col items-center"
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
          }}
        >
          {/* Botão Principal: Preto, arredondado pill */}
          <button
            onClick={() => navigate("/login?mode=signup")}
            className="w-full max-w-[340px] h-[54px] sm:h-[56px] rounded-full bg-[#18181b] hover:bg-black text-white font-semibold text-[15.5px] sm:text-[16px] tracking-normal flex items-center justify-center shadow-[0_8px_24px_rgba(0,0,0,0.12)] active:scale-[0.98] transition-all cursor-pointer"
          >
            Criar conta
          </button>

          {/* Botão Secundário: Tipografia limpa e elegante */}
          <button
            onClick={() => navigate("/login")}
            className="w-full max-w-[340px] h-[46px] rounded-full text-zinc-900 hover:text-black font-semibold text-[14.5px] sm:text-[15px] tracking-normal flex items-center justify-center mt-2 active:scale-[0.98] transition-all cursor-pointer"
          >
            Entrar no app
          </button>

          {/* Indicador Home Bar do dispositivo móvel */}
          <div className="w-28 h-1 bg-zinc-300/80 rounded-full mx-auto mt-3.5" aria-hidden="true" />
        </div>
      </div>

      <AuthBottomSheet isOpen={showAuth} onClose={() => setShowAuth(false)} />
    </>
  );
};

export default Index;

