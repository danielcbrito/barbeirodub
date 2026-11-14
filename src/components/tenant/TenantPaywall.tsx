import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  Users,
  Shield,
  Sparkles,
  CheckCircle2,
  ChevronRight,
  X,
  CreditCard,
  Building,
  QrCode,
  MessageSquare,
  Crown,
  LogOut,
  Smartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { OFFICIAL_PLANS, PlanDefinition } from "@/components/barber/BarberMeuPlano";

interface TenantPaywallProps {
  tenantNome?: string;
  isOverdue?: boolean;
  onLogout: () => void;
  onPlanSelected?: (plan: PlanDefinition) => void;
}

export function TenantPaywall({
  tenantNome = "Sua Barbearia",
  isOverdue = false,
  onLogout,
}: TenantPaywallProps) {
  const [plansModalOpen, setPlansModalOpen] = useState(false);
  const [selectedPlanForCheckout, setSelectedPlanForCheckout] = useState<PlanDefinition | null>(null);

  const handleSelectPlan = (plan: PlanDefinition) => {
    setSelectedPlanForCheckout(plan);
  };

  const handleWhatsAppContact = (plan: PlanDefinition) => {
    const text = encodeURIComponent(
      `Olá! Minha barbearia ${tenantNome} precisa ativar o plano ${plan.name} (R$ ${plan.price.toFixed(2).replace(".", ",")}/mês) no Barbeiro DUB.`
    );
    window.open(`https://wa.me/5511999999999?text=${text}`, "_blank");
  };

  return (
    <div className="min-h-dvh bg-background flex flex-col justify-between overflow-x-hidden pt-[env(safe-area-inset-top)] pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      {/* ═══ TOPO / HEADER: Título 'Mantenha o ritmo!' + Botão 'Sair' ═══ */}
      <header className="px-6 pt-5 pb-3 flex items-center justify-between">
        <h1 className="text-[22px] sm:text-[24px] font-bold text-foreground tracking-tight">
          Mantenha o ritmo!
        </h1>
        <button
          type="button"
          onClick={onLogout}
          className="text-[14px] font-semibold text-foreground/80 hover:text-foreground active:opacity-70 transition-colors flex items-center gap-1 cursor-pointer"
        >
          <span>Sair</span>
          <LogOut className="w-3.5 h-3.5 opacity-60" />
        </button>
      </header>

      {/* ═══ CONTEÚDO PRINCIPAL ═══ */}
      <main className="flex-1 px-5 py-2 max-w-md mx-auto w-full flex flex-col justify-start space-y-7">
        {/* Card Principal — baseado no layout e estilo da imagem de referência */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="rounded-3xl border border-border/70 dark:border-white/10 bg-card p-5 sm:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.25)] space-y-4 relative"
        >
          {/* Tag de Alerta Vermelha */}
          <div className="flex items-center gap-2 text-destructive font-semibold text-[13.5px] tracking-tight">
            <span className="w-2 h-2 rounded-full bg-destructive shrink-0 animate-pulse" />
            <span>
              {isOverdue
                ? "Sua assinatura está suspensa por atraso."
                : "Sua versão de avaliação gratuita acabou."}
            </span>
          </div>

          {/* Texto explicativo persuasivo */}
          <p className="text-[13px] sm:text-[13.5px] text-foreground/80 leading-relaxed font-normal">
            Assine o Barbeiro DUB para permanecer disponível 24 horas por dia, 7 dias por semana, economize tempo em atender chamadas telefônicas e mantenha seus clientes te visitando com mais freqüência.
          </p>

          {/* Divisor interno */}
          <div className="border-t border-border/40 dark:border-white/[0.08] pt-3.5 space-y-3">
            <p className="text-[14px] font-bold text-foreground">
              Começa com <span className="text-foreground font-black">R$ 38,90</span> / mês
            </p>

            {/* Botão de Selecionar Plano */}
            <button
              type="button"
              onClick={() => setPlansModalOpen(true)}
              className="w-full h-12 rounded-2xl bg-foreground text-background font-bold text-[14.5px] hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer shadow-sm flex items-center justify-center gap-2"
            >
              <span>Selecione seu plano</span>
              <ChevronRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </motion.div>

        {/* ═══ SEÇÃO SECUNDÁRIA: 'Agenda online, gestão e marketing' ═══ */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="space-y-4 text-center"
        >
          {/* Linha divisória com tag centralizada */}
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/30 dark:border-white/[0.06]" />
            </div>
            <span className="relative bg-background px-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Agenda online, gestão e marketing
            </span>
          </div>

          {/* Chamada de agilidade */}
          <div className="space-y-1.5 px-2">
            <h2 className="text-[20px] sm:text-[22px] font-extrabold text-foreground tracking-tight">
              Agilize a reserva
            </h2>
            <p className="text-[12.5px] text-muted-foreground leading-relaxed max-w-xs mx-auto">
              Use as ferramentas de Gestão e Marketing do Barbeiro DUB para divulgar informações sobre o seu estabelecimento e resultados dos seus serviços.
            </p>
          </div>

          {/* ═══ ILUSTRAÇÃO / MOCKUP VISUAL DE SMARTPHONE COM A AGENDA ═══ */}
          <div className="relative pt-3 pb-2 flex justify-center items-center">
            {/* Halo suave de iluminação no fundo */}
            <div className="absolute w-52 h-52 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

            {/* Frame do celular estilizado */}
            <div className="relative w-56 rounded-[28px] border-[3px] border-border/70 dark:border-white/15 bg-card/90 dark:bg-[#121215] shadow-2xl p-2.5 space-y-2 backdrop-blur-xl">
              {/* Notch superior */}
              <div className="w-16 h-1.5 rounded-full bg-border/80 dark:bg-white/20 mx-auto mb-1.5" />

              {/* Cabeçalho simulado da barbearia */}
              <div className="flex items-center gap-2 pb-2 border-b border-border/30">
                <div className="w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center text-[10px] font-bold">
                  DUB
                </div>
                <div className="text-left flex-1 min-w-0">
                  <div className="h-2.5 w-20 bg-foreground/20 rounded" />
                  <div className="h-2 w-12 bg-muted/60 rounded mt-1" />
                </div>
              </div>

              {/* Mini cards de agendamento ilustrativos */}
              <div className="space-y-1.5 text-left">
                <div className="p-2 rounded-xl bg-secondary/60 border border-border/30 flex items-center justify-between text-[10.5px]">
                  <div className="space-y-0.5">
                    <span className="font-bold text-foreground block">10:00 • Corte Degradê</span>
                    <span className="text-[9.5px] text-muted-foreground">Cliente Confirmado</span>
                  </div>
                  <span className="font-bold text-foreground">R$ 35,00</span>
                </div>

                <div className="p-2 rounded-xl bg-secondary/40 border border-border/20 flex items-center justify-between text-[10.5px]">
                  <div className="space-y-0.5">
                    <span className="font-semibold text-foreground/80 block">11:30 • Barba & Cabelo</span>
                    <span className="text-[9.5px] text-muted-foreground">Agendado pelo App</span>
                  </div>
                  <span className="font-semibold text-foreground/80">R$ 55,00</span>
                </div>
              </div>

              {/* Botão de ação simulado */}
              <div className="pt-1">
                <div className="w-full h-6 rounded-lg bg-foreground text-background text-[10px] font-bold flex items-center justify-center">
                  Reservar Horário 24h
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </main>

      {/* ═══ MODAL FULLSCREEN: SELEÇÃO DOS 5 PLANOS (SOLO, DUPLA, EQUIPE, REDE, ENTERPRISE) ═══ */}
      <AnimatePresence>
        {plansModalOpen && (
          <div className="fixed inset-0 z-50 bg-background flex flex-col pt-[env(safe-area-inset-top)] pb-[calc(1rem+env(safe-area-inset-bottom))] animate-fade-in">
            {/* Header do modal */}
            <div className="px-5 py-4 flex items-center justify-between border-b border-border/25 bg-background/90 backdrop-blur-xl sticky top-0 z-10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-foreground text-background flex items-center justify-center">
                  <Crown className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-[17px] font-bold text-foreground">
                    Escolha o plano ideal
                  </h2>
                  <p className="text-[11.5px] text-muted-foreground">
                    Planos flexíveis para qualquer tamanho de equipe
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPlansModalOpen(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary active:scale-95 transition-all cursor-pointer"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Lista dos 5 planos */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 max-w-md mx-auto w-full">
              {OFFICIAL_PLANS.map((plan) => (
                <div
                  key={plan.id}
                  className={cn(
                    "rounded-2xl p-4.5 border transition-all duration-200 relative overflow-hidden",
                    plan.highlight
                      ? "border-primary/50 bg-card shadow-sm ring-1 ring-primary/20"
                      : "border-border/50 bg-card/70 hover:border-border"
                  )}
                >
                  {plan.highlight && (
                    <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[10px] font-bold px-3 py-0.5 rounded-bl-xl uppercase tracking-wider">
                      Recomendado
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
                      {plan.isCustomPrice ? (
                        <div className="flex flex-col items-end">
                          <span className="text-[15px] font-black text-foreground tracking-tight">
                            Sob Consulta
                          </span>
                          <span className="text-[10px] text-muted-foreground font-medium">
                            Personalizado
                          </span>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-baseline gap-0.5 justify-end">
                            <span className="text-[11px] text-muted-foreground font-semibold">R$</span>
                            <span className="text-[22px] font-black text-foreground tracking-tight">
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

                  {/* Benefícios */}
                  <div className="space-y-1.5 py-2.5 border-y border-border/20 my-2.5 text-[12px] text-foreground/85">
                    {plan.features.slice(0, 4).map((feat, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span className="truncate">{feat}</span>
                      </div>
                    ))}
                  </div>

                  {/* Ação */}
                  <button
                    type="button"
                    onClick={() => {
                      setPlansModalOpen(false);
                      handleSelectPlan(plan);
                    }}
                    className={cn(
                      "w-full h-11 rounded-xl font-bold text-[13px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer mt-1",
                      plan.highlight
                        ? "bg-foreground text-background hover:opacity-90 shadow-xs"
                        : "bg-secondary text-foreground hover:bg-secondary/80"
                    )}
                  >
                    <span>Assinar DUB {plan.name}</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* ═══ SHEET/MODAL DE CHECKOUT / ATIVAÇÃO VIA SUBCONTA & PIX ═══ */}
      <AnimatePresence>
        {selectedPlanForCheckout && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
            <motion.div
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-card border border-border shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
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
                      {selectedPlanForCheckout.label} •{" "}
                      {selectedPlanForCheckout.isCustomPrice
                        ? "Sob Consulta"
                        : `R$ ${selectedPlanForCheckout.price.toFixed(2).replace(".", ",")}/mês`}
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

              {/* Resumo da Assinatura */}
              <div className="rounded-2xl p-4 bg-secondary/35 border border-border/30 space-y-2">
                <div className="flex justify-between text-[13px]">
                  <span className="text-muted-foreground">Estabelecimento:</span>
                  <span className="font-semibold text-foreground truncate max-w-[200px]">
                    {tenantNome}
                  </span>
                </div>
                <div className="flex justify-between text-[13px]">
                  <span className="text-muted-foreground">Limite do plano:</span>
                  <span className="font-semibold text-foreground">
                    {selectedPlanForCheckout.label}
                  </span>
                </div>
                <div className="flex justify-between text-[13px]">
                  <span className="text-muted-foreground">Vencimento:</span>
                  <span className="font-semibold text-foreground">
                    Todo dia 25 do mês
                  </span>
                </div>
                <div className="flex justify-between text-[14px] pt-2 border-t border-border/20">
                  <span className="font-bold text-foreground">Valor mensal:</span>
                  <span className="font-extrabold text-[18px] text-foreground">
                    R$ {selectedPlanForCheckout.price.toFixed(2).replace(".", ",")}
                  </span>
                </div>
              </div>

              {/* Informação do banco / subconta */}
              <div className="p-3.5 rounded-2xl bg-primary/10 border border-primary/20 space-y-1.5 text-[12px] text-foreground/90">
                <div className="flex items-center gap-2 font-bold text-primary">
                  <Building className="w-4 h-4" />
                  <span>Cobrança Automatizada via Subconta Bancária</span>
                </div>
                <p className="text-muted-foreground leading-relaxed text-[11.5px]">
                  A mensalidade é gerada de forma automatizada na subconta do sistema com chave Pix de débito recorrente, garantindo liberação imediata da sua agenda.
                </p>
              </div>

              {/* Ações */}
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleWhatsAppContact(selectedPlanForCheckout)}
                  className="w-full h-12 rounded-2xl bg-foreground text-background font-bold text-[14px] flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer shadow-sm"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Confirmar e ativar plano via WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText("pagamentos@barbeirodub.com.br");
                    toast.success("Chave Pix de ativação copiada!");
                  }}
                  className="w-full h-10 rounded-2xl border border-border/60 text-foreground font-semibold text-[12.5px] flex items-center justify-center gap-2 hover:bg-secondary/40 active:scale-[0.98] transition-all cursor-pointer"
                >
                  <QrCode className="w-4 h-4" />
                  <span>Copiar chave Pix de pagamento</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default TenantPaywall;
