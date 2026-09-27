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
   Tela Inicial (Index) — 100% Idêntica à Referência Luma com Assets 3D Reais
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

      {/* Container Raiz: Fundo branco contínuo com a paleta pastel suave no topo */}
      <div className="fixed inset-0 w-full h-[100dvh] bg-white text-zinc-900 overflow-hidden flex flex-col justify-between select-none">
        
        {/* ═══ 1. Hero Superior: Sistema Orbital 3D idêntico de ponta a ponta ═══ */}
        <div
          className="relative flex-1 w-full max-w-[480px] mx-auto flex items-start justify-center overflow-hidden min-h-0"
          style={{
            paddingTop: "env(safe-area-inset-top, 0px)",
          }}
        >
          {/* Canvas responsivo do Ecossistema Orbital 3D */}
          <div className="relative w-full h-full max-w-[451px] aspect-[451/645] flex items-center justify-center">
            {/* Imagem do Ecossistema Orbital com acabamento perfeito sem status bar */}
            <img
              src="/luma-assets/luma-hero-orbit.png"
              alt="Ecossistema DUB"
              className="w-full h-full object-contain object-top pointer-events-none select-none"
              draggable={false}
            />

            {/* ─── Camadas Interativas com Animação Física / Spring em cada Memoji ─── */}

            {/* Memoji 1: Garoto de Touca Laranja (Piscando com língua) */}
            <motion.div
              whileHover={{ scale: 1.25, rotate: 6 }}
              whileTap={{ scale: 0.9 }}
              animate={{ y: [0, -3, 0] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
              className="absolute cursor-pointer select-none"
              style={{
                left: "24.0%",
                top: "30.1%",
                width: "12.0%",
                height: "auto",
                transform: "translate(-50%, -50%)",
              }}
              title="Comunidade DUB"
            >
              <img
                src="/luma-assets/memoji_orange.png"
                alt="Avatar"
                className="w-full h-auto drop-shadow-md select-none pointer-events-none"
              />
            </motion.div>

            {/* Memoji 2: Sênior com Óculos e Cabelo Branco (Círculo Verde) */}
            <motion.div
              whileHover={{ scale: 1.25, rotate: -6 }}
              whileTap={{ scale: 0.9 }}
              animate={{ y: [0, 3, 0] }}
              transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
              className="absolute cursor-pointer select-none"
              style={{
                left: "61.6%",
                top: "47.1%",
                width: "13.8%",
                height: "auto",
                transform: "translate(-50%, -50%)",
              }}
              title="Barbeiros Experientes"
            >
              <img
                src="/luma-assets/memoji_green.png"
                alt="Avatar"
                className="w-full h-auto drop-shadow-md select-none pointer-events-none"
              />
            </motion.div>

            {/* Memoji 3: Mulher com Óculos (Círculo Amarelo) */}
            <motion.div
              whileHover={{ scale: 1.25, rotate: 8 }}
              whileTap={{ scale: 0.9 }}
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 4.0, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
              className="absolute cursor-pointer select-none"
              style={{
                left: "92.9%",
                top: "40.0%",
                width: "13.8%",
                height: "auto",
                transform: "translate(-50%, -50%)",
              }}
              title="Clientes DUB"
            >
              <img
                src="/luma-assets/memoji_yellow.png"
                alt="Avatar"
                className="w-full h-auto drop-shadow-md select-none pointer-events-none"
              />
            </motion.div>

            {/* Memoji 4: Loira com Óculos Piscando (Círculo Azul) */}
            <motion.div
              whileHover={{ scale: 1.25, rotate: -8 }}
              whileTap={{ scale: 0.9 }}
              animate={{ y: [0, 4, 0] }}
              transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
              className="absolute cursor-pointer select-none"
              style={{
                left: "18.6%",
                top: "71.8%",
                width: "15.0%",
                height: "auto",
                transform: "translate(-50%, -50%)",
              }}
              title="Clientes Fidelidade"
            >
              <img
                src="/luma-assets/memoji_blue.png"
                alt="Avatar"
                className="w-full h-auto drop-shadow-md select-none pointer-events-none"
              />
            </motion.div>

            {/* Memoji 5: Tranças Rosas Estilosas (Círculo Magenta) */}
            <motion.div
              whileHover={{ scale: 1.25, rotate: 6 }}
              whileTap={{ scale: 0.9 }}
              animate={{ y: [0, -3, 0] }}
              transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
              className="absolute cursor-pointer select-none"
              style={{
                left: "69.2%",
                top: "85.0%",
                width: "16.4%",
                height: "auto",
                transform: "translate(-50%, -50%)",
              }}
              title="Estilo Único"
            >
              <img
                src="/luma-assets/memoji_magenta.png"
                alt="Avatar"
                className="w-full h-auto drop-shadow-md select-none pointer-events-none"
              />
            </motion.div>

            {/* ─── Hotspots Interativos nos Objetos 3D com Efeito Spring ─── */}

            {/* 3D Pin Localização */}
            <motion.div
              whileHover={{ scale: 1.15, rotate: 6 }}
              whileTap={{ scale: 0.92 }}
              className="absolute cursor-pointer rounded-full"
              style={{
                left: "62.1%",
                top: "27.9%",
                width: "16%",
                height: "18%",
                transform: "translate(-50%, -50%)",
              }}
              title="Localização & Unidades"
            />

            {/* 3D Calendário 21 */}
            <motion.div
              whileHover={{ scale: 1.15, rotate: -6 }}
              whileTap={{ scale: 0.92 }}
              className="absolute cursor-pointer rounded-xl"
              style={{
                left: "31.0%",
                top: "51.2%",
                width: "18%",
                height: "18%",
                transform: "translate(-50%, -50%)",
              }}
              title="Agendamento Inteligente"
            />

            {/* 3D Globo */}
            <motion.div
              whileHover={{ scale: 1.15, rotate: 8 }}
              whileTap={{ scale: 0.92 }}
              className="absolute cursor-pointer rounded-full"
              style={{
                left: "37.7%",
                top: "85.3%",
                width: "18%",
                height: "18%",
                transform: "translate(-50%, -50%)",
              }}
              title="Alcance & Expansão"
            />

            {/* 3D Chapéu de Festa / Celebração */}
            <motion.div
              whileHover={{ scale: 1.15, rotate: -8 }}
              whileTap={{ scale: 0.92 }}
              className="absolute cursor-pointer rounded-xl"
              style={{
                left: "77.6%",
                top: "65.1%",
                width: "18%",
                height: "18%",
                transform: "translate(-50%, -50%)",
              }}
              title="Eventos & Celebrações"
            />

            {/* 3D Tickets */}
            <motion.div
              whileHover={{ scale: 1.15, rotate: -6 }}
              whileTap={{ scale: 0.92 }}
              className="absolute cursor-pointer rounded-lg"
              style={{
                left: "5.5%",
                top: "48.0%",
                width: "12%",
                height: "16%",
                transform: "translate(-50%, -50%)",
              }}
              title="Vouchers & Benefícios"
            />

            {/* Estrela Central: Pulso de Luz Suave */}
            <motion.div
              animate={{ scale: [1, 1.08, 1], opacity: [0.75, 1, 0.75] }}
              transition={{ duration: 4.0, repeat: Infinity, ease: "easeInOut" }}
              className="absolute pointer-events-none rounded-full"
              style={{
                left: "49.9%",
                top: "66.7%",
                width: "22%",
                height: "22%",
                transform: "translate(-50%, -50%)",
                background: "radial-gradient(circle, rgba(251, 146, 60, 0.28) 0%, rgba(244, 63, 94, 0.15) 50%, transparent 75%)",
              }}
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

          {/* Título de 2 linhas em texto sólido conforme o áudio */}
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
