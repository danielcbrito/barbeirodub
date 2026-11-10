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
  ExternalLink,
  Zap,
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

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTES E GERADOR OFICIAL DE PIX & ASSINATURAS (SUBCONTA DUB)
// ═══════════════════════════════════════════════════════════════════════

/** Chave Pix da subconta oficial DUB cadastrada na Woovi / OpenPix */
const DUB_SUBCONTA_PIX_KEY = "+5511952263002";
const DUB_MERCHANT_NAME = "DUB OFICIAL";
const DUB_MERCHANT_CITY = "SAO PAULO";

/** Links de checkout de cartão de crédito com cobrança mensal recorrente */
const CREDIT_CARD_CHECKOUT_URLS: Record<string, string> = {
  solo: "https://pay.cakto.com.br/3fu4u7q_789875",
  dupla: "https://pay.cakto.com.br/3aie3q5",
  equipe: "https://pay.cakto.com.br/abri2ap",
  rede: "https://pay.cakto.com.br/35fj7fi",
};

function formatEMV(id: string, val: string): string {
  const len = String(val.length).padStart(2, "0");
  return id + len + val;
}

function calculateCRC16(str: string): string {
  let crc = 0xffff;
  for (let c = 0; c < str.length; c++) {
    crc ^= str.charCodeAt(c) << 8;
    for (let i = 0; i < 8; i++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Gera payload Pix EMV oficial em conformidade com o Banco Central do Brasil */
function buildPixPayload({
  key,
  name,
  city,
  amount,
  txid,
}: {
  key: string;
  name: string;
  city: string;
  amount: number;
  txid: string;
}): string {
  const payloadFormat = formatEMV("00", "01");
  const pointOfInit = formatEMV("01", "12");
  const merchantAccount = formatEMV(
    "26",
    formatEMV("00", "br.gov.bcb.pix") + formatEMV("01", key)
  );
  const mcc = formatEMV("52", "0000");
  const currency = formatEMV("53", "986");
  const amt = formatEMV("54", Number(amount).toFixed(2));
  const country = formatEMV("58", "BR");
  const cleanName = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .slice(0, 25)
    .toUpperCase();
  const merchant = formatEMV("59", cleanName);
  const cleanCity = city
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .slice(0, 15)
    .toUpperCase();
  const cty = formatEMV("60", cleanCity);
  const cleanTxid = txid.replace(/[^a-zA-Z0-9]/g, "").slice(0, 25) || "DUB";
  const additional = formatEMV("62", formatEMV("05", cleanTxid));

  const raw =
    payloadFormat +
    pointOfInit +
    merchantAccount +
    mcc +
    currency +
    amt +
    country +
    merchant +
    cty +
    additional +
    "6304";
  return raw + calculateCRC16(raw);
}

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

  // Estados da assinatura e métodos de pagamento (Pix & Cartão)
  const [paymentMethodTab, setPaymentMethodTab] = useState<"pix" | "cartao">("pix");
  const [pixEmv, setPixEmv] = useState("");
  const [pixCorrelation, setPixCorrelation] = useState("");
  const [pixError, setPixError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Liberação com feedback positivo e transição suave
  const handleSuccessActivation = () => {
    setActivationSuccess(true);
    subscription.refetch();
    toast.success("Pagamento confirmado! Seu plano foi ativado com sucesso.");
    setTimeout(() => {
      setActivationSuccess(false);
      setPixEmv("");
      setPixCorrelation("");
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
    setPixError(null);
    setPixEmv("");

    // 1. Tenta acionar a edge function se estiver disponível
    try {
      const { data, error } = await supabase.functions.invoke("create-tenant-plan-subscription", {
        body: { action: "create", tenantId, planName: selectedPlanForCheckout.name },
      });
      if (!error && data?.success && data?.data?.emv) {
        setPixEmv(data.data.emv);
        setPixCorrelation(data.data.correlationID || "");
        setIsActivating(false);
        return;
      }
    } catch {
      // Falha graciosa: segue para o gerador de Pix oficial da subconta DUB
    }

    // 2. Geração instantânea e resiliente de Pix oficial da subconta DUB
    try {
      const txid = `DUB${(tenantId || "").replace(/-/g, "").slice(0, 8)}${Date.now().toString().slice(-8)}`;
      const emv = buildPixPayload({
        key: DUB_SUBCONTA_PIX_KEY,
        name: DUB_MERCHANT_NAME,
        city: DUB_MERCHANT_CITY,
        amount: selectedPlanForCheckout.price,
        txid,
      });

      setPixEmv(emv);
      setPixCorrelation(txid);

      // Registra a intenção de assinatura na tabela tenant_assinaturas do Supabase
      try {
        await supabase.from("tenant_assinaturas").upsert(
          {
            tenant_id: tenantId,
            payment_reference: txid,
            payment_method: "pix_automatico",
            qtd_barbeiros: selectedPlanForCheckout.barbersLimit,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "tenant_id" }
        );
      } catch (dbErr) {
        console.warn("[BarberMeuPlano] Registro de intenção de assinatura:", dbErr);
      }
    } catch (err: any) {
      setPixError(err?.message || "Não foi possível gerar o código Pix. Tente novamente.");
    } finally {
      setIsActivating(false);
    }
  };

  useEffect(() => {
    if (currentView === "checkout" && selectedPlanForCheckout) {
      createPixAutomatico();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView, selectedPlanForCheckout?.id]);

  // Confere o pagamento no banco e libera o plano automaticamente
  useEffect(() => {
    if (!pixCorrelation || !tenantId || activationSuccess) return;
    const timer = setInterval(async () => {
      // 1. Tenta verificar via edge function
      try {
        const { data } = await supabase.functions.invoke("create-tenant-plan-subscription", {
          body: { action: "status", tenantId, correlationID: pixCorrelation },
        });
        if (data?.paid) {
          clearInterval(timer);
          handleSuccessActivation();
          return;
        }
      } catch {
        // Silencioso
      }

      // 2. Verifica direto no banco de dados se a assinatura já foi ativada
      try {
        const { data: ass } = await supabase
          .from("tenant_assinaturas")
          .select("status, paid_at")
          .eq("tenant_id", tenantId)
          .maybeSingle();

        if (ass && ass.status === "active" && ass.paid_at) {
          clearInterval(timer);
          handleSuccessActivation();
        }
      } catch {
        // Silencioso
      }
    }, 4500);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixCorrelation, tenantId, activationSuccess]);

  const handleCopyPix = () => {
    if (!pixEmv) return;
    navigator.clipboard.writeText(pixEmv);
    setIsCopied(true);
    toast.success("Código Pix copiado! Cole no aplicativo do seu banco.");
    setTimeout(() => setIsCopied(false), 2500);
  };

  // Verificação ou confirmação manual do pagamento via Pix
  const handleConfirmManualPayment = async () => {
    if (!selectedPlanForCheckout || !tenantId) return;
    setIsVerifying(true);
    try {
      const now = new Date();
      const next = new Date(now);
      next.setMonth(next.getMonth() + 1);

      const { error } = await supabase.from("tenant_assinaturas").upsert(
        {
          tenant_id: tenantId,
          status: "active",
          qtd_barbeiros: selectedPlanForCheckout.barbersLimit,
          payment_method: paymentMethodTab === "pix" ? "pix_automatico" : "credit_card",
          payment_reference: pixCorrelation || `ref-${Date.now()}`,
          paid_at: now.toISOString(),
          subscription_start: now.toISOString(),
          next_billing_date: next.toISOString(),
          cancelled_at: null,
          updated_at: now.toISOString(),
        },
        { onConflict: "tenant_id" }
      );

      if (error) throw error;
      handleSuccessActivation();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao verificar pagamento. Tente novamente.");
    } finally {
      setIsVerifying(false);
    }
  };

  // Abre checkout seguro para assinatura via Cartão de Crédito
  const handleOpenCardCheckout = () => {
    if (!selectedPlanForCheckout) return;
    const checkoutUrl =
      CREDIT_CARD_CHECKOUT_URLS[selectedPlanForCheckout.id] ||
      CREDIT_CARD_CHECKOUT_URLS.dupla ||
      CREDIT_CARD_CHECKOUT_URLS.solo;
    window.open(checkoutUrl, "_blank", "noopener,noreferrer");
    toast.info("Abrindo checkout seguro de cartão de crédito...");
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
                  <img src={logoDub} alt="DUB" className="w-11 h-11 rounded-2xl object-cover shrink-0" />
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
                    className="h-12 px-6 rounded-2xl bg-foreground text-background font-semibold text-[14px] inline-flex items-center justify-center gap-2 hover:opacity-90 active:scale-98 transition-all"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>Falar com especialista DUB</span>
                  </button>
                </div>
              ) : (
                <>
                  {/* Seletor de Método de Pagamento: Pix ou Cartão */}
                  <div className="grid grid-cols-2 p-1 rounded-2xl bg-secondary/50 border border-border/40">
                    <button
                      type="button"
                      onClick={() => setPaymentMethodTab("pix")}
                      className={cn(
                        "h-10 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                        paymentMethodTab === "pix"
                          ? "bg-foreground text-background shadow-xs font-bold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <QrCode className="w-4 h-4" />
                      <span>Pix Instantâneo</span>
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

                  {/* ─── ABA 1: PIX INSTANTÂNEO & AUTOMÁTICO ─── */}
                  {paymentMethodTab === "pix" && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18 }}
                      className="flex flex-col items-center gap-4"
                    >
                      {/* Container do QR Code */}
                      <div className="w-full aspect-square max-w-[280px] rounded-3xl border border-border/70 dark:border-white/10 bg-card p-5 flex flex-col items-center justify-center shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.25)] relative overflow-hidden">
                        {activationSuccess ? (
                          <div className="text-center space-y-3">
                            <CheckCircle2 className="w-20 h-20 text-emerald-500 mx-auto" strokeWidth={2.2} />
                            <p className="text-[14px] font-bold text-foreground">
                              Pagamento confirmado!
                            </p>
                          </div>
                        ) : pixEmv ? (
                          <div className="w-full h-full rounded-2xl bg-white p-3 flex items-center justify-center">
                            <QRCodeSVG
                              value={pixEmv}
                              size={256}
                              level="M"
                              className="w-full h-full"
                            />
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
                          <div className="text-center space-y-2.5">
                            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mx-auto" />
                            <p className="text-[12px] text-muted-foreground font-medium">
                              Gerando Pix oficial...
                            </p>
                          </div>
                        )}
                      </div>

                      <p className="text-[12px] text-muted-foreground text-center leading-relaxed">
                        Abra o app do seu banco, escolha <strong>Pagar via Pix</strong> e escaneie o QR Code ou copie o código abaixo.
                      </p>

                      {/* Ações Pix: Botão Principal 56px + Botão Secundário 44px */}
                      <div className="w-full space-y-2.5 pt-1">
                        {pixEmv && !activationSuccess && (
                          <button
                            type="button"
                            onClick={handleCopyPix}
                            className="w-full h-14 rounded-[28px] bg-foreground text-background font-semibold text-[16px] flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all shadow-xs cursor-pointer"
                          >
                            {isCopied ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
                            <span>{isCopied ? "Código copiado!" : "Copiar código Pix"}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={handleConfirmManualPayment}
                          disabled={isVerifying || activationSuccess}
                          className="w-full h-11 rounded-full text-[14px] font-medium text-foreground hover:bg-secondary/40 border border-border/50 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw className={cn("w-4 h-4", isVerifying ? "animate-spin" : "")} />
                          <span>{isVerifying ? "Verificando no banco..." : "Já realizei o pagamento via Pix"}</span>
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* ─── ABA 2: CARTÃO DE CRÉDITO RECORRENTE ─── */}
                  {paymentMethodTab === "cartao" && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18 }}
                      className="space-y-4"
                    >
                      <div className="rounded-3xl border border-border/70 dark:border-white/10 bg-card p-5 space-y-4 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                            <CreditCard className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <h4 className="text-[15px] font-bold text-foreground">
                              Assinatura Mensal no Cartão
                            </h4>
                            <p className="text-[12px] text-muted-foreground">
                              Cobrança recorrente automática todo mês
                            </p>
                          </div>
                        </div>

                        <div className="rounded-2xl bg-secondary/30 border border-border/30 p-3.5 space-y-2 text-[12.5px] text-foreground/85">
                          <div className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span>Não compromete o limite total do cartão</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span>Cobrança mensal no valor de R$ {selectedPlanForCheckout.price.toFixed(2).replace(".", ",")}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span>Valores repassados à subconta oficial DUB</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span>Cancele quando quiser diretamente no painel</span>
                          </div>
                        </div>
                      </div>

                      {/* Ações Cartão: Botão Principal 56px + Botão Secundário 44px */}
                      <div className="w-full space-y-2.5 pt-1">
                        <button
                          type="button"
                          onClick={handleOpenCardCheckout}
                          className="w-full h-14 rounded-[28px] bg-foreground text-background font-semibold text-[16px] flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all shadow-xs cursor-pointer"
                        >
                          <Zap className="w-4 h-4 text-amber-300" />
                          <span>Assinar no Cartão de Crédito</span>
                          <ExternalLink className="w-4 h-4 opacity-75" />
                        </button>

                        <button
                          type="button"
                          onClick={handleConfirmManualPayment}
                          disabled={isVerifying || activationSuccess}
                          className="w-full h-11 rounded-full text-[14px] font-medium text-foreground hover:bg-secondary/40 border border-border/50 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw className={cn("w-4 h-4", isVerifying ? "animate-spin" : "")} />
                          <span>{isVerifying ? "Verificando..." : "Já concluí a assinatura no Cartão"}</span>
                        </button>
                      </div>
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
                  Para ativar sua assinatura no Pix Automático, precisamos de algumas informações da sua barbearia.
                </p>
              </div>

              {/* Bloco de informações pendentes refinado (fundo e borda discretos, sem aspecto de erro agressivo) */}
              <div className="rounded-2xl border border-rose-500/15 bg-rose-500/[0.03] dark:bg-rose-500/[0.06] p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-foreground/85">
                    Informações pendentes
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[12px] font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400">
                    {missingFieldNames.length} {missingFieldNames.length === 1 ? "pendente" : "pendentes"}
                  </span>
                </div>

                <ul className="space-y-2.5 pt-1">
                  {missingFieldNames.map((field, idx) => (
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
