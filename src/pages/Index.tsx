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
   Ícones 3D e Elementos Interativos do Ecossistema Orbital (Estilo Luma)
   ═══════════════════════════════════════════════════════════════════════════ */

/* 1. Estrela Radiante Central com Brilho Sunset */
const GlowingStar = () => (
  <motion.div
    animate={{ scale: [1, 1.08, 1], rotate: [0, 3, -3, 0] }}
    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
    className="relative flex items-center justify-center pointer-events-none select-none"
  >
    <div className="absolute w-24 h-24 rounded-full bg-gradient-to-r from-orange-400/30 via-pink-500/25 to-amber-300/30 blur-xl pointer-events-none" />
    <svg width="54" height="54" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="starGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FB923C" />
          <stop offset="45%" stopColor="#F43F5E" />
          <stop offset="100%" stopColor="#EC4899" />
        </linearGradient>
      </defs>
      <path
        d="M28 2 C28 16 16 28 2 28 C16 28 28 40 28 54 C28 40 40 28 54 28 C40 28 28 16 28 2 Z"
        fill="url(#starGrad)"
      />
      <path
        d="M28 12 C28 20 20 28 12 28 C20 28 28 36 28 44 C28 36 36 28 44 28 C36 28 28 20 28 12 Z"
        fill="white"
        opacity="0.35"
      />
    </svg>
  </motion.div>
);

/* 2. Pino de Localização 3D (Roxo e Amarelo com profundidade) */
const Pin3D = () => (
  <motion.div
    whileHover={{ scale: 1.18, rotate: 6 }}
    whileTap={{ scale: 0.92 }}
    animate={{ y: [0, -5, 0] }}
    transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
    className="cursor-pointer select-none filter drop-shadow-[0_8px_14px_rgba(168,85,247,0.38)]"
  >
    <svg width="44" height="52" viewBox="0 0 44 52" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="pinBody" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FDE047" />
          <stop offset="50%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#EC4899" />
        </linearGradient>
        <linearGradient id="pinDepth" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#C084FC" />
          <stop offset="100%" stopColor="#7E22CE" />
        </linearGradient>
      </defs>
      <path
        d="M22 4C11.5 4 3 12.5 3 23c0 13.5 16.5 25 19 25 2.5 0 19-11.5 19-25 0-10.5-8.5-19-19-19z"
        fill="url(#pinDepth)"
      />
      <path
        d="M20 2C10.5 2 3 9.5 3 19c0 12.5 15 23 17 23 2 0 17-10.5 17-23 0-9.5-7.5-17-17-17z"
        fill="url(#pinBody)"
      />
      <circle cx="20" cy="19" r="6.5" fill="#7E22CE" opacity="0.95" />
      <circle cx="19" cy="18" r="5" fill="#FFFFFF" opacity="0.95" />
    </svg>
  </motion.div>
);

/* 3. Calendário 3D (com número 21) */
const Calendar3D = () => (
  <motion.div
    whileHover={{ scale: 1.18, rotate: -6 }}
    whileTap={{ scale: 0.92 }}
    animate={{ y: [0, 4, 0] }}
    transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
    className="cursor-pointer select-none filter drop-shadow-[0_8px_16px_rgba(59,130,246,0.35)]"
  >
    <svg width="46" height="48" viewBox="0 0 46 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="calHeader" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60A5FA" />
          <stop offset="100%" stopColor="#2563EB" />
        </linearGradient>
        <linearGradient id="calBody" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#F1F5F9" />
        </linearGradient>
      </defs>
      <rect x="5" y="8" width="36" height="36" rx="8" fill="#1D4ED8" />
      <rect x="3" y="6" width="36" height="36" rx="7" fill="url(#calBody)" />
      <path d="M3 13C3 9.13 6.13 6 10 6H32C35.87 6 39 9.13 39 13V15H3V13Z" fill="url(#calHeader)" />
      <rect x="9" y="3" width="3.5" height="6.5" rx="1.5" fill="#1E293B" />
      <rect x="29" y="3" width="3.5" height="6.5" rx="1.5" fill="#1E293B" />
      <text
        x="21"
        y="33"
        textAnchor="middle"
        fontSize="17"
        fontWeight="800"
        fill="#1E3A8A"
        fontFamily="sans-serif"
      >
        21
      </text>
    </svg>
  </motion.div>
);

