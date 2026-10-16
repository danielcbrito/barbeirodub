import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveClientTenantId } from "@/lib/clientTenant";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  ChevronLeft,
  Crown,
  TrendingDown
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { fetchPlanOrder, sortPlansByCustomOrder } from "@/lib/plansOrder";

interface Plan {
  id: string;
  nome: string;
  descricao: string;
  preco_mensal: number;
  beneficios_json: any;
  limite_agendamentos_mes: number;
}

type LoadingState = "idle" | "loading" | "success" | "error";

interface SubscribePlanSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

function PlanCard({ plan, isPopular, onSubscribe, isSubscribing }: {
  plan: Plan;
  isPopular: boolean;
  onSubscribe: () => void;
  isSubscribing: boolean;
}) {
  const benefits = Array.isArray(plan.beneficios_json) ? plan.beneficios_json : [];

  return (
    <div className={cn(
      "relative rounded-2xl p-6 border transition-all duration-300",
      isPopular
        ? "bg-gradient-to-br from-red-500/10 to-orange-500/5 border-red-500/30 shadow-lg shadow-red-500/10"
        : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
    )}>
      {isPopular && (
        <div className="absolute -top-3 left-4 bg-red-500 text-foreground text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
          <Crown className="w-3 h-3" />
          Mais Popular
        </div>
      )}

      <h3 className="text-lg font-bold text-foreground mt-1">{plan.nome}</h3>
      {plan.descricao && (
        <p className="text-sm text-zinc-400 mt-1">{plan.descricao}</p>
      )}

      <div className="flex items-baseline gap-1 mt-4">
        <span className="text-3xl font-extrabold text-foreground">
          R$ {plan.preco_mensal?.toFixed(2).replace(".", ",")}
        </span>
        <span className="text-sm text-zinc-500">/mês</span>
      </div>

      {benefits.length > 0 && (
        <ul className="mt-4 space-y-2">
          {benefits.map((b: any, i: number) => (
            <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
              <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
              <span>{typeof b === "string" ? b : b?.texto || b?.label || JSON.stringify(b)}</span>
            </li>
          ))}
        </ul>
      )}

      <Button
        onClick={onSubscribe}
        disabled={isSubscribing}
        className={cn(
          "w-full mt-5 h-12 font-bold rounded-xl transition-all",
          isPopular
            ? "bg-red-500 hover:bg-red-600 text-foreground"
            : "bg-zinc-800 hover:bg-zinc-700 text-foreground"
        )}
      >
        {isSubscribing ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          "Assinar Agora"
        )}
      </Button>
    </div>
  );
}

