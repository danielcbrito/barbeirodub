import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Crown,
  CheckCircle2,
  ChevronLeft,
  Users,
  Shield,
  Calendar,
  Sparkles,
  ArrowRight,
  Clock,
  AlertTriangle,
  QrCode,
  MessageSquare,
  X,
  CreditCard,
  Building,
} from "lucide-react";
import { useTenantSubscription } from "@/hooks/useTenantSubscription";
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
  price: number;
  highlight?: boolean;
  description: string;
  features: string[];
}

export const OFFICIAL_PLANS: PlanDefinition[] = [
  {
    id: "solo",
    name: "Solo",
    label: "1 barbeiro",
    barbersLimit: 1,
    price: 49.9,
    description: "Ideal para barbeiros autônomos que gerenciam sua própria cadeira.",
    features: [
      "1 Barbeiro",
      "Agenda online 24h ilimitada",
      "Gestão completa de clientes e histórico",
      "Relatórios financeiros e faturamento",
      "Lembretes automáticos via WhatsApp",
      "Suporte prioritário",
    ],
  },
  {
    id: "dupla",
    name: "Dupla",
    label: "2 barbeiros",
    barbersLimit: 2,
    price: 79.9,
    highlight: true,
    description: "Perfeito para duplas ou barbearias com 2 profissionais.",
    features: [
      "Até 2 Barbeiros",
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
    label: "3 barbeiros",
    barbersLimit: 3,
    price: 109.9,
    description: "Para barbearias em expansão com equipe de até 3 profissionais.",
    features: [
      "Até 3 Barbeiros",
      "Painel unificado da equipe",
      "Gestão de comissões individuais",
      "Relatórios avançados de retenção e faturamento",
      "Disparos de marketing e promoções",
      "Suporte prioritário",
    ],
  },
  {
    id: "rede",
    name: "Rede",
    label: "4 barbeiros",
    barbersLimit: 4,
    price: 129.9,
    description: "Para barbearias consolidadas com alto volume de atendimentos.",
    features: [
      "Até 4 Barbeiros",
      "Painel executivo de gestão",
      "Relatórios detalhados de metas e faturamento",
      "Disparos em massa e campanhas",
      "Suporte VIP dedicado",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    label: "5+ barbeiros",
    barbersLimit: 999,
    price: 149.9,
    description: "Para grandes barbearias ou redes com 5 ou mais barbeiros.",
    features: [
      "5+ Barbeiros (Ilimitado)",
      "Múltiplas cadeiras e unidades",
      "Relatórios executivos e auditoria",
      "Disparos ilimitados via WhatsApp",
      "Gerente de conta exclusivo e suporte VIP",
    ],
  },
];

export function BarberMeuPlano({ tenantId, tenantNome = "Sua Barbearia", onBack }: BarberMeuPlanoProps) {
  const subscription = useTenantSubscription(tenantId);
  const [selectedPlanForCheckout, setSelectedPlanForCheckout] = useState<PlanDefinition | null>(null);

  // Identifica o plano atual
  const currentPlan = OFFICIAL_PLANS.find(
    (p) => p.name.toLowerCase() === subscription.planName?.toLowerCase()
  ) || OFFICIAL_PLANS[0];

  const handleOpenCheckout = (plan: PlanDefinition) => {
    setSelectedPlanForCheckout(plan);
  };

  const handleWhatsAppContact = (plan: PlanDefinition) => {
    const text = encodeURIComponent(
      `Olá! Quero ativar/alterar o plano ${plan.name} (R$ ${plan.price.toFixed(2).replace(".", ",")}/mês) para a minha barbearia ${tenantNome}.`
    );
    window.open(`https://wa.me/5511999999999?text=${text}`, "_blank");
  };

  return (
    <div className="min-h-full bg-background flex flex-col pb-16">
      {/* ═══ CABEÇALHO ═══ */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-3 border-b border-border/20 sticky top-0 bg-background/85 backdrop-blur-xl z-20">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="w-9 h-9 rounded-full flex items-center justify-center text-foreground hover:bg-secondary/60 active:scale-95 transition-all cursor-pointer"
            aria-label="Voltar"
          >
            <ChevronLeft className="w-5 h-5" strokeWidth={2.4} />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-[18px] font-bold text-foreground tracking-tight truncate">
            Meu Plano
          </h1>
          <p className="text-[12px] text-muted-foreground truncate">
            Gerencie sua assinatura, limites e opções de upgrade
          </p>
        </div>
      </div>

      <div className="px-4 py-4 space-y-6 max-w-2xl mx-auto w-full">
        {/* ═══ CARD DO STATUS ATUAL ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "rounded-3xl p-5 border relative overflow-hidden transition-all duration-300",
            subscription.isExempt
              ? "bg-gradient-to-br from-emerald-500/10 via-card to-emerald-500/5 border-emerald-500/30"
              : subscription.isBlocked
              ? "bg-gradient-to-br from-destructive/15 via-card to-destructive/5 border-destructive/40"
              : subscription.isOverdue
              ? "bg-gradient-to-br from-amber-500/15 via-card to-amber-500/5 border-amber-500/40"
              : subscription.isTrial
              ? "bg-gradient-to-br from-blue-500/15 via-card to-blue-500/5 border-blue-500/30"
              : "bg-gradient-to-br from-card via-card to-primary/5 border-border/50 shadow-sm"
          )}
        >
          {/* Badge de status */}
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "w-8 h-8 rounded-xl flex items-center justify-center shadow-xs",
                  subscription.isBlocked
                    ? "bg-destructive text-destructive-foreground"
                    : subscription.isOverdue
                    ? "bg-amber-500 text-black"
                    : "bg-foreground text-background"
                )}
              >
                <Crown className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground block">
                  Plano Atual
                </span>
                <span className="text-[17px] font-bold text-foreground">
                  {subscription.isExempt
                    ? "Barbearia DUB (Vitalício)"
                    : subscription.isTrial
                    ? "Período Gratuito (Trial)"
                    : `DUB ${subscription.planName || currentPlan.name}`}
                </span>
              </div>
            </div>

            <div
              className={cn(
                "px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5",
                subscription.isBlocked
                  ? "bg-destructive/15 text-destructive border border-destructive/30"
                  : subscription.isOverdue
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                  : subscription.isTrial
                  ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30"
                  : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
              )}
            >
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full animate-pulse",
                  subscription.isBlocked
                    ? "bg-destructive"
                    : subscription.isOverdue
                    ? "bg-amber-500"
                    : subscription.isTrial
                    ? "bg-blue-500"
                    : "bg-emerald-500"
                )}
              />
              {subscription.isBlocked
                ? "Bloqueado"
                : subscription.isOverdue
                ? "Em Atraso"
                : subscription.isTrial
                ? "Teste Ativo"
                : "Ativo"}
            </div>
          </div>

          {/* Detalhes do vencimento / data */}
          <div className="bg-background/60 dark:bg-black/30 backdrop-blur-md rounded-2xl p-4 border border-border/30 space-y-2 mb-4">
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-muted-foreground/70" />
                Vencimento:
              </span>
              <span className="font-semibold text-foreground">
                {subscription.isExempt
                  ? "Isento de cobrança"
                  : subscription.nextBillingDate
                  ? `Todo dia ${format(subscription.nextBillingDate, "dd")} (${format(
                      subscription.nextBillingDate,
                      "dd 'de' MMMM",
                      { locale: ptBR }
                    )})`
                  : subscription.trialEnd
                  ? `${format(subscription.trialEnd, "dd 'de' MMMM", { locale: ptBR })} (${subscription.daysRemaining} dias restantes)`
                  : "A combinar"}
              </span>
            </div>

            <div className="flex items-center justify-between text-[13px] pt-1 border-t border-border/20">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Users className="w-4 h-4 text-muted-foreground/70" />
                Capacidade:
              </span>
              <span className="font-semibold text-foreground">
                {subscription.isExempt
                  ? "Sem limite de barbeiros"
                  : `${subscription.barbersAllowed || 1} ${
                      (subscription.barbersAllowed || 1) === 1 ? "barbeiro" : "barbeiros"
                    }`}
              </span>
            </div>

            <div className="flex items-center justify-between text-[13px] pt-1 border-t border-border/20">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-muted-foreground/70" />
                Valor mensal:
              </span>
              <span className="font-bold text-foreground">
                {subscription.isExempt
                  ? "R$ 0,00"
                  : `R$ ${(subscription.priceMonthly || currentPlan.price).toFixed(2).replace(".", ",")} / mês`}
              </span>
            </div>
          </div>

          {/* Mensagens contextuais de alerta */}
          {subscription.isOverdue && (
            <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="text-[12px] leading-relaxed">
                <p className="font-semibold">Mensalidade com atraso</p>
                <p className="opacity-90">
                  Sua mensalidade venceu dia 25. O app permanece liberado temporariamente, mas será bloqueado se o pagamento não for regularizado.
                </p>
              </div>
            </div>
          )}

          {subscription.isTrial && (
            <div className="mb-4 p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-start gap-2.5 text-blue-700 dark:text-blue-300">
              <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="text-[12px] leading-relaxed">
                <p className="font-semibold">Período de avaliação de 7 dias grátis</p>
                <p className="opacity-90">
                  Você tem acesso total a todas as funcionalidades. Restam{" "}
                  <strong>{subscription.daysRemaining} dias</strong> de teste. Escolha seu plano abaixo para continuar sem interrupção.
                </p>
              </div>
            </div>
          )}

          {/* Botão de upgrade rápido */}
          <button
            type="button"
            onClick={() => {
              const target = OFFICIAL_PLANS.find((p) => p.barbersLimit > (subscription.barbersAllowed || 1)) || OFFICIAL_PLANS[1];
              handleOpenCheckout(target);
            }}
            className="w-full h-11 rounded-2xl bg-foreground text-background font-bold text-[13.5px] flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer shadow-xs"
          >
            <span>Fazer Upgrade de Plano</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>

        {/* ═══ SEÇÃO: LISTAGEM DOS PLANOS DISPONÍVEIS ═══ */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-bold text-foreground tracking-tight">
              Planos Disponíveis
            </h2>
            <span className="text-[12px] text-muted-foreground font-medium">
              5 opções para sua barbearia
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3.5">
            {OFFICIAL_PLANS.map((plan) => {
              const isSelectedCurrent =
                !subscription.isTrial &&
                subscription.planName?.toLowerCase() === plan.name.toLowerCase();

              return (
                <div
                  key={plan.id}
                  className={cn(
                    "rounded-2xl p-4.5 border transition-all duration-200 relative overflow-hidden",
                    plan.highlight
                      ? "border-primary/40 bg-card/90 dark:bg-card/40 shadow-sm ring-1 ring-primary/20"
                      : "border-border/40 bg-card/60 dark:bg-card/30 hover:border-border/80"
                  )}
                >
                  {plan.highlight && (
                    <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[10px] font-bold px-3 py-0.5 rounded-bl-xl uppercase tracking-wider">
                      Mais Popular
                    </div>
                  )}

                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-[16px] font-bold text-foreground">
                          DUB {plan.name}
                        </h3>
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-secondary text-foreground/80">
                          {plan.label}
                        </span>
                      </div>
                      <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">
                        {plan.description}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="flex items-baseline gap-0.5 justify-end">
                        <span className="text-[11px] text-muted-foreground font-semibold">R$</span>
                        <span className="text-[22px] font-black text-foreground tracking-tight">
                          {plan.price.toFixed(2).replace(".", ",")}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-medium block">
                        por mês
                      </span>
                    </div>
                  </div>

                  {/* Lista de recursos */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 py-3 border-y border-border/25 my-3">
                    {plan.features.map((feat, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-[12px] text-foreground/80">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span className="truncate">{feat}</span>
                      </div>
                    ))}
                  </div>

                  {/* Ação */}
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <span className="text-[11px] text-muted-foreground">
                      Sem taxa de adesão • Cancele quando quiser
                    </span>

                    {isSelectedCurrent ? (
                      <span className="px-3.5 py-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-[12px] border border-emerald-500/20">
                        Plano Atual
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenCheckout(plan)}
                        className={cn(
                          "px-4 py-2 rounded-xl font-bold text-[12.5px] transition-all active:scale-95 cursor-pointer",
                          plan.highlight
                            ? "bg-foreground text-background hover:opacity-90 shadow-xs"
                            : "bg-secondary text-foreground hover:bg-secondary/80"
                        )}
                      >
                        Escolher Plano
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ═══ VANTAGENS INCLUSAS EM TODOS OS PLANOS ═══ */}
        <div className="rounded-2xl p-4 border border-border/30 bg-secondary/15 space-y-3">
          <p className="text-[12px] uppercase font-bold tracking-wider text-muted-foreground">
            Incluso em todas as assinaturas
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[12.5px] text-foreground/80">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary shrink-0" />
              <span>Agenda online e aplicativo dos clientes 24/7</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary shrink-0" />
              <span>Gestão ilimitada de clientes e histórico</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary shrink-0" />
              <span>Financeiro completo com taxas e comissões</span>
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary shrink-0" />
              <span>Notificações e lembretes automáticos no WhatsApp</span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ MODAL/SHEET DE CONFIRMAÇÃO DO PLANO E PAGAMENTO ═══ */}
      <AnimatePresence>
        {selectedPlanForCheckout && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
            <motion.div
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-card border border-border shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto"
            >
              {/* Header do Modal */}
              <div className="flex items-center justify-between pb-2 border-b border-border/30">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-foreground text-background flex items-center justify-center font-bold">
                    <Crown className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-[16px] font-bold text-foreground">
                      Assinar DUB {selectedPlanForCheckout.name}
                    </h3>
                    <p className="text-[11.5px] text-muted-foreground">
                      {selectedPlanForCheckout.label} • R${" "}
                      {selectedPlanForCheckout.price.toFixed(2).replace(".", ",")}/mês
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPlanForCheckout(null)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-all cursor-pointer"
                  aria-label="Fechar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Resumo */}
              <div className="rounded-2xl p-4 bg-secondary/30 border border-border/30 space-y-2.5">
                <div className="flex justify-between text-[13px]">
                  <span className="text-muted-foreground">Barbearia:</span>
                  <span className="font-semibold text-foreground truncate max-w-[200px]">
                    {tenantNome}
                  </span>
                </div>
                <div className="flex justify-between text-[13px]">
                  <span className="text-muted-foreground">Capacidade do plano:</span>
                  <span className="font-semibold text-foreground">
                    {selectedPlanForCheckout.label}
                  </span>
                </div>
                <div className="flex justify-between text-[13px]">
                  <span className="text-muted-foreground">Frequência:</span>
                  <span className="font-semibold text-foreground">
                    Mensalidade recorrente (todo dia 25)
                  </span>
                </div>
                <div className="flex justify-between text-[14px] pt-2 border-t border-border/20">
                  <span className="font-bold text-foreground">Total mensal:</span>
                  <span className="font-extrabold text-[18px] text-foreground">
                    R$ {selectedPlanForCheckout.price.toFixed(2).replace(".", ",")}
                  </span>
                </div>
              </div>

              {/* Informação sobre subconta e ativação */}
              <div className="p-3.5 rounded-2xl bg-primary/10 border border-primary/20 space-y-1.5 text-[12px] text-foreground/90">
                <div className="flex items-center gap-2 font-bold text-primary">
                  <Building className="w-4 h-4" />
                  <span>Cobrança Automatizada via Subconta Bancária</span>
                </div>
                <p className="text-muted-foreground leading-relaxed text-[11.5px]">
                  O pagamento da mensalidade é processado diretamente via Pix com débito recorrente mensal, mantendo sua barbearia sempre ativa e liberada.
                </p>
              </div>

              {/* Botão de ativação rápida */}
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleWhatsAppContact(selectedPlanForCheckout)}
                  className="w-full h-12 rounded-2xl bg-foreground text-background font-bold text-[14px] flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer shadow-sm"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Ativar este plano agora</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText("pagamentos@barbeirodub.com.br");
                    toast.success("Chave Pix de pagamento copiada com sucesso!");
                  }}
                  className="w-full h-10 rounded-2xl border border-border/60 text-foreground font-semibold text-[12.5px] flex items-center justify-center gap-2 hover:bg-secondary/40 active:scale-[0.98] transition-all cursor-pointer"
                >
                  <QrCode className="w-4 h-4" />
                  <span>Copiar Chave Pix de Ativação</span>
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
