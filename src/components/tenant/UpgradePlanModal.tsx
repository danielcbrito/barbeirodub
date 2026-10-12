import { motion } from "framer-motion";
import { Crown, Users, Zap, ArrowRight, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Mapeamento de faixa de barbeiros → checkout Cakto + nome do plano.
 */
interface PlanTier {
  name: string;
  maxBarbers: number;
  price: number;
  checkoutUrl: string;
}

const PLAN_TIERS: PlanTier[] = [
  { name: "DUB Solo",    maxBarbers: 1, price: 49.90,  checkoutUrl: "https://pay.cakto.com.br/3fu4u7q_789875" },
  { name: "DUB Dupla",   maxBarbers: 2, price: 79.90,  checkoutUrl: "https://pay.cakto.com.br/3aie3q5" },
  { name: "DUB Equipe",  maxBarbers: 3, price: 109.90, checkoutUrl: "https://pay.cakto.com.br/abri2ap" },
  { name: "DUB Pro",     maxBarbers: 4, price: 129.90, checkoutUrl: "https://pay.cakto.com.br/3epmyy9" },
  { name: "DUB Premium", maxBarbers: 5, price: 149.90, checkoutUrl: "https://pay.cakto.com.br/35fj7fi" },
];

/**
 * Retorna o plano necessário para suportar N barbeiros.
 * Se já está no máximo (Premium), retorna o Premium mesmo.
 */
export function getRequiredTier(barberCount: number): PlanTier {
  if (barberCount <= 1) return PLAN_TIERS[0];
  if (barberCount === 2) return PLAN_TIERS[1];
  if (barberCount === 3) return PLAN_TIERS[2];
  if (barberCount === 4) return PLAN_TIERS[3];
  return PLAN_TIERS[4];
}

/**
 * Retorna o limite de barbeiros baseado no preço mensal do plano.
 */
export function getPlanLimitByPrice(price: number): number {
  if (price >= 149.9) return 999; // Premium: ilimitado (5+)
  if (price >= 129.9) return 4;
  if (price >= 109.9) return 3;
  if (price >= 79.9) return 2;
  return 1;
}

 /**
 * Durante trial, permite apenas 1 barbeiro (forçar conversão).
 */
export function getMaxBarbersForStatus(
  subscriptionStatus: string,
  currentBarberCount: number
): number {
  if (subscriptionStatus === "trialing") return 1;
  if (subscriptionStatus === "active") {
    // Plano ativo: limite baseado na faixa atual
    return getRequiredTier(currentBarberCount).maxBarbers;
  }
  // Expirado / sem assinatura → bloqueia
  return 0;
}

interface UpgradePlanModalProps {
  open: boolean;
  onClose: () => void;
  currentBarbers: number;
  isTrial: boolean;
}

/**
 * Modal full-screen que recomenda o upgrade de plano quando o tenant
 * tenta adicionar mais barbeiros do que o plano atual permite.
 */
export function UpgradePlanModal({ open, onClose, currentBarbers, isTrial }: UpgradePlanModalProps) {
  if (!open) return null;

  // O plano que o tenant precisa para ter (currentBarbers + 1)
  const neededTier = getRequiredTier(currentBarbers + 1);

  const handleSubscribe = () => {
    window.open(neededTier.checkoutUrl, "_blank");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-background flex flex-col pt-[env(safe-area-inset-top)]"
    >
      {/* Close button */}
      <div className="flex justify-end p-4">
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-secondary/50 active:scale-95 transition-all"
          aria-label="Fechar"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-10 max-w-md mx-auto w-full">
        {/* Icon */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
          className="w-20 h-20 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6"
        >
          <Crown className="w-10 h-10 text-primary" />
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="text-[22px] font-bold text-foreground text-center leading-tight mb-2"
        >
          {isTrial
            ? "Assine para expandir sua equipe"
            : "Hora de crescer! 🚀"}
        </motion.h1>

        <motion.p
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-[13px] text-muted-foreground text-center leading-relaxed mb-8"
        >
          {isTrial
            ? "Durante o período de teste, você pode cadastrar 1 barbeiro. Assine um plano para adicionar mais profissionais à sua equipe."
            : `Para adicionar mais barbeiros, faça o upgrade para o plano ${neededTier.name} e tenha até ${neededTier.maxBarbers === 5 ? "5+" : neededTier.maxBarbers} profissionais na sua barbearia.`}
        </motion.p>

        {/* Plan card */}
        <motion.div
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="w-full rounded-2xl border border-primary/20 p-5 mb-6"
          style={{
            background: "linear-gradient(150deg, hsl(var(--card)) 0%, hsl(var(--primary) / 0.06) 100%)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-[14px] font-semibold text-foreground">{neededTier.name}</span>
          </div>

          <div className="flex items-baseline gap-1 mb-4">
            <span className="text-[10px] text-muted-foreground">R$</span>
            <span className="text-[28px] font-bold text-primary leading-none">
              {neededTier.price.toFixed(2).replace(".", ",")}
            </span>
            <span className="text-[11px] text-muted-foreground">/mês</span>
          </div>

          <div className="space-y-2.5 mb-1">
            <BenefitRow icon={Users} text={`Até ${neededTier.maxBarbers === 5 ? "5+" : neededTier.maxBarbers} barbeiros na equipe`} />
            <BenefitRow icon={Zap} text="Agenda inteligente + disparos WhatsApp" />
            <BenefitRow icon={Crown} text="Financeiro completo com comissões" />
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="w-full space-y-3"
        >
          <Button
            onClick={handleSubscribe}
            className="w-full h-13 text-[14px] font-semibold rounded-xl bg-primary hover:bg-primary/90 transition-all duration-300 group"
          >
            <Zap className="w-4 h-4 mr-2" />
            {isTrial ? "Assinar agora" : `Fazer upgrade — ${neededTier.name}`}
            <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-0.5" />
          </Button>

          <p className="text-center text-[10px] text-muted-foreground">
            Sem taxa de adesão • Cancele quando quiser
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}

/* ─── Subcomponent ─── */
function BenefitRow({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-3.5 h-3.5 text-primary" />
      </div>
      <span className="text-[12px] text-foreground/80">{text}</span>
    </div>
  );
}
