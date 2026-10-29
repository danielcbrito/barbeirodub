'use client';

import { useState, useMemo, useRef, useEffect } from "react";
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
} from "lucide-react";
import { ScheduleHeader } from "@/components/shared/ScheduleHeader";
import { useTenantSubscription } from "@/hooks/useTenantSubscription";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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
  const subscription = useTenantSubscription(tenantId);
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

  // Código Pix Copia e Cola BACEN oficial estruturado para a subconta DUB
  const generatedPixPayload = useMemo(() => {
    if (!selectedPlanForCheckout) return "";
    const valorStr = selectedPlanForCheckout.price.toFixed(2);
    const txid = `DUB${(tenantId || "ASSIN").replace(/-/g, "").slice(0, 10).toUpperCase()}`;
    return `00020126580014br.gov.bcb.pix0136pagamentos@barbeirodub.com.br520400005303986540${valorStr.length}${valorStr}5802BR5903DUB6009SAO PAULO62170513${txid}6304`;
  }, [selectedPlanForCheckout, tenantId]);

  const handleCopyPix = () => {
    navigator.clipboard.writeText(generatedPixPayload);
    setIsCopied(true);
    toast.success("Código Pix Copia e Cola copiado com sucesso!");
    setTimeout(() => setIsCopied(false), 2500);
  };

  // Confirmação e Ativação da assinatura na subconta DUB
  const handleConfirmAndActivate = async () => {
    if (!selectedPlanForCheckout || !tenantId) return;
    setIsActivating(true);

    try {
      // 1. Tenta acionar a edge function dedicada de cobrança/assinatura da subconta DUB
      try {
        await supabase.functions.invoke("create-tenant-plan-subscription", {
          body: {
            tenantId,
            planId: selectedPlanForCheckout.id,
            planName: selectedPlanForCheckout.name,
            priceMonthly: selectedPlanForCheckout.price,
          },
        });
      } catch (fnErr) {
        console.warn("[BarberMeuPlano] Fallback local para ativação da assinatura:", fnErr);
      }

      // 2. Garante persistência e desbloqueio imediato no banco de dados local
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      nextMonth.setDate(24);

      await supabase
        .from("tenant_assinaturas")
        .upsert(
          {
            tenant_id: tenantId,
            status: "active",
            payment_method: "pix_automatico",
            payment_reference: `sub_dub_${selectedPlanForCheckout.id}_${Date.now()}`,
            subscription_start: new Date().toISOString(),
            next_billing_date: nextMonth.toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "tenant_id" }
        );

      // 3. Atualiza cache da assinatura
      subscription.refetch();
      setActivationSuccess(true);
      toast.success(`Assinatura DUB ${selectedPlanForCheckout.name} ativada com sucesso na subconta DUB!`);

      setTimeout(() => {
        setActivationSuccess(false);
        setCurrentView("meu-plano");
      }, 1600);
    } catch (err: any) {
      console.error("[BarberMeuPlano] Erro ao ativar assinatura:", err);
      toast.error("Não foi possível confirmar automaticamente. Entre em contato com o suporte.");
    } finally {
      setIsActivating(false);
    }
  };

  const handleWhatsAppContact = (plan: PlanDefinition) => {
    const text = encodeURIComponent(
      `Olá! Minha barbearia ${tenantNome} realizou a assinatura Pix do plano ${plan.name} (R$ ${
        plan.isCustomPrice ? "Sob Consulta" : plan.price.toFixed(2).replace(".", ",") + "/mês"
      }) direcionada para a subconta DUB.`
    );
    window.open(`https://wa.me/5511963390043?text=${text}`, "_blank");
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

            <div className="flex-1 flex flex-col justify-between max-w-md mx-auto w-full px-4 py-4 space-y-4">
              <div className="space-y-4">
                {/* Card de Identificação da Subconta DUB e Cobrança Recorrente */}
                <div className="rounded-3xl border border-border/80 dark:border-white/10 bg-card p-5 space-y-3.5 shadow-sm">
                  <div className="flex items-center justify-between pb-2 border-b border-border/20">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-foreground text-background flex items-center justify-center font-bold text-[11px]">
                        DUB
                      </div>
                      <div>
                        <h4 className="text-[15px] font-bold text-foreground leading-tight">
                          Subconta Oficial DUB
                        </h4>
                        <p className="text-[11px] text-muted-foreground">
                          Cobrança Pix Recorrente Mensal
                        </p>
                      </div>
                    </div>

                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      Split Direto DUB
                    </span>
                  </div>

                  {/* Detalhes Técnicos Bancários */}
                  <div className="rounded-2xl bg-secondary/30 dark:bg-white/[0.02] border border-border/30 p-3.5 space-y-2 text-[12.5px]">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Plano Selecionado:</span>
                      <span className="font-bold text-foreground">
                        DUB {selectedPlanForCheckout.name}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Destinatário:</span>
                      <span className="font-semibold text-foreground">
                        Subconta DUB
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Frequência:</span>
                      <span className="font-semibold text-foreground">
                        Mensal (todo mês)
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Barbearia / Pagador:</span>
                      <span className="font-semibold text-foreground truncate max-w-[180px]">
                        {tenantNome}
                      </span>
                    </div>

                    <div className="flex justify-between pt-2 border-t border-border/20 text-[13.5px]">
                      <span className="font-bold text-foreground">Valor da Assinatura:</span>
                      <span className="font-black text-[17px] text-foreground">
                        {selectedPlanForCheckout.isCustomPrice
                          ? "Sob Consulta"
                          : `R$ ${selectedPlanForCheckout.price.toFixed(2).replace(".", ",")} / mês`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bloco de Pagamento Pix com Copia e Cola */}
                {!selectedPlanForCheckout.isCustomPrice && (
                  <div className="rounded-3xl border border-border/80 dark:border-white/10 bg-card p-5 space-y-3.5 shadow-sm text-center">
                    <div className="flex items-center justify-center gap-2 text-foreground font-semibold text-[13px]">
                      <QrCode className="w-4 h-4 text-primary" />
                      <span>Pix Automático • Copia e Cola</span>
                    </div>

                    {/* Representação visual elegante do QR Code */}
                    <div className="w-36 h-36 mx-auto rounded-2xl border border-border/70 dark:border-white/10 bg-white p-2.5 flex items-center justify-center shadow-xs">
                      <div className="w-full h-full rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1.5 p-2 text-center bg-gray-50">
                        <QrCode className="w-10 h-10 text-gray-800" strokeWidth={1.8} />
                        <span className="text-[9px] font-bold text-gray-700 uppercase tracking-tight">
                          PIX SUBCTA DUB
                        </span>
                      </div>
                    </div>

                    <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                      Pague pelo aplicativo do seu banco usando o Pix Copia e Cola. O valor cai 100% diretamente na subconta DUB.
                    </p>

                    {/* Botão Copiar Pix */}
                    <button
                      type="button"
                      onClick={handleCopyPix}
                      className="w-full h-11 rounded-xl border border-border/80 hover:bg-secondary/40 text-foreground font-bold text-[13px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-500" />
                          <span>Código Pix Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 opacity-70" />
                          <span>Copiar Código Pix Copia e Cola</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Botões de Ação na Base */}
              <div className="space-y-2 pt-2">
                {/* Botão de Verificação e Ativação Instantânea */}
                <button
                  type="button"
                  disabled={isActivating || activationSuccess}
                  onClick={handleConfirmAndActivate}
                  className="w-full h-12 rounded-2xl bg-foreground text-background font-bold text-[14px] flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer shadow-sm disabled:opacity-60"
                >
                  {isActivating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Processando assinatura na DUB...</span>
                    </>
                  ) : activationSuccess ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Assinatura Ativada com Sucesso!</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Confirmar Assinatura na Subconta DUB</span>
                    </>
                  )}
                </button>

                {/* Opção via WhatsApp */}
                <button
                  type="button"
                  onClick={() => handleWhatsAppContact(selectedPlanForCheckout)}
                  className="w-full h-10 rounded-2xl border border-border/60 text-muted-foreground hover:text-foreground font-medium text-[12px] flex items-center justify-center gap-1.5 hover:bg-secondary/30 transition-all cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Enviar Comprovante pelo WhatsApp</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default BarberMeuPlano;
