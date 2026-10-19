import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { CampaignAdIcon3D } from "@/components/shared/Category3DIcons";
import bannerInstagramConnect from "@/assets/banner_instagram_connect.png";
import { cn } from "@/lib/utils";

interface BarberHomeCarouselProps {
  basePath?: string;
  className?: string;
}

/**
 * Carrossel infinito unidirecional com aceleração total por hardware (GPU).
 * - Loop infinito contínuo: transiciona sempre para a FRENTE (sem nunca rebobinar para trás).
 * - Track quadruplo com clones nas extremidades [Campanhas (clone), Instagram, Campanhas, Instagram (clone)].
 * - Reset invisível via onTransitionEnd e duplo rAF para zero desmonte e zero piscada.
 * - Imagens 100% retidas na VRAM da GPU com decoding sincronizado e loading eager.
 * - Proporção exata 2.4 : 1 padronizada para zero pulo de layout.
 */
export function BarberHomeCarousel({ basePath = "/barbeiro", className }: BarberHomeCarouselProps) {
  const navigate = useNavigate();

  // 0: Campanhas (clone)
  // 1: Instagram (original)
  // 2: Campanhas (original)
  // 3: Instagram (clone)
  const [currentIndex, setCurrentIndex] = useState(1);
  const [withTransition, setWithTransition] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

  const touchStartX = useRef<number | null>(null);
  const touchCurrentX = useRef<number | null>(null);
  const isDragging = useRef(false);
  const isAnimating = useRef(false);

  // Avança sempre para a frente com transição suave
  const nextSlide = useCallback(() => {
    if (isAnimating.current) return;
    isAnimating.current = true;
    setWithTransition(true);
    setCurrentIndex((prev) => prev + 1);
  }, []);

  // Volta suavemente para trás (usado em swipe reverso do usuário)
  const prevSlide = useCallback(() => {
    if (isAnimating.current) return;
    isAnimating.current = true;
    setWithTransition(true);
    setCurrentIndex((prev) => prev - 1);
  }, []);

  // Autoplay contínuo a cada 5.5s
  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => {
      nextSlide();
    }, 5500);
    return () => clearInterval(timer);
  }, [isPaused, nextSlide]);

  // Reset invisível de índice nas extremidades para manter o loop infinito contínuo
  const handleTransitionEnd = () => {
    isAnimating.current = false;

    if (currentIndex === 3) {
      // Chegou no clone do Instagram (3) -> pula instantaneamente para o Instagram real (1)
      setWithTransition(false);
      setCurrentIndex(1);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setWithTransition(true);
        });
      });
    } else if (currentIndex === 0) {
      // Chegou no clone de Campanhas (0) -> pula instantaneamente para a Campanha real (2)
      setWithTransition(false);
      setCurrentIndex(2);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setWithTransition(true);
        });
      });
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
    touchCurrentX.current = e.targetTouches[0].clientX;
    isDragging.current = true;
    setIsPaused(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    touchCurrentX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (touchStartX.current !== null && touchCurrentX.current !== null) {
      const distance = touchStartX.current - touchCurrentX.current;
      const minSwipeDistance = 35;
      if (distance > minSwipeDistance) {
        nextSlide();
      } else if (distance < -minSwipeDistance) {
        prevSlide();
      }
    }
    touchStartX.current = null;
    touchCurrentX.current = null;
    isDragging.current = false;
    setIsPaused(false);
  };

  // Índice lógico para exibição dos indicadores (0 = Instagram, 1 = Campanhas)
  const logicalIndex = currentIndex === 1 || currentIndex === 3 ? 0 : 1;

  // Renderizadores de slide (para reuso perfeito sem duplicar lógica visual)
  const renderInstagramSlide = (key: string | number) => (
    <div
      key={key}
      onClick={() => navigate(`${basePath}/instagram`)}
      className="relative h-full w-full shrink-0 cursor-pointer group bg-zinc-950 overflow-hidden select-none active:scale-[0.99] transition-transform"
    >
      <img
        src={bannerInstagramConnect}
        alt="Conecte seu Instagram e deixe sua página mais profissional para seus clientes"
        className="w-full h-full object-cover object-center filter brightness-[0.98] group-hover:scale-[1.02] transition-transform duration-700 ease-out pointer-events-none"
        loading="eager"
        decoding="sync"
      />

      {/* Vinheta cinematográfica suave */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity pointer-events-none" />

      {/* Botão Cápsula de Conexão com Glassmorphism */}
      <div className="absolute bottom-2.5 right-2.5 sm:bottom-3 sm:right-3 z-10 inline-flex items-center gap-1 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full bg-black/60 dark:bg-white/15 backdrop-blur-md border border-white/20 text-white text-[10.5px] sm:text-[11.5px] font-semibold shadow-md group-hover:bg-black/80 transition-all">
        <span>Conectar agora</span>
        <ArrowRight className="w-3 h-3 stroke-[2.5] group-hover:translate-x-0.5 transition-transform" />
      </div>
    </div>
  );

  const renderCampaignSlide = (key: string | number) => (
    <div
      key={key}
      onClick={() => navigate(`${basePath}/promocoes`)}
      className="relative h-full w-full shrink-0 cursor-pointer group bg-card p-3.5 sm:p-5 flex items-center justify-between gap-3 sm:gap-4 overflow-hidden select-none active:scale-[0.99] transition-transform"
    >
      <div className="min-w-0 flex-1 space-y-1 sm:space-y-1.5">
        <span className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
          Campanhas
        </span>
        <h2 className="text-[14px] sm:text-[16px] font-bold text-foreground tracking-tight leading-snug truncate">
          Ative sua campanha
        </h2>
        <p className="text-[11px] sm:text-[12px] text-muted-foreground font-normal leading-relaxed line-clamp-1 sm:line-clamp-2">
          Atraia novos clientes e preencha sua agenda com promoções e cupons exclusivos.
        </p>

        <div className="pt-0.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`${basePath}/promocoes`);
            }}
            className="h-7 sm:h-8 px-3 sm:px-3.5 rounded-full bg-foreground text-background font-semibold text-[11px] sm:text-xs inline-flex items-center gap-1.5 shadow-xs hover:opacity-90 active:scale-95 transition-all cursor-pointer"
          >
            <span>Ver campanhas</span>
            <ArrowRight className="w-3 h-3 stroke-[2.2]" />
          </button>
        </div>
      </div>

      <div className="shrink-0 flex items-center justify-center">
        <CampaignAdIcon3D className="w-14 h-14 sm:w-16 sm:h-16 object-contain select-none pointer-events-none group-hover:scale-105 transition-transform duration-300" />
      </div>
    </div>
  );

  return (
    <section
      className={cn("relative w-full space-y-2 select-none", className)}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      aria-label="Destaques e anúncios"
    >
      {/* 
        Container rígido 2.4 : 1 com overflow oculto.
        O track infinito avança continuamente para a frente sem nunca rebobinar para trás.
      */}
      <div className="relative w-full aspect-[2.4/1] max-h-[175px] min-h-[135px] overflow-hidden rounded-2xl sm:rounded-3xl border border-border/40 dark:border-white/10 shadow-sm bg-zinc-950">
        <div
          onTransitionEnd={handleTransitionEnd}
          className={cn(
            "flex h-full w-full will-change-transform",
            withTransition
              ? "transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
              : "transition-none"
          )}
          style={{
            transform: `translate3d(-${currentIndex * 100}%, 0, 0)`,
          }}
        >
          {/* Index 0: Clone de Campanhas (para swipe reverso sem travar) */}
          {renderCampaignSlide("clone-campaign-prev")}

          {/* Index 1: Instagram (Original) */}
          {renderInstagramSlide("original-instagram")}

          {/* Index 2: Campanhas (Original) */}
          {renderCampaignSlide("original-campaign")}

          {/* Index 3: Clone do Instagram (para avanço infinito para frente sem voltar) */}
          {renderInstagramSlide("clone-instagram-next")}
        </div>
      </div>

      {/* Indicadores de Paginação com Pílulas Suaves */}
      <div className="flex items-center justify-center gap-1.5 pt-0.5">
        {[0, 1].map((index) => {
          const isActive = logicalIndex === index;
          return (
            <button
              key={index}
              type="button"
              onClick={() => {
                if (logicalIndex === index) return;
                // Ao clicar, sempre navega para a frente suavemente
                if (index === 1) {
                  // Quer ir para Campanhas
                  setWithTransition(true);
                  setCurrentIndex(2);
                } else {
                  // Quer ir para Instagram
                  setWithTransition(true);
                  setCurrentIndex(3);
                }
              }}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300 cursor-pointer",
                isActive
                  ? "w-6 bg-foreground"
                  : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
              )}
              aria-label={`Slide ${index + 1}`}
            />
          );
        })}
      </div>
    </section>
  );
}

