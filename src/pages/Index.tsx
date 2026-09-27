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
   Estrela Radiante Central com Gradiente Quente Sunset e Halo Suave
   ═══════════════════════════════════════════════════════════════════════════ */
const GlowingCenterStar = () => (
  <motion.div
    animate={{ scale: [1, 1.08, 1], rotate: [0, 2, -2, 0] }}
    transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
    className="relative flex items-center justify-center pointer-events-none select-none z-10"
  >
    {/* Halo difuso sunset com blur orgânico */}
    <div className="absolute w-28 h-28 rounded-full bg-gradient-to-r from-orange-400/30 via-pink-500/25 to-amber-300/30 blur-xl pointer-events-none" />
    <svg width="60" height="60" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="lumaStarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FB923C" />
          <stop offset="45%" stopColor="#F43F5E" />
          <stop offset="100%" stopColor="#EC4899" />
        </linearGradient>
      </defs>
      <path
        d="M28 2 C28 16 16 28 2 28 C16 28 28 40 28 54 C28 40 40 28 54 28 C40 28 28 16 28 2 Z"
        fill="url(#lumaStarGrad)"
      />
      <path
        d="M28 12 C28 20 20 28 12 28 C20 28 28 36 28 44 C28 36 36 28 44 28 C36 28 28 20 28 12 Z"
        fill="white"
        opacity="0.32"
      />
    </svg>
  </motion.div>
);

