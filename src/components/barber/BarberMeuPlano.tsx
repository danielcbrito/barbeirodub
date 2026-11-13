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
  QrCode,
  MessageSquare,
  Clock,
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { ScheduleHeader } from "@/components/shared/ScheduleHeader";
import { useTenantSubscription } from "@/hooks/useTenantSubscription";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { invokeAuthenticatedFunction } from "@/lib/invokeAuthenticatedFunction";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import pixLogo from "@/assets/pix-logo.png";

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

type PlanFunctionResponse = {
  success: boolean;
  paid?: boolean;
  status?: string;
  error?: string;
  missingFields?: string[];
  data?: { correlationID?: string; emv?: string; paymentLinkUrl?: string; amount?: number };
};

class PlanCheckoutError extends Error {
  missingFields: string[];

  constructor(message: string, missingFields: string[] = []) {
    super(message);
    this.name = "PlanCheckoutError";
    this.missingFields = missingFields;
  }
}

async function invokePlanSubscription(body: Record<string, unknown>) {
  const { data, error } = await invokeAuthenticatedFunction<PlanFunctionResponse>(
    "create-tenant-plan-subscription",
    { body },
  );

  if (error instanceof FunctionsHttpError) {
    const response = await error.context.json().catch(() => null) as PlanFunctionResponse | null;
    throw new PlanCheckoutError(
      response?.error || "Não foi possível comunicar com o servidor de pagamento.",
      response?.missingFields || [],
    );
  }
  if (error) throw error;
  if (!data?.success) {
    throw new PlanCheckoutError(
      data?.error || "Não foi possível processar a assinatura.",
      data?.missingFields || [],
    );
  }
  return data;
}