export function SubscribePlanSheet({ open, onOpenChange, userId }: SubscribePlanSheetProps) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>("idle");
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    const init = async () => {
      const tenantId = await resolveClientTenantId({ userId });
      setResolvedTenantId(tenantId);
      await loadPlans(tenantId);
    };

    init();
  }, [open, userId]);
  const loadPlans = async (tenantId?: string | null) => {
    setLoadingState("loading");
    setErrorMessage("");
    
    try {
      let query = supabase
        .from("planos")
        .select("id, nome, descricao, preco_mensal, beneficios_json, limite_agendamentos_mes, ativo, prioridade_agendamento, tenant_id, servico_id")
        .eq("ativo", true)
        .order("prioridade_agendamento", { ascending: false });

      if (tenantId) {
        query = query.eq("tenant_id", tenantId);
      } else {
        query = query.is("tenant_id", null);
      }

      const { data, error } = await query;

      if (error) {
        setLoadingState("error");
        setErrorMessage("Não foi possível carregar os planos disponíveis.");
        toast.error("Erro ao carregar planos");
      } else {
        const normalizedData = (data || []).map(plan => ({
          ...plan,
          beneficios_json: Array.isArray(plan.beneficios_json) 
            ? plan.beneficios_json 
            : typeof plan.beneficios_json === 'string'
            ? JSON.parse(plan.beneficios_json)
            : []
        }));

        const orderList = await fetchPlanOrder(tenantId);
        const sortedPlans = sortPlansByCustomOrder(normalizedData, orderList);

        setPlans(sortedPlans);
        setLoadingState("success");

        if (sortedPlans.length === 0) {
          setErrorMessage("Nenhum plano disponível no momento.");
        }
      }
    } catch (err) {
      setLoadingState("error");
      setErrorMessage("Erro inesperado ao carregar planos. Verifique sua conexão.");
    }
  };

  const handleSubscribe = async (planId: string) => {
    if (!userId) {
      toast.error("Usuário não autenticado");
      return;
    }

    setSubscribing(planId);

    try {
      const { data: existingSubscription, error: checkError } = await supabase
        .from("assinaturas")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();

      if (checkError) {
        toast.error("Erro ao verificar assinaturas existentes");
        setSubscribing(null);
        return;
      }

      if (existingSubscription) {
        toast.error("Você já possui um plano ativo");
        setSubscribing(null);
        return;
      }

      const nextBillingDate = new Date();
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

      const { error: insertError } = await supabase
        .from("assinaturas")
        .insert([{
          user_id: userId,
          plano_id: planId,
          status: "active",
          next_billing_date: format(nextBillingDate, 'yyyy-MM-dd')
        }]);

      if (insertError) {
        toast.error("Erro ao criar assinatura. Tente novamente.");
      } else {
        toast.success("✅ Assinatura efetuada com sucesso!");
        setTimeout(() => {
          onOpenChange(false);
        }, 1000);
      }
    } catch (err) {
      toast.error("Erro inesperado ao criar assinatura");
    } finally {
      setSubscribing(null);
    }
  };

  const renderLoadingState = () => (
    <div className="space-y-4 pb-6">
      {[1, 2].map((i) => (
        <div key={i} className="bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800">
          <Skeleton className="h-6 w-3/4 mb-3 bg-zinc-800" />
          <Skeleton className="h-4 w-full mb-2 bg-zinc-800" />
          <Skeleton className="h-10 w-32 mb-4 bg-zinc-800" />
          <Skeleton className="h-20 w-full mb-3 bg-zinc-800" />
          <Skeleton className="h-12 w-full bg-zinc-800" />
        </div>
      ))}
    </div>
  );

  const renderErrorState = () => (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center py-12 space-y-6"
    >
      <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
        <AlertCircle className="w-10 h-10 text-red-500" />
      </div>
      <div className="space-y-2">
        <p className="text-lg font-semibold text-foreground">Erro ao carregar planos</p>
        <p className="text-sm text-zinc-400 max-w-xs mx-auto">
          {errorMessage}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Button
          onClick={() => loadPlans(resolvedTenantId)}
          className="h-12 px-6 bg-red-500 hover:bg-red-600"
        >
          <Loader2 className="w-4 h-4 mr-2" />
          Tentar Novamente
        </Button>
        <Button
          onClick={() => onOpenChange(false)}
          variant="ghost"
          className="text-zinc-400"
        >
          Voltar
        </Button>
      </div>
    </motion.div>
  );

  const renderEmptyState = () => (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center py-12 space-y-6"
    >
      <div className="w-20 h-20 bg-zinc-800/50 rounded-full flex items-center justify-center mx-auto">
        <Crown className="w-10 h-10 text-zinc-600" />
      </div>
      <div className="space-y-2">
        <p className="text-lg font-semibold text-zinc-400">Nenhum plano disponível</p>
        <p className="text-sm text-zinc-500">
          Não há planos disponíveis no momento. Tente novamente mais tarde.
        </p>
      </div>
      <Button
        onClick={() => onOpenChange(false)}
        variant="ghost"
        className="text-zinc-400"
      >
        Voltar
      </Button>
    </motion.div>
  );

  const renderPlansList = () => (
    <div className="space-y-4 pb-20">
      {/* Destaque - Economia */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/20 rounded-xl p-4 mb-6"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center">
            <TrendingDown className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 className="font-bold text-foreground text-sm">Economize todo mês</h3>
            <p className="text-xs text-zinc-400">Agendamento prioritário garantido</p>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {plans.map((plan, index) => (
          <motion.div
            key={plan.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <PlanCard 
              plan={plan}
              isPopular={index === 0}
              onSubscribe={() => handleSubscribe(plan.id)}
              isSubscribing={subscribing === plan.id}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="bottom" 
        className="h-[90vh] rounded-t-3xl flex flex-col overflow-hidden bg-zinc-950 border-zinc-800 p-0"
      >
        {/* Header */}
        <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 px-4 py-4 z-10">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => onOpenChange(false)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 hover:bg-zinc-700 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-foreground" />
              <h2 className="text-lg font-bold">Escolha seu Plano</h2>
            </div>
          </div>
        </div>

        {/* Container com scroll */}
        <div className="flex-1 overflow-y-auto p-4">
          {loadingState === "loading" && renderLoadingState()}
          {loadingState === "error" && renderErrorState()}
          {loadingState === "success" && plans.length === 0 && renderEmptyState()}
          {loadingState === "success" && plans.length > 0 && renderPlansList()}
        </div>
      </SheetContent>
    </Sheet>
  );
}
