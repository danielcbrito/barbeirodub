import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight } from "lucide-react";
import sceneBarberSad from "@/assets/scene-barber-sad.png";
import sceneBarberHappy from "@/assets/scene-barber-happy.png";
import { AmbientEffects } from "@/components/landing/AmbientEffects";
import { SplashScreen } from "@/components/SplashScreen";
import AuthBottomSheet from "@/components/AuthBottomSheet";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { ROLE_REDIRECTS } from "@/lib/roles";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { LoadingScreen } from "@/components/shared/LoadingScreen";
import { resolveOldestOwnedTenant } from "@/lib/tenantOwnership";

const SLIDES = [
  {
    id: "sad",
    image: sceneBarberSad,
    alt: "Barbeiro estressado com agenda bagunçada",
  },
  {
    id: "happy",
    image: sceneBarberHappy,
    alt: "Barbeiro feliz com clientes satisfeitos",
  },
];

const CAROUSEL_INTERVAL = 7000;

const Index = () => {
  const [showAuth, setShowAuth] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [activeSlide, setActiveSlide] = useState(0);
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

  /* ═══ Splash timer ═══ */
  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2200);
    return () => clearTimeout(timer);
  }, []);

  /* ═══ Carrossel auto-play ═══ */
  useEffect(() => {
    if (showSplash) return;
    const interval = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % SLIDES.length);
    }, CAROUSEL_INTERVAL);
    return () => clearInterval(interval);
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

  const currentSlide = SLIDES[activeSlide];

  return (
    <>
      <SplashScreen visible={showSplash} />

      <div className="fixed inset-0 flex items-center justify-center bg-background pt-[env(safe-area-inset-top)]">
        <div
          className="relative w-full h-full overflow-hidden bg-background"
          style={{ maxWidth: 480 }}
        >
          {/* ═══ CAMADA 1: Fundo + Efeitos ═══ */}
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ zIndex: 0 }}
          >
            <AmbientEffects />
          </div>

          {/* ═══ CAMADA 2: Personagem (atrás do painel, na frente do fundo) ═══ */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSlide.id}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.03 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="absolute left-0 right-0 flex items-center justify-center"
              style={{
                top: "4%",
                bottom: "22%",
                zIndex: 1,
                padding: "0 6%",
              }}
            >
              <img
                src={currentSlide.image}
                alt={currentSlide.alt}
                draggable={false}
                className="w-full h-full block dark:invert"
                style={{
                  objectFit: "contain",
                  objectPosition: "center center",
                }}
              />
            </motion.div>
          </AnimatePresence>

          {/* ═══ CAMADA 3: Painel sólido arredondado — cobre parte inferior do barbeiro ═══ */}
          <div
            className="absolute left-0 right-0 bottom-0 bg-background"
            style={{
              height: "24%",
              zIndex: 2,
            }}
          />

          {/* ═══ CAMADA 4: Título + CTA — por cima de tudo ═══ */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: showSplash ? 0 : 1, y: showSplash ? 12 : 0 }}
            transition={{ duration: 0.5, delay: 1.0 }}
            className="absolute bottom-0 left-0 right-0 px-6"
            style={{ zIndex: 3 }}
          >
            {/* ═══ Carousel dots ═══ */}
            <div className="flex items-center gap-2 mb-4">
              {SLIDES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveSlide(i)}
                  className={`h-1 rounded-full transition-all duration-300 ${
                    i === activeSlide
                      ? "w-6 bg-primary"
                      : "w-2 bg-muted-foreground/30"
                  }`}
                />
              ))}
            </div>

            <span
              className="block mb-1.5 text-[10px] font-semibold text-muted-foreground/40 uppercase"
              style={{ letterSpacing: "2.5px" }}
            >
              DUB
            </span>

            <div className="flex flex-col items-start gap-1 mb-5">
              <h1
                style={{
                  fontFamily: "'Plus Jakarta Sans', 'Space Grotesk', Inter, sans-serif",
                  fontWeight: 900,
                  fontSize: 27,
                  lineHeight: 1.18,
                  margin: 0,
                }}
                className="text-foreground"
              >
                Leve sua barbearia{" "}
                <br />
                para o{" "}
                <span className="text-primary">próximo nível.</span>
              </h1>
              <p className="text-[12px] text-muted-foreground/60 leading-relaxed m-0">
                Agenda inteligente, clientes fiéis e zero estresse.
              </p>
            </div>

            <div className="flex flex-col gap-2.5" style={{ marginBottom: "calc(env(safe-area-inset-bottom, 0px) + 22px)" }}>
              <button
                onClick={() => navigate("/login?mode=signup")}
                className="w-full flex items-center justify-between active:scale-[0.97] transition-all bg-primary text-primary-foreground"
                style={{
                  fontFamily: "'Plus Jakarta Sans', 'Space Grotesk', Inter, sans-serif",
                  fontWeight: 700,
                  fontSize: 15,
                  borderRadius: 14,
                  padding: "14px 18px",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <span>Criar conta</span>
                <span
                  className="flex items-center justify-center bg-primary-foreground"
                  style={{ width: 28, height: 28, borderRadius: 8 }}
                >
                  <ArrowRight className="w-3.5 h-3.5 text-primary" />
                </span>
              </button>

              <button
                onClick={() => navigate("/login")}
                className="w-full flex items-center justify-between active:scale-[0.97] transition-all border-foreground text-foreground"
                style={{
                  fontFamily: "'Plus Jakarta Sans', 'Space Grotesk', Inter, sans-serif",
                  fontWeight: 700,
                  fontSize: 15,
                  background: "transparent",
                  borderRadius: 14,
                  padding: "14px 18px",
                  borderWidth: "1.8px",
                  borderStyle: "solid",
                  cursor: "pointer",
                }}
              >
                <span>Entrar no App</span>
                <span
                  className="flex items-center justify-center bg-foreground"
                  style={{ width: 28, height: 28, borderRadius: 8 }}
                >
                  <ArrowRight className="w-3.5 h-3.5 text-background" />
                </span>
              </button>
            </div>

          </motion.div>
        </div>
      </div>

      <AuthBottomSheet isOpen={showAuth} onClose={() => setShowAuth(false)} />
    </>
  );
};

export default Index;