export function BarberMeuPlano({ tenantId, tenantNome = "Sua Barbearia", onBack }: BarberMeuPlanoProps) {
  const navigate = useNavigate();
  const subscription = useTenantSubscription(tenantId);
  const { totalPendingCount, isCompliant, missingFieldNames } = useBarbershopPendingFields(tenantId);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [serverMissingFields, setServerMissingFields] = useState<string[]>([]);
  const displayedMissingFields = serverMissingFields.length > 0 ? serverMissingFields : missingFieldNames;
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

  // O checkout só cria uma cobrança depois que o usuário escolhe e confirma o método.
  const [paymentMethodTab, setPaymentMethodTab] = useState<"pix" | "cartao">("pix");
  const [pixEmv, setPixEmv] = useState("");
  const [paymentCorrelation, setPaymentCorrelation] = useState("");
  const [pixError, setPixError] = useState<string | null>(null);
  const [cardPaymentUrl, setCardPaymentUrl] = useState("");
  const [cardError, setCardError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
  }, []);

  const handleSuccessActivation = () => {
    setActivationSuccess(true);
    subscription.refetch();
    toast.success("Assinatura confirmada! Seu plano foi ativado.");
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => {
      setActivationSuccess(false);
      setPixEmv("");
      setCardPaymentUrl("");
      setPaymentCorrelation("");
      setCurrentView("meu-plano");
    }, 1800);
  };

  const createPixAutomatico = async () => {
    if (!selectedPlanForCheckout || !tenantId || selectedPlanForCheckout.isCustomPrice) return;
    if (!isCompliant && totalPendingCount > 0) {
      setShowPendingModal(true);
      return;
    }

    setIsActivating(true);
    setServerMissingFields([]);
    setPixError(null);
    setCardError(null);
    setPixEmv("");
    setCardPaymentUrl("");
    setPaymentCorrelation("");
    try {
      const response = await invokePlanSubscription({
        action: "create",
        tenantId,
        planName: selectedPlanForCheckout.name,
        paymentMethod: "pix_automatico",
      });
      if (!response.data?.emv || !response.data.correlationID) {
        throw new Error("Não foi possível retornar o QR Code Pix. Tente novamente.");
      }
      setPixEmv(response.data.emv);
      setPaymentCorrelation(response.data.correlationID);
    } catch (error) {
      if (error instanceof PlanCheckoutError && error.missingFields.length > 0) {
        setServerMissingFields(error.missingFields);
        setShowPendingModal(true);
      }
      setPixError(error instanceof Error ? error.message : "Não foi possível gerar o Pix Automático.");
    } finally {
      setIsActivating(false);
    }
  };

  const createCardPayment = async () => {
    if (!selectedPlanForCheckout || !tenantId || selectedPlanForCheckout.isCustomPrice) return;
    if (!isCompliant && totalPendingCount > 0) {
      setShowPendingModal(true);
      return;
    }

    setIsActivating(true);
    setServerMissingFields([]);
    setCardError(null);
    setPixError(null);
    setPixEmv("");
    setCardPaymentUrl("");
    setPaymentCorrelation("");
    try {
      const response = await invokePlanSubscription({
        action: "create",
        tenantId,
        planName: selectedPlanForCheckout.name,
        paymentMethod: "credit_card",
      });
      if (!response.data?.paymentLinkUrl || !response.data.correlationID) {
        throw new Error("Não foi possível gerar a página de pagamento. Tente novamente.");
      }
      setCardPaymentUrl(response.data.paymentLinkUrl);
      setPaymentCorrelation(response.data.correlationID);
    } catch (error) {
      if (error instanceof PlanCheckoutError && error.missingFields.length > 0) {
        setServerMissingFields(error.missingFields);
        setShowPendingModal(true);
      }
      setCardError(error instanceof Error ? error.message : "Não foi possível gerar o pagamento no cartão.");
    } finally {
      setIsActivating(false);
    }
  };

  // A tela apenas consulta: a liberação acontece no serviço após revalidação na Woovi.
  useEffect(() => {
    if (!paymentCorrelation || !tenantId || activationSuccess) return;
    let stopped = false;
    let checking = false;

    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        const response = await invokePlanSubscription({
          action: "status",
          tenantId,
          correlationID: paymentCorrelation,
        });
        if (!stopped && response.paid) handleSuccessActivation();
      } catch {
        // O webhook pode liberar primeiro; a próxima consulta tenta novamente.
      } finally {
        checking = false;
      }
    };

    void check();
    const timer = setInterval(() => void check(), 4500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentCorrelation, tenantId, activationSuccess]);

  const handleCopyPix = async () => {
    if (!pixEmv) return;
    try {
      await navigator.clipboard.writeText(pixEmv);
      setIsCopied(true);
      toast.success("Código Pix copiado! Cole no aplicativo do seu banco.");
      setTimeout(() => setIsCopied(false), 2500);
    } catch {
      toast.error("Não foi possível copiar. Selecione o código manualmente.");
    }
  };

  const handleConfirmManualPayment = async () => {
    if (!tenantId || !paymentCorrelation) return;
    setIsVerifying(true);
    try {
      const response = await invokePlanSubscription({
        action: "status",
        tenantId,
        correlationID: paymentCorrelation,
      });
      if (response.paid) {
        handleSuccessActivation();
      } else {
        toast.info(paymentMethodTab === "cartao"
          ? "O pagamento no cartão ainda não foi identificado. Conclua o pagamento e tente novamente."
          : "Ainda não identificamos a autorização. Autorize o Pix Automático no seu banco e tente novamente.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível verificar agora.");
    } finally {
      setIsVerifying(false);
    }
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
                        : `${subscription.barbersAllowed || currentPlan.barbersLimit || 1} ${(subscription.barbersAllowed || currentPlan.barbersLimit || 1) === 1
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
                      setServerMissingFields([]);
                      setPixEmv("");
                      setCardPaymentUrl("");
                      setPaymentCorrelation("");
                      setPixError(null);
                      setCardError(null);
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
            TELA 3: ASSINATURA & PAGAMENTO (PIX & CARTÃO • SUBCONTA DUB)
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
            {/* Header oficial do sistema */}
            <ScheduleHeader
              title="Assinatura DUB"
              onBack={() => setCurrentView("escolha-plano")}
            />

            <div className="flex-1 flex flex-col max-w-md mx-auto w-full px-4 py-5 space-y-5">
              {/* Card Resumo do Plano Contratado */}
              <div className="rounded-2xl border border-border/70 dark:border-white/10 bg-card p-4 flex items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-secondary/60 dark:bg-white/[0.06] border border-border/50 dark:border-white/10 flex items-center justify-center shrink-0">
                    <img
                      src="/auth-assets/dub_logo_d.png"
                      alt="D"
                      className="h-6 w-auto object-contain block dark:invert select-none"
                      draggable={false}
                    />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-[15px] font-bold text-foreground leading-tight">
                      DUB Oficial
                    </h4>
                    <p className="text-[12px] text-muted-foreground truncate">
                      {tenantNome} · Plano {selectedPlanForCheckout.name}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[17px] font-black text-foreground whitespace-nowrap block">
                    {selectedPlanForCheckout.isCustomPrice
                      ? "Sob consulta"
                      : `R$ ${selectedPlanForCheckout.price.toFixed(2).replace(".", ",")}`}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider block">
                    Mensal
                  </span>
                </div>
              </div>

              {selectedPlanForCheckout.isCustomPrice ? (
                <div className="rounded-2xl border border-border bg-card p-6 text-center space-y-3">
                  <p className="text-[14px] text-muted-foreground leading-relaxed">
                    Este plano é corporativo e personalizado sob demanda.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const msg = encodeURIComponent(
                        `Olá! Gostaria de contratar o plano Enterprise para a barbearia ${tenantNome}.`
                      );
                      window.open(`https://wa.me/5511952263002?text=${msg}`, "_blank");
                    }}
                    className="h-12 px-6 rounded-2xl bg-foreground text-background font-semibold text-[14px] inline-flex items-center justify-center gap-2 hover:opacity-90 active:scale-98 transition-all cursor-pointer"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>Falar com especialista DUB</span>
                  </button>
                </div>
              ) : (
                <>
                  {/* Seletor de Método de Pagamento: Pix Automático (com símbolo do Pix) ou Cartão */}
                  <div className="grid grid-cols-2 p-1 rounded-2xl bg-secondary/50 border border-border/40">
                    <button
                      type="button"
                      onClick={() => setPaymentMethodTab("pix")}
                      className={cn(
                        "h-10 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer",
                        paymentMethodTab === "pix"
                          ? "bg-foreground text-background shadow-xs font-bold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <img
                        src={pixLogo}
                        alt="Pix"
                        className={cn(
                          "w-4 h-4 object-contain shrink-0",
                          paymentMethodTab === "pix" ? "brightness-0 invert dark:brightness-100 dark:invert-0" : ""
                        )}
                      />
                      <span>Pix Automático</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethodTab("cartao")}
                      className={cn(
                        "h-10 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                        paymentMethodTab === "cartao"
                          ? "bg-foreground text-background shadow-xs font-bold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>Cartão de Crédito</span>
                    </button>
                  </div>

                  {/* ─── PIX AUTOMÁTICO: autorização + primeiro pagamento ─── */}
                  {paymentMethodTab === "pix" && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18 }}
                      className="flex flex-col items-center gap-4"
                    >
                      {activationSuccess ? (
                        <div className="w-full rounded-3xl border border-border/70 bg-card p-8 text-center space-y-3">
                          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" strokeWidth={2.2} />
                          <p className="text-[15px] font-bold text-foreground">Assinatura ativada!</p>
                          <p className="text-[12px] text-muted-foreground">Seu acesso já foi liberado.</p>
                        </div>
                      ) : !pixEmv ? (
                        <div className="w-full rounded-3xl border border-border/70 bg-card p-5 space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                              <img src={pixLogo} alt="Pix" className="w-5 h-5 object-contain" />
                            </div>
                            <div>
                              <h4 className="text-[15px] font-bold text-foreground">Pix Automático</h4>
                              <p className="text-[12px] text-muted-foreground">Recorrência mensal automática e segura</p>
                            </div>
                          </div>
                          <div className="space-y-2 text-[12.5px] text-foreground/85">
                            <div className="flex items-center gap-2">
                              <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                              <span>Primeiro pagamento e autorização no mesmo QR Code</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                              <span>Débito mensal automático na data de vencimento</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                              <span>Acesso liberado imediatamente após a confirmação</span>
                            </div>
                          </div>
                          {pixError && (
                            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-3 text-[12px] text-destructive leading-relaxed" role="alert">
                              {pixError}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={createPixAutomatico}
                            disabled={isActivating}
                            className="w-full h-[54px] rounded-full bg-foreground text-background font-bold text-[15px] flex items-center justify-center gap-2.5 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 cursor-pointer shadow-sm"
                          >
                            {isActivating ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <img
                                src={pixLogo}
                                alt="Pix"
                                className="w-4 h-4 object-contain brightness-0 invert dark:brightness-100 dark:invert-0"
                              />
                            )}
                            <span>{isActivating ? "Gerando assinatura..." : pixError ? "Tentar novamente" : "Gerar Pix Automático"}</span>
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="w-full aspect-square max-w-[280px] rounded-3xl border border-border/70 bg-card p-5 flex items-center justify-center shadow-sm">
                            <div className="w-full h-full rounded-2xl bg-white p-3 flex items-center justify-center">
                              <QRCodeSVG value={pixEmv} size={256} level="M" className="w-full h-full" />
                            </div>
                          </div>
                          <p className="text-[12px] text-muted-foreground text-center leading-relaxed">
                            Abra o app do seu banco e autorize o Pix Automático. A primeira mensalidade será paga nessa autorização.
                          </p>
                          <div className="w-full space-y-2.5 pt-1">
                            <button
                              type="button"
                              onClick={handleCopyPix}
                              className="w-full h-[54px] rounded-full bg-foreground text-background font-semibold text-[15px] flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer shadow-sm"
                            >
                              {isCopied ? (
                                <Check className="w-5 h-5 text-emerald-400" />
                              ) : (
                                <img
                                  src={pixLogo}
                                  alt="Pix"
                                  className="w-4 h-4 object-contain brightness-0 invert dark:brightness-100 dark:invert-0"
                                />
                              )}
                              <span>{isCopied ? "Código copiado!" : "Copiar código Pix"}</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleConfirmManualPayment}
                              disabled={isVerifying}
                              className="w-full h-11 rounded-full text-[13px] font-medium text-foreground hover:bg-secondary/40 border border-border/50 flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
                            >
                              <RefreshCw className={cn("w-4 h-4", isVerifying && "animate-spin")} />
                              <span>{isVerifying ? "Consultando confirmação..." : "Já autorizei no meu banco"}</span>
                            </button>
                          </div>
                        </>
                      )}
                    </motion.div>
                  )}

                  {/* Cartão usa a página segura da Woovi e confirmação bancária real. */}
                  {paymentMethodTab === "cartao" && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18 }}
                      className="rounded-3xl border border-border/70 bg-card p-5 space-y-4"
                    >
                      {activationSuccess ? (
                        <div className="w-full py-6 text-center space-y-3">
                          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" strokeWidth={2.2} />
                          <p className="text-[15px] font-bold text-foreground">Plano ativado!</p>
                          <p className="text-[12px] text-muted-foreground">Pagamento confirmado com sucesso.</p>
                        </div>
                      ) : (
                        <>
                          <div className="space-y-1.5">
                            <h4 className="text-[15px] font-bold text-foreground">Pagamento mensal no cartão</h4>
                            <p className="text-[12.5px] text-muted-foreground leading-relaxed">
                              O pagamento é concluído em ambiente seguro e o plano é liberado após a confirmação. Para renovação automática, utilize o Pix Automático.
                            </p>
                          </div>
                          <div className="flex items-start gap-2 text-[12px] text-muted-foreground leading-relaxed">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>No cartão, cada mensalidade exige um novo pagamento.</span>
                          </div>
                          {cardError && (
                            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-3 text-[12px] text-destructive leading-relaxed" role="alert">
                              {cardError}
                            </div>
                          )}
                          {!cardPaymentUrl ? (
                            <button
                              type="button"
                              onClick={createCardPayment}
                              disabled={isActivating}
                              className="w-full h-[54px] rounded-full bg-foreground text-background font-bold text-[15px] flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 cursor-pointer"
                            >
                              {isActivating && <Loader2 className="w-4 h-4 animate-spin" />}
                              <span>{isActivating ? "Gerando pagamento..." : cardError ? "Tentar novamente" : "Pagar com cartão"}</span>
                            </button>
                          ) : (
                            <div className="space-y-2.5">
                              <a
                                href={cardPaymentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full h-[54px] rounded-full bg-foreground text-background font-bold text-[15px] flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all"
                              >
                                <CreditCard className="w-5 h-5" />
                                <span>Abrir pagamento seguro</span>
                              </a>
                              <button
                                type="button"
                                onClick={handleConfirmManualPayment}
                                disabled={isVerifying}
                                className="w-full h-11 rounded-full text-[13px] font-medium text-foreground hover:bg-secondary/40 border border-border/50 flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
                              >
                                <RefreshCw className={cn("w-4 h-4", isVerifying && "animate-spin")} />
                                <span>{isVerifying ? "Consultando confirmação..." : "Já concluí o pagamento"}</span>
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </motion.div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ GAVETA EXECUTIVA DE PENDÊNCIAS CADASTRAIS (PADRÃO DUB SYSTEM) ═══ */}
      <AnimatePresence>
        {showPendingModal && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm">
            <div className="absolute inset-0" onClick={() => setShowPendingModal(false)} />
            <motion.div
              initial={{ y: "100%", opacity: 0.5 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
              className="relative w-full sm:max-w-md rounded-t-[32px] sm:rounded-3xl border border-border/70 dark:border-white/10 bg-card p-6 shadow-2xl space-y-5 max-h-[85vh] overflow-y-auto pb-[calc(1.75rem+env(safe-area-inset-bottom))]"
            >
              {/* Handle sutil de gaveta */}
              <div className="w-10 h-1 rounded-full bg-muted-foreground/20 mx-auto -mt-2 mb-1 sm:hidden shrink-0" />

              {/* Título e Descrição com hierarquia tipográfica precisa (24px bold + 15px regular) */}
              <div>
                <h3 className="text-[24px] font-bold text-foreground tracking-tight leading-tight">
                  Complete seus dados antes de assinar
                </h3>
                <p className="text-[15px] font-normal text-muted-foreground leading-relaxed mt-2.5">
                  Para ativar a assinatura automática do seu plano, precisamos de algumas informações essenciais da sua barbearia.
                </p>
              </div>

              {/* Bloco de informações pendentes refinado (fundo e borda discretos, sem aspecto de erro agressivo) */}
              <div className="rounded-2xl border border-rose-500/15 bg-rose-500/[0.03] dark:bg-rose-500/[0.06] p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-foreground/85">
                    Informações pendentes
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[12px] font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400">
                    {displayedMissingFields.length} {displayedMissingFields.length === 1 ? "pendente" : "pendentes"}
                  </span>
                </div>

                <ul className="space-y-2.5 pt-1">
                  {displayedMissingFields.map((field, idx) => (
                    <li key={idx} className="flex items-center gap-2.5 text-[14px] text-foreground font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500/80 shrink-0" />
                      <span>{field}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Ações: Botão principal refinado (56px, rounded-28px, 16px semibold) e ação de retorno clara */}
              <div className="space-y-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPendingModal(false);
                    setServerMissingFields([]);
                    navigate("/barbeiro/dados-empresa");
                  }}
                  className="h-14 rounded-[28px] w-full bg-foreground text-background font-semibold text-[16px] flex items-center justify-center active:scale-[0.98] transition-all hover:opacity-90 shadow-xs cursor-pointer"
                >
                  <span>Preencher dados agora</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowPendingModal(false)}
                  className="w-full h-11 rounded-full text-[14px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
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
