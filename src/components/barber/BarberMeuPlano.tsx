'use client';

import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useBarbershopPendingFields } from "@/hooks/useBarbershopPendingFields";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Users,
  CreditCard,
  Building,
  QrCode,
  MessageSquare,
  Clock,
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  X,
} from "lucide-react";
import { ScheduleHeader } from "@/components/shared/ScheduleHeader";
import { useTenantSubscription } from "@/hooks/useTenantSubscription";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import logoDub from "@/assets/logo-dub.png";

interface BarberMeuPlanoProps {
  tenantId: string | null;
  tenantNome?: string;
  onBack?: () => void;
}

export interface PlanDefinition {
  id: string;
  name: string;
  label: string;
  barbersLimit: number;
  unitsLimit: number;
  price: number;
  isCustomPrice?: boolean;
  highlight?: boolean;
  description: string;
  features: string[];
}

export const OFFICIAL_PLANS: PlanDefinition[] = [
  {
    id: "solo",
    name: "Solo",
    label: "1 barbeiro • 1 unidade",
    barbersLimit: 1,
    unitsLimit: 1,
    price: 38.9,
    description: "Ideal para barbeiros autônomos que gerenciam sua própria cadeira.",
    features: [
      "1 Barbeiro",
      "1 Unidade",
      "Agenda online 24h ilimitada",
      "Gestão de clientes e histórico",
      "Relatórios de faturamento",
      "Lembretes automáticos via WhatsApp",
      "Suporte prioritário",
    ],
  },
  {
    id: "dupla",
    name: "Dupla",
    label: "Até 2 barbeiros • 1 unidade",
    barbersLimit: 2,
    unitsLimit: 1,
    price: 69.9,
    highlight: true,
    description: "Perfeito para duplas ou barbearias com 2 profissionais.",
    features: [
      "Até 2 Barbeiros",
      "1 Unidade",
      "Agenda inteligente individual por profissional",
      "Controle de comissões por barbeiro",
      "Relatórios de desempenho e faturamento",
      "Disparos automáticos via WhatsApp",
      "Suporte prioritário dedicado",
    ],
  },
  {
    id: "equipe",
    name: "Equipe",
    label: "Até 5 barbeiros • 1 unidade",
    barbersLimit: 5,
    unitsLimit: 1,
    price: 129.9,
    description: "Para barbearias consolidadas com time em crescimento.",
    features: [
      "Até 5 Barbeiros",
      "1 Unidade",
      "Painel unificado da equipe",
      "Gestão de comissões por barbeiro",
      "Relatórios avançados de retenção",
      "Disparos de promoções",
      "Suporte prioritário",
    ],
  },
  {
    id: "rede",
    name: "Rede",
    label: "Até 9 barbeiros • Até 3 unidades",
    barbersLimit: 9,
    unitsLimit: 3,
    price: 249.9,
    description: "Para barbearias com até 3 filiais ou equipes de grande porte.",
    features: [
      "Até 9 Barbeiros",
      "Até 3 Unidades / Filiais",
      "Painel multi-unidades consolidado",
      "Gestão de comissões individuais",
      "Relatórios detalhados de metas",
      "Disparos em massa e campanhas",
      "Suporte VIP dedicado",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    label: "Ilimitado • Ilimitado",
    barbersLimit: 999999,
    unitsLimit: 999999,
    price: 0,
    isCustomPrice: true,
    description: "Solução completa sob medida para redes e franquias.",
    features: [
      "Barbeiros Ilimitados",
      "Unidades Ilimitadas",
      "Painel corporativo e múltiplas filiais",
      "Relatórios executivos e auditoria",
      "Disparos ilimitados via WhatsApp",
      "Gerente de conta exclusivo",
    ],
  },
];

type ScreenView = "meu-plano" | "escolha-plano" | "checkout";

export function BarberMeuPlano({ tenantId, tenantNome = "Sua Barbearia", onBack }: BarberMeuPlanoProps) {
  const navigate = useNavigate();
  const subscription = useTenantSubscription(tenantId);
  const { totalPendingCount, isCompliant, missingFieldNames } = useBarbershopPendingFields(tenantId);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [currentView, setCurrentView] = useState<ScreenView>("meu-plano");
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [selectedPlanForCheckout, setSelectedPlanForCheckout] = useState<PlanDefinition | null>(null);

  // Estados da assinatura bancária automatizada
  const [isActivating, setIsActivating] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [activationSuccess, setActivationSuccess] = useState(false);

  const carouselRef = useRef<HTMLDivElement>(null);

  // Identifica o plano atual
  const currentPlan = useMemo(() => {
    return (
      OFFICIAL_PLANS.find(
        (p) => p.name.toLowerCase() === subscription.planName?.toLowerCase()
      ) || OFFICIAL_PLANS[0]
    );
  }, [subscription.planName]);

  // Formata a data de vencimento de forma limpa (ex: "24 de novembro")
  const formattedVencimento = useMemo(() => {
    if (subscription.isExempt) return "Isento de cobrança";
    const dateToUse = subscription.nextBillingDate || subscription.trialEnd;
    if (dateToUse) {
      try {
        return format(dateToUse, "dd 'de' MMMM", { locale: ptBR });
      } catch {
        return "24 de novembro";
      }
    }
    return "24 de novembro";
  }, [subscription.isExempt, subscription.nextBillingDate, subscription.trialEnd]);

  // Plano atualmente focado no carrossel
  const activeCarouselPlan = OFFICIAL_PLANS[carouselIndex] || OFFICIAL_PLANS[0];
  const isSelectedCurrent =
    !subscription.isTrial &&
    subscription.planName?.toLowerCase() === activeCarouselPlan.name.toLowerCase();

  // Sincroniza o índice do carrossel ao passar o dedo (swipe)
  const handleCarouselScroll = () => {
    if (!carouselRef.current) return;
    const { scrollLeft, clientWidth } = carouselRef.current;
    if (clientWidth === 0) return;
    const itemWidth = clientWidth * 0.85 + 12;
    const newIdx = Math.round(scrollLeft / itemWidth);
    if (newIdx >= 0 && newIdx < OFFICIAL_PLANS.length && newIdx !== carouselIndex) {
      setCarouselIndex(newIdx);
    }
  };

  const scrollToIndex = (index: number) => {
    setCarouselIndex(index);
    if (carouselRef.current) {
      const { clientWidth } = carouselRef.current;
      const itemWidth = clientWidth * 0.85 + 12;
      carouselRef.current.scrollTo({
        left: index * itemWidth,
        behavior: "smooth",
      });
    }
  };

  // Ao entrar na tela cheia de escolha de plano, posiciona no primeiro upgrade recomendado
  const handleOpenUpgradeScreen = () => {
    const currentLimit = subscription.barbersAllowed || currentPlan.barbersLimit || 1;
    const firstHigherIdx = OFFICIAL_PLANS.findIndex((p) => p.barbersLimit > currentLimit);
    const targetIdx = firstHigherIdx !== -1 ? firstHigherIdx : 1;
    setCarouselIndex(targetIdx);
    setCurrentView("escolha-plano");
  };

  useEffect(() => {
    if (currentView === "escolha-plano" && carouselRef.current) {
      const timer = setTimeout(() => {
        if (!carouselRef.current) return;
        const { clientWidth } = carouselRef.current;
        const itemWidth = clientWidth * 0.85 + 12;
        carouselRef.current.scrollTo({
          left: carouselIndex * itemWidth,
          behavior: "auto",
        });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [currentView, carouselIndex]);

  // Pix Automático real gerado pela Woovi (subconta DUB)
  const [pixEmv, setPixEmv] = useState("");
  const [pixCorrelation, setPixCorrelation] = useState("");
  const [pixError, setPixError] = useState<string | null>(null);

  const createPixAutomatico = async () => {
    if (!selectedPlanForCheckout || !tenantId || selectedPlanForCheckout.isCustomPrice) return;
    if (!isCompliant && totalPendingCount > 0) {
      setShowPendingModal(true);
      return;
    }
    setIsActivating(true);
    setPixError(null);
    setPixEmv("");
    try {
      const { data, error } = await supabase.functions.invoke("create-tenant-plan-subscription", {
        body: { action: "create", tenantId, planName: selectedPlanForCheckout.name },
      });
      if (error || !data?.success) {
        let msg = data?.error as string | undefined;
        if (!msg && error && "context" in error) {
          try { msg = (await (error as any).context.json())?.error; } catch { /* ignore */ }
        }
        throw new Error(msg || "Não foi possível gerar o Pix Automático.");
      }
      setPixEmv(data.data.emv);
      setPixCorrelation(data.data.correlationID);
    } catch (err: any) {
      setPixError(err?.message || "Não foi possível gerar o Pix Automático.");
    } finally {
      setIsActivating(false);
    }
  };

  useEffect(() => {
    if (currentView === "checkout" && selectedPlanForCheckout) createPixAutomatico();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView, selectedPlanForCheckout?.id]);

  // Confere o pagamento no banco e libera o plano automaticamente
  useEffect(() => {
    if (!pixCorrelation || !tenantId || activationSuccess) return;
    const timer = setInterval(async () => {
      const { data } = await supabase.functions.invoke("create-tenant-plan-subscription", {
        body: { action: "status", tenantId, correlationID: pixCorrelation },
      });
      if (data?.paid) {
        clearInterval(timer);
        setActivationSuccess(true);
        subscription.refetch();
        toast.success("Pagamento confirmado. Seu plano foi liberado.");
        setTimeout(() => {
          setActivationSuccess(false);
          setPixEmv("");
          setPixCorrelation("");
          setCurrentView("meu-plano");
        }, 1800);
      }
    }, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixCorrelation, tenantId, activationSuccess]);

  const handleCopyPix = () => {
    if (!pixEmv) return;
    navigator.clipboard.writeText(pixEmv);
    setIsCopied(true);
    toast.success("Código Pix copiado.");
    setTimeout(() => setIsCopied(false), 2500);
  };

  return (
    <div className="min-h-full bg-background flex flex-col select-none">
      <AnimatePresence mode="wait">
        {/* ═══════════════════════════════════════════════════════════════════
            TELA 1: MEU PLANO (TELA PRINCIPAL)
            ═══════════════════════════════════════════════════════════════════ */}
        {currentView === "meu-plano" && (
          <motion.div
            key="view-meu-plano"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="flex-1 flex flex-col pb-16"
          >
            {/* Header oficial do sistema */}
            <ScheduleHeader title="Meu Plano" onBack={onBack} />

            <div className="px-4 py-5 max-w-md mx-auto w-full space-y-5">
              {/* Card Principal: Plano Atual */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="rounded-3xl border border-border/70 dark:border-white/10 bg-card p-5 sm:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.25)] space-y-4 relative"
              >
                {/* Topo do Card: Apenas a Coroa de Meta + Nome do Plano (ex: DUB Solo) + Ativo */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-[28px] leading-none shrink-0 select-none pt-0.5" aria-hidden="true">
                      👑
                    </span>
                    <span className="text-[19px] font-bold text-foreground leading-tight truncate">
                      {subscription.isExempt
                        ? "Barbearia DUB (Vitalício)"
                        : subscription.isTrial
                        ? "DUB Período Gratuito"
                        : `DUB ${subscription.planName || currentPlan.name}`}
                    </span>
                  </div>

                  {/* Status sem IA, limpo e direto */}
                  <span
                    className={cn(
                      "text-[13px] font-semibold tracking-tight shrink-0",
                      subscription.isBlocked
                        ? "text-destructive"
                        : subscription.isOverdue
                        ? "text-amber-500"
                        : subscription.isTrial
                        ? "text-blue-500"
                        : "text-emerald-600 dark:text-emerald-400"
                    )}
                  >
                    {subscription.isBlocked
                      ? "Bloqueado"
                      : subscription.isOverdue
                      ? "Em Atraso"
                      : subscription.isTrial
                      ? "Período de teste"
                      : "Ativo"}
                  </span>
                </div>

                {/* Dados do Plano Atual */}
                <div className="rounded-2xl bg-secondary/30 dark:bg-white/[0.03] border border-border/40 dark:border-white/[0.06] p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-muted-foreground flex items-center gap-1.5 font-normal">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground/80" />
                      Vencimento:
                    </span>
                    <span className="font-semibold text-foreground">
                      {formattedVencimento}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[13px] pt-1 border-t border-border/20 dark:border-white/[0.05]">
                    <span className="text-muted-foreground flex items-center gap-1.5 font-normal">
                      <Users className="w-3.5 h-3.5 text-muted-foreground/80" />
                      Capacidade:
                    </span>
                    <span className="font-semibold text-foreground">
                      {subscription.isExempt
                        ? "Sem limite de barbeiros"
                        : `${subscription.barbersAllowed || currentPlan.barbersLimit || 1} ${
                            (subscription.barbersAllowed || currentPlan.barbersLimit || 1) === 1
                              ? "barbeiro"
                              : "barbeiros"
                          }`}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[13px] pt-1 border-t border-border/20 dark:border-white/[0.05]">
                    <span className="text-muted-foreground flex items-center gap-1.5 font-normal">
                      <CreditCard className="w-3.5 h-3.5 text-muted-foreground/80" />
                      Valor mensal:
                    </span>
                    <span className="font-bold text-foreground">
                      {subscription.isExempt
                        ? "R$ 0,00"
                        : `R$ ${(subscription.priceMonthly || currentPlan.price).toFixed(2).replace(".", ",")} / mês`}
                    </span>
                  </div>
                </div>

                {/* Botão de Upgrade Estratégico (Abre Tela Inteira) */}
                <button
                  type="button"
                  onClick={handleOpenUpgradeScreen}
                  className="w-full h-12 rounded-2xl bg-foreground text-background font-bold text-[14px] flex items-center justify-center hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer shadow-sm"
                >
                  Fazer Upgrade de Plano
                </button>
              </motion.div>
            </div>
          </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            TELA 2: ESCOLHA SEU PLANO (TELA INTEIRA COM CARROSSEL)
            ═══════════════════════════════════════════════════════════════════ */}
        {currentView === "escolha-plano" && (
          <motion.div
            key="view-escolha-plano"
            initial={{ opacity: 0, x: 25 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -25 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="flex-1 flex flex-col justify-between min-h-dvh pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
          >
            {/* Header oficial da tela inteira */}
            <ScheduleHeader
              title="Escolha seu plano"
              onBack={() => setCurrentView("meu-plano")}
            />

            <div className="flex-1 flex flex-col justify-between max-w-md mx-auto w-full px-4 py-4 space-y-4">
              {/* Indicador de Páginas / Dots clicáveis */}
              <div className="flex items-center justify-between px-1">
                <span className="text-[11.5px] font-bold text-muted-foreground uppercase tracking-wider">
                  Plano {carouselIndex + 1} de {OFFICIAL_PLANS.length}
                </span>
                <div className="flex items-center gap-1.5">
                  {OFFICIAL_PLANS.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => scrollToIndex(idx)}
                      className={cn(
                        "h-1.5 rounded-full transition-all cursor-pointer",
                        idx === carouselIndex
                          ? "w-5 bg-foreground"
                          : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                      )}
                      aria-label={`Ir para plano ${idx + 1}`}
                    />
                  ))}
                </div>
              </div>

              {/* Trilho horizontal com Scroll Snap nativo (passar o dedo no mobile) */}
              <div
                ref={carouselRef}
                onScroll={handleCarouselScroll}
                className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar px-1 py-1 -mx-1"
                style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}
              >
                {OFFICIAL_PLANS.map((plan, idx) => {
                  const isCurrentInView = idx === carouselIndex;
                  const isUserActivePlan =
                    !subscription.isTrial &&
                    subscription.planName?.toLowerCase() === plan.name.toLowerCase();

                  return (
                    <div
                      key={plan.id}
                      onClick={() => scrollToIndex(idx)}
                      className={cn(
                        "w-[85vw] max-w-[340px] shrink-0 snap-center rounded-3xl border p-5 space-y-3.5 transition-all cursor-pointer",
                        isCurrentInView
                          ? "border-foreground/40 bg-card shadow-lg ring-1 ring-foreground/15 dark:border-white/20"
                          : "border-border/60 bg-card/60 opacity-65 hover:opacity-95"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-[19px] font-bold text-foreground">
                              DUB {plan.name}
                            </h4>
                            {isUserActivePlan ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                                Plano Atual
                              </span>
                            ) : plan.highlight ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary text-primary-foreground uppercase tracking-wide">
                                Recomendado
                              </span>
                            ) : null}
                          </div>
                          <p className="text-[12px] text-muted-foreground mt-0.5">
                            {plan.label}
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          {plan.isCustomPrice ? (
                            <div className="text-[16px] font-black text-foreground">
                              Sob Consulta
                            </div>
                          ) : (
                            <>
                              <div className="flex items-baseline justify-end gap-0.5">
                                <span className="text-[11px] text-muted-foreground font-semibold">R$</span>
                                <span className="text-[24px] font-black text-foreground tracking-tight">
                                  {plan.price.toFixed(2).replace(".", ",")}
                                </span>
                              </div>
                              <span className="text-[10px] text-muted-foreground font-medium block">
                                por mês
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <p className="text-[12.5px] text-foreground/80 leading-relaxed border-t border-border/20 pt-3">
                        {plan.description}
                      </p>

                      {/* Recursos do Plano */}
                      <div className="space-y-2 py-1">
                        {plan.features.map((feature, fIdx) => (
                          <div key={fIdx} className="flex items-center gap-2 text-[12px] text-foreground/90">
                            <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" strokeWidth={2.5} />
                            <span className="truncate">{feature}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* BOTÃO ASSINAR FIXO NO RODAPÉ DA TELA (SEM SETINHA, MINIMALISTA) */}
              <div className="pt-3">
                {isSelectedCurrent ? (
                  <button
                    type="button"
                    disabled
                    className="w-full h-12 rounded-2xl bg-secondary text-muted-foreground font-semibold text-[14px] flex items-center justify-center cursor-default opacity-80"
                  >
                    Seu plano atual
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (!isCompliant && totalPendingCount > 0) {
                        setShowPendingModal(true);
                        return;
                      }
                      setSelectedPlanForCheckout(activeCarouselPlan);
                      setCurrentView("checkout");
                    }}
                    className="w-full h-12 rounded-2xl bg-foreground text-background font-bold text-[14.5px] flex items-center justify-center hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer shadow-sm"
                  >
                    Assinar
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            TELA 3: ASSINATURA & PIX AUTOMÁTICO (SUBCTA DUB INTEGRADA)
            ═══════════════════════════════════════════════════════════════════ */}
        {currentView === "checkout" && selectedPlanForCheckout && (
          <motion.div
            key="view-checkout"
            initial={{ opacity: 0, x: 25 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -25 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="flex-1 flex flex-col justify-between min-h-dvh pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
          >
            {/* Header oficial */}
            <ScheduleHeader
              title="Assinatura DUB"
              onBack={() => setCurrentView("escolha-plano")}
            />

            <div className="flex-1 flex flex-col max-w-md mx-auto w-full px-4 py-6 space-y-6">
              <div className="flex items-center gap-3">
                <img src={logoDub} alt="DUB" className="w-11 h-11 rounded-2xl object-cover" />
                <div className="min-w-0">
                  <h4 className="text-[16px] font-bold text-foreground leading-tight">DUB Oficial</h4>
                  <p className="text-[12px] text-muted-foreground truncate">
                    {tenantNome} · Plano {selectedPlanForCheckout.name} · Mensal
                  </p>
                </div>
                <span className="ml-auto text-[16px] font-bold text-foreground whitespace-nowrap">
                  {selectedPlanForCheckout.isCustomPrice
                    ? "Sob consulta"
                    : `R$ ${selectedPlanForCheckout.price.toFixed(2).replace(".", ",")}`}
                </span>
              </div>

              {selectedPlanForCheckout.isCustomPrice ? (
                <p className="text-[13px] text-muted-foreground text-center">
                  Este plano é personalizado. Fale com a equipe DUB para contratar.
                </p>
              ) : (
                <div className="flex flex-col items-center gap-5">
                  <div className="w-full aspect-square max-w-[300px] rounded-3xl border border-border bg-card p-5 flex items-center justify-center">
                    {activationSuccess ? (
                      <CheckCircle2 className="w-20 h-20 text-foreground" />
                    ) : pixEmv ? (
                      <div className="w-full h-full rounded-2xl bg-background p-3 flex items-center justify-center">
                        <QRCodeSVG value={pixEmv} size={256} level="M" className="w-full h-full" />
                      </div>
                    ) : pixError ? (
                      <div className="text-center space-y-3 px-2">
                        <p className="text-[13px] text-muted-foreground">{pixError}</p>
                        <button
                          type="button"
                          onClick={createPixAutomatico}
                          className="h-10 px-5 rounded-full border border-border text-[13px] font-semibold text-foreground inline-flex items-center gap-2"
                        >
                          <RefreshCw className="w-4 h-4" /> Tentar novamente
                        </button>
                      </div>
                    ) : (
                      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    )}
                  </div>

                  {activationSuccess && (
                    <p className="text-[14px] font-semibold text-foreground">Pagamento confirmado. Plano liberado.</p>
                  )}

                  {pixEmv && !activationSuccess && (
                    <button
                      type="button"
                      onClick={handleCopyPix}
                      className="w-full h-[52px] rounded-full bg-foreground text-background font-semibold text-[14px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                    >
                      {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {isCopied ? "Código copiado" : "Copiar código Pix"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ MODAL EXECUTIVO DE BLOQUEIO PROATIVO: DADOS PENDENTES DA BARBEARIA ═══ */}
      <AnimatePresence>
        {showPendingModal && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm">
            <div className="absolute inset-0" onClick={() => setShowPendingModal(false)} />
            <motion.div
              initial={{ y: "100%", opacity: 0.5 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
              className="relative w-full sm:max-w-md rounded-t-[32px] sm:rounded-3xl border border-border/80 dark:border-white/10 bg-card p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto pb-[calc(2rem+env(safe-area-inset-bottom))]"
            >
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto -mt-2 mb-3 sm:hidden shrink-0" />

              <div className="flex items-start justify-between gap-3">
                <div className="w-11 h-11 rounded-2xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center text-rose-500 shrink-0">
                  <AlertCircle className="w-6 h-6 stroke-[2.2]" />
                </div>
                <button
                  type="button"
                  onClick={() => setShowPendingModal(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-95 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <h3 className="text-[19px] font-bold text-foreground tracking-tight leading-tight">
                  Complete seus dados antes de assinar
                </h3>
                <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed">
                  Para ativar sua assinatura no Pix Automático, preencha os dados obrigatórios da sua barbearia (Documento, Contato e Endereço com CEP).
                </p>
              </div>

              {/* Lista dos campos faltantes */}
              <div className="rounded-2xl border border-rose-500/25 bg-rose-500/[0.05] dark:bg-rose-500/[0.1] p-4 space-y-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  Dados obrigatórios pendentes ({missingFieldNames.length}):
                </p>
                <ul className="space-y-1.5">
                  {missingFieldNames.map((field, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-[12.5px] text-foreground font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                      <span>{field}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Botões de Ação */}
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPendingModal(false);
                    navigate("/barbeiro/dados-empresa");
                  }}
                  className="h-[52px] rounded-full w-full bg-foreground text-background font-medium text-[14px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all hover:opacity-90 shadow-md cursor-pointer"
                >
                  <span>Preencher dados agora</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowPendingModal(false)}
                  className="w-full h-10 rounded-full text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  Voltar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

export default BarberMeuPlano;