/* 4. Tesoura de Barbeiro 3D (Substitui o chapeuzinho como pedido) */
const Scissors3D = () => (
  <motion.div
    whileHover={{ scale: 1.18, rotate: 12 }}
    whileTap={{ scale: 0.92 }}
    animate={{ y: [0, -5, 0], rotate: [-4, 4, -4] }}
    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
    className="cursor-pointer select-none filter drop-shadow-[0_8px_14px_rgba(244,63,94,0.32)]"
  >
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bladeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F8FAFC" />
          <stop offset="60%" stopColor="#CBD5E1" />
          <stop offset="100%" stopColor="#94A3B8" />
        </linearGradient>
        <linearGradient id="handleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FB7185" />
          <stop offset="100%" stopColor="#E11D48" />
        </linearGradient>
      </defs>
      <path d="M13 35 L37 11 C38 10 40 11 39 13 L25 31 Z" fill="url(#bladeGrad)" />
      <path d="M15 13 L39 35 C40 36 38 38 37 37 L13 15 Z" fill="url(#bladeGrad)" />
      <circle cx="24" cy="24" r="3" fill="#475569" />
      <circle cx="24" cy="24" r="1.5" fill="#F8FAFC" />
      <circle cx="10" cy="37" r="6.5" fill="none" stroke="url(#handleGrad)" strokeWidth="3.2" />
      <circle cx="10" cy="11" r="6.5" fill="none" stroke="url(#handleGrad)" strokeWidth="3.2" />
    </svg>
  </motion.div>
);

/* 5. Poste de Barbeiro Listrado 3D (Barber Pole) */
const BarberPole3D = () => (
  <motion.div
    whileHover={{ scale: 1.18, rotate: -8 }}
    whileTap={{ scale: 0.92 }}
    animate={{ y: [0, 4, 0] }}
    transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
    className="cursor-pointer select-none filter drop-shadow-[0_8px_14px_rgba(239,68,68,0.32)]"
  >
    <svg width="34" height="52" viewBox="0 0 34 52" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="capGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#E2E8F0" />
          <stop offset="50%" stopColor="#F8FAFC" />
          <stop offset="100%" stopColor="#94A3B8" />
        </linearGradient>
        <clipPath id="cylinderClip">
          <rect x="7" y="10" width="20" height="32" rx="3" />
        </clipPath>
      </defs>
      <ellipse cx="17" cy="8" rx="8" ry="4" fill="url(#capGrad)" />
      <circle cx="17" cy="5" r="3" fill="url(#capGrad)" />
      <rect x="7" y="10" width="20" height="32" rx="3" fill="#FFFFFF" />
      <g clipPath="url(#cylinderClip)">
        <path d="M2 8 L22 -4 L32 6 L12 18 Z" fill="#EF4444" />
        <path d="M2 16 L22 4 L32 14 L12 26 Z" fill="#3B82F6" />
        <path d="M2 24 L22 12 L32 22 L12 34 Z" fill="#EF4444" />
        <path d="M2 32 L22 20 L32 30 L12 42 Z" fill="#3B82F6" />
        <path d="M2 40 L22 28 L32 38 L12 50 Z" fill="#EF4444" />
      </g>
      <rect x="9" y="10" width="3" height="32" fill="white" opacity="0.65" />
      <ellipse cx="17" cy="44" rx="8" ry="4" fill="url(#capGrad)" />
      <rect x="11" y="42" width="12" height="4" fill="url(#capGrad)" />
    </svg>
  </motion.div>
);

/* 6. Globo 3D Roxo com Suporte Dourado */
const Globe3D = () => (
  <motion.div
    whileHover={{ scale: 1.18, rotate: 6 }}
    whileTap={{ scale: 0.92 }}
    animate={{ y: [0, -4, 0] }}
    transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
    className="cursor-pointer select-none filter drop-shadow-[0_8px_14px_rgba(168,85,247,0.32)]"
  >
    <svg width="44" height="48" viewBox="0 0 44 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="globeSphere" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#F472B6" />
          <stop offset="60%" stopColor="#A855F7" />
          <stop offset="100%" stopColor="#581C87" />
        </radialGradient>
        <linearGradient id="goldStand" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FDE047" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>
      </defs>
      <circle cx="21" cy="20" r="14" fill="url(#globeSphere)" />
      <ellipse cx="21" cy="20" rx="7" ry="14" fill="none" stroke="#FCE7F3" strokeWidth="1" opacity="0.45" />
      <line x1="7" y1="20" x2="35" y2="20" stroke="#FCE7F3" strokeWidth="1" opacity="0.45" />
      <path d="M9 22 C9 29 15 35 22 35 C28 35 34 30 35 23" fill="none" stroke="url(#goldStand)" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="20" y="35" width="4" height="6" fill="url(#goldStand)" />
      <ellipse cx="22" cy="43" rx="10" ry="3.5" fill="url(#goldStand)" />
    </svg>
  </motion.div>
);