/* ═══════════════════════════════════════════════════════════════════════════
   Tela Inicial (Index) — Ecossistema Orbital de Barbearia 100% no padrão Luma
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

      {/* Container Raiz: Fundo suave pastel idêntico ao modelo Luma */}
      <div
        className="fixed inset-0 w-full h-[100dvh] text-zinc-900 overflow-hidden flex flex-col justify-between select-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 15% 10%, rgba(215, 235, 255, 0.85) 0%, transparent 70%), radial-gradient(ellipse 70% 50% at 85% 10%, rgba(255, 228, 222, 0.85) 0%, transparent 70%), #ffffff",
        }}
      >
        {/* ═══ 1. Hero Superior: Sistema Orbital com Ícones 3D de Barbearia e Barbeiros ═══ */}
        <div
          className="relative flex-1 w-full max-w-[480px] mx-auto flex items-center justify-center px-2 min-h-0 overflow-visible"
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 6px)",
          }}
        >
          {/* Container Quadrado Relativo para ancorar o SVG das órbitas e os elementos 3D */}
          <div className="relative w-full max-w-[390px] sm:max-w-[420px] aspect-square flex items-center justify-center">
            
            {/* SVG das Órbitas Concéntricas Finas Brancas */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 400 400"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Órbita 1 (interna ao redor da estrela) */}
              <circle cx="200" cy="200" r="54" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="1.5" />
              {/* Órbita 2 (média) */}
              <circle cx="200" cy="200" r="112" stroke="rgba(255, 255, 255, 0.88)" strokeWidth="1.5" />
              {/* Órbita 3 (externa) */}
              <circle cx="200" cy="200" r="168" stroke="rgba(255, 255, 255, 0.85)" strokeWidth="1.5" />
              {/* Órbita 4 elíptica de expansão suave */}
              <ellipse cx="200" cy="200" rx="198" ry="186" stroke="rgba(255, 255, 255, 0.45)" strokeWidth="1.2" strokeDasharray="5 7" />
            </svg>

            {/* Estrela Radiante Central no ponto focal das órbitas */}
            <GlowingCenterStar />

            {/* ─── Elementos 3D de Barbearia e Avatares Apple Memoji Únicos (Sem Duplicações) ─── */}

            {/* 1. Barbeiro 1 3D: Cabelo Fade, Barba, Avental e Tesoura (Círculo Verde) - Órbita Média Superior */}
            <motion.div
              whileHover={{ scale: 1.22, rotate: 6 }}
              whileTap={{ scale: 0.92 }}
              animate={{ y: [0, -3.5, 0] }}
              transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
              className="absolute cursor-pointer select-none z-20"
              style={{
                left: "54%",
                top: "20%",
                transform: "translate(-50%, -50%)",
              }}
              title="Barbeiro Especialista DUB"
            >
              <img
                src="/luma-assets/barber_fade.png"
                alt="Barbeiro com Tesoura"
                className="w-[52px] h-[52px] sm:w-[56px] sm:h-[56px] rounded-full drop-shadow-[0_8px_16px_rgba(34,197,94,0.22)] select-none pointer-events-none"
                draggable={false}
              />
            </motion.div>

            {/* 2. Agenda / Calendário 3D "21" (Mantido conforme o áudio) - Órbita Média Esquerda Alta */}
            <motion.div
              whileHover={{ scale: 1.2, rotate: -8 }}
              whileTap={{ scale: 0.92 }}
              animate={{ y: [0, 3.5, 0] }}
              transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
              className="absolute cursor-pointer select-none z-20"
              style={{
                left: "26%",
                top: "33%",
                transform: "translate(-50%, -50%) rotate(-12deg)",
              }}
              title="Agendamento Inteligente"
            >
              <img
                src="/luma-assets/calendar.png"
                alt="Agenda 21"
                className="w-[46px] h-auto sm:w-[50px] drop-shadow-[0_8px_16px_rgba(59,130,246,0.25)] select-none pointer-events-none"
                draggable={false}
              />
            </motion.div>

            {/* 3. Tesoura Profissional 3D Rose Gold & Chrome - Órbita Média Direita Alta */}
            <motion.div
              whileHover={{ scale: 1.22, rotate: 12 }}
              whileTap={{ scale: 0.92 }}
              animate={{ y: [0, -4, 0], rotate: [0, 4, 0] }}
              transition={{ duration: 4.0, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
              className="absolute cursor-pointer select-none z-20"
              style={{
                left: "76%",
                top: "32%",
                transform: "translate(-50%, -50%)",
              }}
              title="Tesouras Profissionais"
            >
              <img
                src="/luma-assets/barber_scissors.png"
                alt="Tesoura de Barbeiro 3D"
                className="w-[52px] h-auto sm:w-[56px] drop-shadow-[0_8px_16px_rgba(244,63,94,0.25)] select-none pointer-events-none"
                draggable={false}
              />
            </motion.div>

            {/* 4. Maquininha de Corte 3D Dourada e Preta - Órbita Externa Extrema Esquerda */}
            <motion.div
              whileHover={{ scale: 1.2, rotate: -6 }}
              whileTap={{ scale: 0.92 }}
              animate={{ y: [0, 4, 0] }}
              transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
              className="absolute cursor-pointer select-none z-20"
              style={{
                left: "8%",
                top: "48%",
                transform: "translate(-50%, -50%)",
              }}
              title="Maquininha de Corte DUB"
            >
              <img
                src="/luma-assets/barber_clipper.png"
                alt="Maquininha 3D"
                className="w-[50px] h-auto sm:w-[54px] drop-shadow-[0_10px_20px_rgba(217,119,6,0.3)] select-none pointer-events-none"
                draggable={false}
              />
            </motion.div>

            {/* 5. Poste de Barbeiro Clássico Listrado 3D (Barber Pole) - Órbita Externa Extrema Direita */}
            <motion.div
              whileHover={{ scale: 1.2, rotate: 8 }}
              whileTap={{ scale: 0.92 }}
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 3.9, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
              className="absolute cursor-pointer select-none z-20"
              style={{
                left: "92%",
                top: "48%",
                transform: "translate(-50%, -50%)",
              }}
              title="Barber Pole Clássico"
            >
              <img
                src="/luma-assets/barber_pole.png"
                alt="Barber Pole 3D"
                className="w-[40px] h-auto sm:w-[44px] drop-shadow-[0_10px_20px_rgba(239,68,68,0.25)] select-none pointer-events-none"
                draggable={false}
              />
            </motion.div>

            {/* 6. Barbeiro 2 3D: Cabelo na Régua, Barba Alinhada e Pente (Círculo Pêssego) - Órbita Média Baixa Direita */}
            <motion.div
              whileHover={{ scale: 1.22, rotate: -6 }}
              whileTap={{ scale: 0.92 }}
              animate={{ y: [0, 3.5, 0] }}
              transition={{ duration: 4.1, repeat: Infinity, ease: "easeInOut", delay: 0.7 }}
              className="absolute cursor-pointer select-none z-20"
              style={{
                left: "70%",
                top: "68%",
                transform: "translate(-50%, -50%)",
              }}
              title="Barbeiro Estiloso"
            >
              <img
                src="/luma-assets/barber_black.png"
                alt="Barbeiro Degradê"
                className="w-[52px] h-[52px] sm:w-[56px] sm:h-[56px] rounded-full drop-shadow-[0_8px_16px_rgba(251,146,60,0.25)] select-none pointer-events-none"
                draggable={false}
              />
            </motion.div>

            {/* 7. Memoji Cliente Loira Sorridente (Círculo Azul) - Órbita Média Baixa Esquerda */}
            <motion.div
              whileHover={{ scale: 1.22, rotate: -8 }}
              whileTap={{ scale: 0.92 }}
              animate={{ y: [0, -3.5, 0] }}
              transition={{ duration: 3.7, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
              className="absolute cursor-pointer select-none z-20"
              style={{
                left: "28%",
                top: "66%",
                transform: "translate(-50%, -50%)",
              }}
              title="Cliente Satisfeita"
            >
              <img
                src="/luma-assets/memoji_blue.png"
                alt="Cliente DUB"
                className="w-[48px] h-[48px] sm:w-[52px] sm:h-[52px] rounded-full drop-shadow-[0_8px_16px_rgba(59,130,246,0.22)] select-none pointer-events-none"
                draggable={false}
              />
            </motion.div>

            {/* 8. Memoji Garoto de Touca (Círculo Laranja) - Órbita Externa Topo Esquerda */}
            <motion.div
              whileHover={{ scale: 1.22, rotate: 6 }}
              whileTap={{ scale: 0.92 }}
              animate={{ y: [0, 3.5, 0] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
              className="absolute cursor-pointer select-none z-20"
              style={{
                left: "30%",
                top: "15%",
                transform: "translate(-50%, -50%)",
              }}
              title="Jovem Cliente"
            >
              <img
                src="/luma-assets/memoji_orange.png"
                alt="Cliente Jovem"
                className="w-[44px] h-[44px] sm:w-[48px] sm:h-[48px] rounded-full drop-shadow-[0_8px_16px_rgba(249,115,22,0.22)] select-none pointer-events-none"
                draggable={false}
              />
            </motion.div>

            {/* 9. Memoji Mulher de Óculos (Círculo Amarelo) - Órbita Externa Topo Direita */}
            <motion.div
              whileHover={{ scale: 1.22, rotate: -6 }}
              whileTap={{ scale: 0.92 }}
              animate={{ y: [0, -3.5, 0] }}
              transition={{ duration: 4.3, repeat: Infinity, ease: "easeInOut", delay: 0.9 }}
              className="absolute cursor-pointer select-none z-20"
              style={{
                left: "87%",
                top: "24%",
                transform: "translate(-50%, -50%)",
              }}
              title="Cliente DUB"
            >
              <img
                src="/luma-assets/memoji_yellow.png"
                alt="Cliente DUB"
                className="w-[46px] h-[46px] sm:w-[50px] sm:h-[50px] rounded-full drop-shadow-[0_8px_16px_rgba(234,179,8,0.22)] select-none pointer-events-none"
                draggable={false}
              />
            </motion.div>

          </div>
        </div>

        {/* ═══ 2. Seção Inferior: Logo dub✦, Título Sólido e Botões ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: showSplash ? 0 : 1, y: showSplash ? 14 : 0 }}
          transition={{ duration: 0.45, delay: 0.15 }}
          className="relative z-10 w-full max-w-[430px] mx-auto px-6 sm:px-8 pb-3 pt-0 shrink-0 flex flex-col items-center text-center"
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

          {/* Título de 2 linhas em texto sólido */}
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
