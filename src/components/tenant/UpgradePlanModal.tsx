import { motion, AnimatePresence } from "framer-motion";
import { Crown, Users, Zap, ArrowRight, X, Store, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export interface PlanTier {
  id: string;
  name: string;
  maxBarbers: number;
  maxUnits: number;
  price: number;
  isCustomPrice?: boolean;
}

export const PLAN_TIERS: PlanTier[] = [
  { id: "solo", name: "Solo", maxBarbers: 1, maxUnits: 1, price: 38.9 },
  { id: "dupla", name: "Dupla", maxBarbers: 2, maxUnits: 1, price: 69.9 },
  { id: "equipe", name: "Equipe", maxBarbers: 5, maxUnits: 1, price: 129.9 },
  { id: "rede", name: "Rede", maxBarbers: 9, maxUnits: 3, price: 249.9 },
  { id: "enterprise", name: "Enterprise", maxBarbers: 999999, maxUnits: 999999, price: 0, isCustomPrice: true },
];

/**
 * Retorna o plano necessário para suportar N barbeiros.
 */
export function getRequiredTier(barberCount: number): PlanTier {
  if (barberCount <= 1) return PLAN_TIERS[0];
  if (barberCount <= 2) return PLAN_TIERS[1];
  if (barberCount <= 5) return PLAN_TIERS[2];
  if (barberCount <= 9) return PLAN_TIERS[3];
  return PLAN_TIERS[4];
}

/**
 * Retorna o plano necessário para suportar N unidades.
 */
export function getRequiredUnitTier(unitCount: number): PlanTier {
  if (unitCount <= 1) return PLAN_TIERS[0];
  if (unitCount <= 3) return PLAN_TIERS[3]; // Rede (até 3 unidades)
  return PLAN_TIERS[4]; // Enterprise
}

/**
 * Retorna o limite de barbeiros baseado no preço mensal do plano.
 */
export function getPlanLimitByPrice(price: number): number {
  if (price >= 249.9) return 9;
  if (price >= 129.9) return 5;
  if (price >= 69.9) return 2;
  return 1;
}

export function getMaxBarbersForStatus(
  subscriptionStatus: string,
  currentBarberCount: number
): number {
  if (subscriptionStatus === "trialing") return 1;
  if (subscriptionStatus === "active") {
    return getRequiredTier(currentBarberCount).maxBarbers;
  }
  return 0;
}

export interface UpgradePlanModalProps {
  open: boolean;
  onClose: () => void;
  limitType?: "barbers" | "units";
  currentBarbers?: number;
  currentUnits?: number;
  isTrial?: boolean;
  currentPlanName?: string;
  customMessage?: string;
}

/**
 * Modal profissional exibido quando uma ação do tenant ultrapassa o limite do plano.
 * Oferece explicação cristalina do motivo e redireciona direto para a página de Meu Plano.
 */
export function UpgradePlanModal({
  open,
  onClose,
  limitType = "barbers",
  currentBarbers = 1,
  currentUnits = 1,
  isTrial = false,
  currentPlanName,
  customMessage,
}: UpgradePlanModalProps) {
  const navigate = useNavigate();

  if (!open) return null;

  const isUnitsLimit = limitType === "units";
  const neededTier = isUnitsLimit
    ? getRequiredUnitTier(currentUnits + 1)
    : getRequiredTier(currentBarbers + 1);

  const displayPlanName = currentPlanName || (isTrial ? "Solo (Trial)" : "Solo");

  const handleNavigateToPlans = () => {
    onClose();
    // Redireciona naturalmente para a tela de Meu Plano em Configurações
    navigate("/barbeiro/config-barbearia?screen=meu-plano");
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.22 }}
          className="w-full max-w-md rounded-3xl bg-card border border-border/80 shadow-[0_16px_50px_rgb(0,0,0,0.35)] p-6 flex flex-col items-center relative overflow-hidden"
        >
          {/* Botão de Fechar discreto */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary active:scale-95 transition-all cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Ícone com aura suave */}
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4 mt-1">
            {isUnitsLimit ? (
              <Store className="w-8 h-8 text-amber-500" />
            ) : (
              <Crown className="w-8 h-8 text-amber-500" />
            )}
          </div>

          {/* Tag de Limite de Plano */}
          <span className="px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 mb-2">
            Limite do Plano Atingido
          </span>

          {/* Título Principal (24px Bold) */}
          <h2 className="text-[24px] font-bold text-foreground text-center tracking-tight leading-tight">
            {isUnitsLimit
              ? "Precisa de mais unidades?"
              : "Hora de expandir sua equipe! 🚀"}
          </h2>

          {/* Mensagem Explicativa Clara (15px Regular) */}
          <p className="text-[15px] font-normal text-muted-foreground text-center leading-relaxed mt-2.5 px-1">
            {customMessage ? (
              customMessage
            ) : isUnitsLimit ? (
              <>
                Seu plano atual (<strong className="text-foreground">{displayPlanName}</strong>)
                permite gerenciar apenas <strong className="text-foreground">1 unidade</strong>.
                Para abrir novas filiais, faça upgrade para o plano{" "}
                <strong className="text-foreground">Rede</strong> (até 3 unidades) ou{" "}
                <strong className="text-foreground">Enterprise</strong>.
              </>
            ) : (
              <>
                Seu plano atual (<strong className="text-foreground">{displayPlanName}</strong>)
                permite até{" "}
                <strong className="text-foreground">
                  {currentBarbers} {currentBarbers === 1 ? "barbeiro" : "barbeiros"}
                </strong>
                . Para adicionar novos profissionais, faça upgrade para o plano{" "}
                <strong className="text-foreground">{neededTier.name}</strong>.
              </>
            )}
          </p>

          {/* Card Resumo do Plano Recomendado */}
          <div className="w-full rounded-2xl border border-border/70 bg-secondary/30 p-5 mt-5 mb-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-[13px] font-semibold text-foreground/85">
                  Plano Recomendado: DUB {neededTier.name}
                </span>
              </div>
              <div className="text-right">
                {neededTier.isCustomPrice ? (
                  <span className="text-[13px] font-bold text-foreground">Sob Consulta</span>
                ) : (
                  <span className="text-[14px] font-black text-foreground">
                    R$ {neededTier.price.toFixed(2).replace(".", ",")}{" "}
                    <span className="text-[10px] font-normal text-muted-foreground">/mês</span>
                  </span>
                )}
              </div>
            </div>

            <div className="text-[13px] text-muted-foreground space-y-2 pt-2 border-t border-border/30">
              {isUnitsLimit ? (
                <>
                  <p className="flex items-center gap-2 text-[14px] text-foreground/90 font-medium">
                    <span className="text-emerald-500 font-bold">✓</span> Até 3 unidades / filiais
                  </p>
                  <p className="flex items-center gap-2 text-[14px] text-foreground/90 font-medium">
                    <span className="text-emerald-500 font-bold">✓</span> Até 9 barbeiros na equipe
                  </p>
                </>
              ) : (
                <>
                  <p className="flex items-center gap-2 text-[14px] text-foreground/90 font-medium">
                    <span className="text-emerald-500 font-bold">✓</span> Suporta até{" "}
                    {neededTier.maxBarbers === 999999 ? "ilimitados" : neededTier.maxBarbers}{" "}
                    barbeiros
                  </p>
                  <p className="flex items-center gap-2 text-[14px] text-foreground/90 font-medium">
                    <span className="text-emerald-500 font-bold">✓</span> Gestão de comissões por profissional
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Botões de Ação (56px CTA + 44px ação secundária) */}
          <div className="w-full space-y-2.5">
            <button
              onClick={handleNavigateToPlans}
              className="w-full h-14 rounded-[28px] text-[16px] font-semibold bg-foreground text-background hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <Zap className="w-4 h-4" />
              <span>Ver Planos & Fazer Upgrade</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-full h-11 rounded-full text-[14px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Agora não
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