/* 7. Tickets / Agendamento 3D */
const Tickets3D = () => (
  <motion.div
    whileHover={{ scale: 1.18, rotate: -6 }}
    whileTap={{ scale: 0.92 }}
    animate={{ y: [0, 4, 0] }}
    transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut", delay: 0.7 }}
    className="cursor-pointer select-none filter drop-shadow-[0_8px_14px_rgba(99,102,241,0.32)]"
  >
    <svg width="42" height="38" viewBox="0 0 42 38" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ticketGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818CF8" />
          <stop offset="100%" stopColor="#4F46E5" />
        </linearGradient>
      </defs>
      <rect x="4" y="8" width="30" height="22" rx="4" transform="rotate(-12 19 19)" fill="url(#ticketGrad)" />
      <rect x="8" y="6" width="30" height="22" rx="4" transform="rotate(8 23 17)" fill="#6366F1" />
      <circle cx="8" cy="17" r="3" fill="#ffffff" />
      <circle cx="38" cy="17" r="3" fill="#ffffff" />
    </svg>
  </motion.div>
);

/* 8. Avatares Memoji em Círculos Pastéis Coloridos */
const AvatarBubble = ({
  emoji,
  bgColor,
  borderColor,
  size = 44,
  delay = 0,
}: {
  emoji: string;
  bgColor: string;
  borderColor: string;
  size?: number;
  delay?: number;
}) => (
  <motion.div
    whileHover={{ scale: 1.25, rotate: 6 }}
    whileTap={{ scale: 0.92 }}
    animate={{ y: [0, -4, 0] }}
    transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut", delay }}
    className="rounded-full flex items-center justify-center cursor-pointer select-none shadow-[0_6px_16px_rgba(0,0,0,0.1)] transition-transform"
    style={{
      width: size,
      height: size,
      backgroundColor: bgColor,
      border: `2px solid ${borderColor}`,
    }}
  >
    <span style={{ fontSize: size * 0.58 }} className="leading-none select-none">
      {emoji}
    </span>
  </motion.div>
);

/* ═══════════════════════════════════════════════════════════════════════════
   Tela Inicial (Index) — Layout 100% no padrão Luma em Código Real
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

      {/* Container Raiz: Fundo pastel idêntico ao modelo Luma */}
      <div
        className="fixed inset-0 w-full h-[100dvh] text-zinc-900 overflow-hidden flex flex-col justify-between select-none"
        style={{
          background:
            "radial-gradient(ellipse 75% 45% at 10% 8%, rgba(210, 233, 255, 0.75) 0%, transparent 65%), radial-gradient(ellipse 75% 45% at 90% 8%, rgba(255, 222, 222, 0.75) 0%, transparent 65%), #ffffff",
        }}
      >
        {/* ═══ 1. Centro/Superior: Sistema Orbital de Órbitas Concéntricas com Ícones e Avatares em Código ═══ */}
        <div
          className="relative flex-1 w-full max-w-[480px] mx-auto flex items-center justify-center px-2 min-h-0 overflow-visible"
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          }}
        >
          {/* Container Quadrado Relativo para ancorar o SVG das órbitas e os itens absolutos */}
          <div className="relative w-full max-w-[390px] sm:max-w-[430px] aspect-square flex items-center justify-center">
            
            {/* SVG das Órbitas Concéntricas Finas Brancas */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 400 400"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Órbita 1 (interna) */}
              <circle cx="200" cy="200" r="56" stroke="rgba(255, 255, 255, 0.85)" strokeWidth="1.4" />
              {/* Órbita 2 (média) */}
              <circle cx="200" cy="200" r="105" stroke="rgba(255, 255, 255, 0.85)" strokeWidth="1.4" />
              {/* Órbita 3 (externa) */}
              <circle cx="200" cy="200" r="158" stroke="rgba(255, 255, 255, 0.85)" strokeWidth="1.4" />
              {/* Órbita 4 elíptica de expansão suave */}
              <ellipse cx="200" cy="200" rx="194" ry="180" stroke="rgba(255, 255, 255, 0.45)" strokeWidth="1.2" strokeDasharray="5 7" />
            </svg>

            {/* Estrela Radiante no Centro das Órbitas */}
            <GlowingStar />

            {/* ─── Elementos Posicionados ao Redor das Órbitas em Código Real ─── */}

            {/* [Órbita Externa]: Topo Centro - Pino de Localização 3D */}
            <div className="absolute top-[8%] left-[54%] -translate-x-1/2 -translate-y-1/2 z-20">
              <Pin3D />
            </div>

            {/* [Órbita Externa]: Topo Esquerdo - Avatar com Touca Laranja */}
            <div className="absolute top-[16%] left-[34%] -translate-x-1/2 -translate-y-1/2 z-20">
              <AvatarBubble emoji="👦🏻" bgColor="#FFEDD5" borderColor="#FED7AA" size={42} delay={0.2} />
            </div>

            {/* [Órbita Externa]: Topo Direito - Avatar Mulher com Óculos */}
            <div className="absolute top-[23%] left-[72%] -translate-x-1/2 -translate-y-1/2 z-20">
              <AvatarBubble emoji="👩🏻‍💼" bgColor="#FEF9C3" borderColor="#FEF08A" size={44} delay={0.4} />
            </div>

            {/* [Órbita Média]: Superior Esquerdo - Calendário 3D (21) */}
            <div className="absolute top-[30%] left-[38%] -translate-x-1/2 -translate-y-1/2 z-20">
              <Calendar3D />
            </div>

            {/* [Órbita Interna]: Superior Centro - Avatar Barbeiro com Barba e Óculos */}
            <div className="absolute top-[28%] left-[58%] -translate-x-1/2 -translate-y-1/2 z-20">
              <AvatarBubble emoji="🧔🏻‍♂️" bgColor="#DCFCE7" borderColor="#BBF7D0" size={42} delay={0.3} />
            </div>

            {/* [Órbita Média]: Direita - Tesoura de Barbeiro 3D */}
            <div className="absolute top-[40%] left-[68%] -translate-x-1/2 -translate-y-1/2 z-20">
              <Scissors3D />
            </div>

            {/* [Órbita Externa]: Extrema Direita - Poste de Barbeiro 3D (Barber Pole) */}
            <div className="absolute top-[44%] left-[82%] -translate-x-1/2 -translate-y-1/2 z-20">
              <BarberPole3D />
            </div>

            {/* [Órbita Externa]: Esquerda Alta - Ingressos 3D */}
            <div className="absolute top-[28%] left-[19%] -translate-x-1/2 -translate-y-1/2 z-20">
              <Tickets3D />
            </div>

            {/* [Órbita Externa]: Esquerda Meio - Avatar Homem com Corte na Régua */}
            <div className="absolute top-[44%] left-[18%] -translate-x-1/2 -translate-y-1/2 z-20">
              <AvatarBubble emoji="🧔🏽" bgColor="#FEE2E2" borderColor="#FECACA" size={44} delay={0.5} />
            </div>

            {/* [Órbita Interna]: Esquerda Baixa - Avatar Mulher Loira */}
            <div className="absolute top-[44%] left-[32%] -translate-x-1/2 -translate-y-1/2 z-20">
              <AvatarBubble emoji="👱🏼‍♀️" bgColor="#DBEAFE" borderColor="#BFDBFE" size={40} delay={0.6} />
            </div>

            {/* [Órbita Média]: Inferior Esquerdo - Globo 3D Roxo/Dourado */}
            <div className="absolute top-[54%] left-[42%] -translate-x-1/2 -translate-y-1/2 z-20">
              <Globe3D />
            </div>

            {/* [Órbita Média]: Inferior Direito - Avatar com Cabelo Moderno */}
            <div className="absolute top-[54%] left-[62%] -translate-x-1/2 -translate-y-1/2 z-20">
              <AvatarBubble emoji="🧑🏽‍🦱" bgColor="#F3E8FF" borderColor="#E9D5FF" size={42} delay={0.7} />
            </div>

            {/* [Órbita Externa]: Inferior Centro/Esquerda - Avatar Cliente */}
            <div className="absolute top-[72%] left-[32%] -translate-x-1/2 -translate-y-1/2 z-20">
              <AvatarBubble emoji="👩🏼" bgColor="#E0F2FE" borderColor="#BAE6FD" size={42} delay={0.8} />
            </div>

            {/* [Órbita Externa]: Inferior Centro - Avatar Barbeiro Estiloso */}
            <div className="absolute top-[70%] left-[48%] -translate-x-1/2 -translate-y-1/2 z-20">
              <AvatarBubble emoji="👨🏾" bgColor="#E0E7FF" borderColor="#C7D2FE" size={44} delay={0.9} />
            </div>

            {/* [Órbita Externa]: Inferior Direita - Avatar Jovem */}
            <div className="absolute top-[73%] left-[64%] -translate-x-1/2 -translate-y-1/2 z-20">
              <AvatarBubble emoji="👦🏽" bgColor="#FEF08A" borderColor="#FDE047" size={42} delay={1.0} />
            </div>

          </div>
        </div>

        {/* ═══ 2. Inferior: Logo dub✦, Título Sólido e Botões (Padrão Luma) ═══ */}
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


