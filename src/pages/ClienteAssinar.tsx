import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { invokeAuthenticatedFunction } from '@/lib/invokeAuthenticatedFunction';
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  ArrowLeft, 
  Check, 
  CreditCard, 
  Copy, 
  CheckCircle2, 
  TrendingDown,
  Zap,
  Crown,
  Scissors,
  User,
  Store
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { AppHeader } from "@/components/ui/app-shell";
import { resolveClientTenantId } from "@/lib/clientTenant";

interface Plan {
  id: string;
  nome: string;
  descricao: string;
  preco_mensal: number;
  beneficios_json: any;
  limite_agendamentos_mes: number;
}

interface Barber {
  id: string;
  apelido: string;
  foto_url: string | null;
  ativo: boolean;
}

// Componente PlanCard Premium
function PlanCard({ 
  plan, 
  isSelected,
  isPopular, 
  onSelect,
  disabled
}: { 
  plan: Plan;
  isSelected: boolean;
  isPopular?: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  const benefits = Array.isArray(plan.beneficios_json) ? plan.beneficios_json : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      onClick={() => !disabled && onSelect()}
      className={cn(
        "relative rounded-2xl p-6 border transition-all cursor-pointer",
        isSelected
          ? "bg-gradient-to-br from-red-500/10 to-orange-500/10 border-red-500/50 shadow-xl shadow-red-500/10 ring-2 ring-red-500/30"
          : isPopular 
            ? "bg-gradient-to-br from-red-500/5 to-orange-500/5 border-red-500/30 hover:border-red-500/50" 
            : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      {/* Badge "Mais Popular" */}
      {isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <div className="bg-gradient-to-r from-red-500 to-orange-500 text-foreground text-xs font-bold px-4 py-1.5 rounded-full shadow-lg flex items-center gap-1">
            <Crown className="w-3 h-3" />
            MAIS POPULAR
          </div>
        </div>
      )}

      {/* Check de seleção */}
      {isSelected && (
        <div className="absolute top-4 right-4">
          <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center shadow-lg">
            <Check className="w-4 h-4 text-foreground" />
          </div>
        </div>
      )}

      {/* Header do Card */}
      <div className="mb-4 pr-10">
        <h3 className="text-2xl font-bold text-foreground mb-2">
          {plan.nome}
        </h3>
        <p className="text-sm text-zinc-400">
          {plan.descricao}
        </p>
      </div>

      {/* Preço */}
      <div className="mb-6">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold text-red-500">
            R$ {plan.preco_mensal.toFixed(2).replace('.', ',')}
          </span>
          <span className="text-zinc-500">/mês</span>
        </div>
      </div>

      {/* Benefícios */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
          Benefícios inclusos
        </h4>
        
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <span className="text-sm text-zinc-300">
            {plan.limite_agendamentos_mes} agendamentos por mês
          </span>
        </div>
        
        {benefits.map((beneficio: string, index: number) => (
          <div key={index} className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <span className="text-sm text-zinc-300">{beneficio}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

const ClienteAssinar = () => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card' | 'cash'>('pix');
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(null);
  
  // Card payment states
  const [cardHolderName, setCardHolderName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiryMonth, setCardExpiryMonth] = useState("");
  const [cardExpiryYear, setCardExpiryYear] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  
  // PIX payment states
  const [pixQrCode, setPixQrCode] = useState<string | null>(null);
  const [pixPayload, setPixPayload] = useState<string | null>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [gatewaySubscriptionId, setGatewaySubscriptionId] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user?.id ?? null;
      const tenantId = await resolveClientTenantId({ userId: uid });
      setResolvedTenantId(tenantId);

      await Promise.all([
        loadPlans(tenantId),
        loadBarbers(tenantId),
        checkActiveSubscription(),
      ]);
    };

    init();
  }, []);

  // Poll for payment confirmation when showing PIX QR Code
  useEffect(() => {
    if (step === 5 && pixQrCode && gatewaySubscriptionId && !paymentConfirmed) {
      const pollInterval = setInterval(async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) return;

          const { data: subscription, error } = await supabase
            .from("assinaturas")
            .select("status")
            .eq("gateway_subscription_id", gatewaySubscriptionId)
            .eq("user_id", session.user.id)
            .maybeSingle();

          if (error) {
            console.error("Error checking subscription:", error);
            return;
          }

          if (subscription && subscription.status === 'active') {
            setPaymentConfirmed(true);
            clearInterval(pollInterval);
            toast.success("Pagamento confirmado!");
            
            setTimeout(() => {
              navigate("/cliente");
            }, 3000);
          }
        } catch (error) {
          console.error("Error polling payment status:", error);
        }
      }, 3000);

      return () => clearInterval(pollInterval);
    }
  }, [step, pixQrCode, gatewaySubscriptionId, paymentConfirmed, navigate]);

  const checkActiveSubscription = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data } = await supabase
      .from('assinaturas')
      .select('id')
      .eq('user_id', session.user.id)
      .in('status', ['active', 'suspended', 'pending_cash'])
      .maybeSingle();

    setHasActiveSubscription(!!data);
  };

  const loadPlans = async (tenantId?: string | null) => {
    let query = supabase
      .from('planos')
      .select('id, nome, descricao, preco_mensal, beneficios_json, limite_agendamentos_mes, ativo, prioridade_agendamento, tenant_id, servico_id')
      .eq('ativo', true)
      .order('preco_mensal');

    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    } else {
      query = query.is('tenant_id', null);
    }

    const { data } = await query;
    setPlans(data || []);
  };

  const loadBarbers = async (tenantId?: string | null) => {
    let query = supabase
      .from('barbeiros')
      .select('id, apelido, foto_url, ativo')
      .eq('ativo', true)
      .is('deleted_at', null)
      .order('apelido');

    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    } else {
      query = query.is('tenant_id', null);
    }

    const { data } = await query;
    setBarbers(data || []);
  };

  const handleSubscribe = async () => {
    if (!selectedPlan) return;

    if (paymentMethod === 'card') {
      if (!cardHolderName || !cardNumber || !cardExpiryMonth || !cardExpiryYear || !cardCvv) {
        toast.error("Preencha todos os dados do cartão");
        return;
      }
    }

    if (!selectedBarber) {
      toast.error("Selecione um barbeiro");
      return;
    }

    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Você precisa estar logado");
        navigate("/auth");
        return;
      }

      // Pagamento na Barbearia: criar assinatura diretamente no DB
      if (paymentMethod === 'cash') {
        const { data: existingSub } = await supabase
          .from('assinaturas')
          .select('id')
          .eq('user_id', session.user.id)
          .in('status', ['active', 'suspended', 'pending_cash'])
          .maybeSingle();

        if (existingSub) {
          toast.error("Você já possui uma assinatura ativa ou pendente");
          setLoading(false);
          return;
        }

        const { error: insertError } = await supabase
          .from('assinaturas')
          .insert({
            user_id: session.user.id,
            plano_id: selectedPlan.id,
            barbeiro_id: selectedBarber.id,
            status: 'pending_cash' as any,
            payment_method: 'cash' as any,
            next_billing_date: null,
          });

        if (insertError) throw insertError;

        toast.success("Assinatura criada! Dirija-se à barbearia para realizar o pagamento.");
        setTimeout(() => navigate("/cliente"), 2000);
        return;
      }

      const payload: any = {
        planoId: selectedPlan.id,
        paymentMethod,
        barbeiroId: selectedBarber.id,
      };

      if (paymentMethod === 'card') {
        payload.cardInfo = {
          holderName: cardHolderName.trim(),
          number: cardNumber.replace(/\s/g, ''),
          expiryMonth: cardExpiryMonth.trim(),
          expiryYear: cardExpiryYear.trim(),
          ccv: cardCvv.trim(),
        };
      }

      const { data, error } = await invokeAuthenticatedFunction('create-subscription', {
        body: payload
      });

      if (error) throw error;

      if (paymentMethod === 'pix' && data.wooviSubscription?.firstPayment?.pixQrCode) {
        setPixQrCode(data.wooviSubscription.firstPayment.pixQrCode.encodedImage);
        setPixPayload(data.wooviSubscription.firstPayment.pixQrCode.payload);
        setGatewaySubscriptionId(data.wooviSubscription.id);
        toast.success("QR Code gerado! Escaneie para pagar.");
        setStep(5);
      } else if (paymentMethod === 'card') {
        if (data.wooviSubscription?.firstPayment?.status === 'CONFIRMED') {
          toast.success("Pagamento aprovado! Assinatura ativada.");
          navigate("/cliente");
        } else {
          toast.error("Pagamento recusado. Verifique os dados do cartão.");
        }
      }
    } catch (error: any) {
      console.error('Subscription error:', error);
      toast.error("Erro ao criar assinatura: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const copyPixCode = () => {
    if (pixPayload) {
      navigator.clipboard.writeText(pixPayload);
      toast.success("Código PIX copiado!");
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground pb-20">

      {/* HEADER — padrão app-shell */}
      <AppHeader
        title="Planos de assinatura"
        onBack={() => (step === 1 ? navigate("/cliente") : setStep(step - 1))}
      />

      <div className="max-w-2xl mx-auto p-4 space-y-6">
        
        {/* Aviso de assinatura ativa */}
        {hasActiveSubscription && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4"
          >
            <p className="text-sm text-orange-400">
              Você já possui uma assinatura ativa. Cancele-a antes de assinar outro plano.
            </p>
          </motion.div>
        )}

        {/* Step 1: Seleção de Plano */}
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-4"
            >
              {/* Destaque - Economia */}
              <div className="bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/20 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                    <TrendingDown className="w-6 h-6 text-red-500" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">Economize até R$ 50/mês</h3>
                    <p className="text-sm text-zinc-400">Com agendamento prioritário e garantido</p>
                  </div>
                </div>
              </div>

              {/* Cards de Planos */}
              <div className="space-y-4">
                {plans.map((plan, index) => (
                  <PlanCard 
                    key={plan.id}
                    plan={plan}
                    isSelected={selectedPlan?.id === plan.id}
                    isPopular={index === Math.floor(plans.length / 2)}
                    onSelect={() => setSelectedPlan(plan)}
                    disabled={hasActiveSubscription}
                  />
                ))}
              </div>

              <Button
                onClick={() => setStep(2)}
                disabled={!selectedPlan || hasActiveSubscription}
                className="w-full h-14 text-lg font-bold bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 shadow-lg shadow-red-500/20"
              >
                Continuar
              </Button>
            </motion.div>
          )}

          {/* Step 2: Seleção de Barbeiro */}
          {step === 2 && selectedPlan && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div>
                <h2 className="text-xl font-bold mb-1 text-foreground">Escolha seu Barbeiro</h2>
                <p className="text-sm text-zinc-400">
                  Selecione o profissional que vai te atender durante a assinatura
                </p>
              </div>

              <div className="space-y-3">
                {barbers.map((barber) => (
                  <motion.div
                    key={barber.id}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedBarber(barber)}
                    className={cn(
                      "flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all",
                      selectedBarber?.id === barber.id
                        ? "bg-red-500/10 border-red-500/50 ring-2 ring-red-500/30"
                        : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
                    )}
                  >
                    {/* Avatar */}
                    <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden flex-shrink-0 ring-2 ring-zinc-700">
                      {barber.foto_url ? (
                        <img src={barber.foto_url} alt={barber.apelido} className="w-full h-full object-cover" />
                      ) : (
                        <Scissors className="w-6 h-6 text-zinc-500" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-foreground text-lg">{barber.apelido}</h4>
                      <p className="text-sm text-zinc-500">Profissional disponível</p>
                    </div>

                    {/* Check */}
                    {selectedBarber?.id === barber.id && (
                      <div className="w-7 h-7 bg-red-500 rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-foreground" />
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>

              {barbers.length === 0 && (
                <div className="text-center py-8">
                  <User className="w-10 h-10 mx-auto text-zinc-600 mb-3" />
                  <p className="text-zinc-400">Nenhum barbeiro disponível</p>
                </div>
              )}

              <Button
                onClick={() => setStep(3)}
                disabled={!selectedBarber}
                className="w-full h-14 text-lg font-bold bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 shadow-lg shadow-red-500/20"
              >
                Continuar
              </Button>
            </motion.div>
          )}

          {/* Step 3: Método de Pagamento */}
          {step === 3 && selectedPlan && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div>
                <h2 className="text-xl font-bold mb-1">Forma de Pagamento</h2>
                <p className="text-sm text-zinc-400">
                  Escolha como deseja pagar sua assinatura mensal
                </p>
              </div>

              {/* Resumo do plano */}
              <div className="bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/30 rounded-xl p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-semibold text-foreground">{selectedPlan.nome}</div>
                    <div className="text-sm text-zinc-400">Cobrança mensal</div>
                  </div>
                  <div className="text-2xl font-bold text-red-500">
                    R$ {selectedPlan.preco_mensal.toFixed(2).replace('.', ',')}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {/* PIX */}
                <motion.div
                  whileTap={{ scale: 0.98 }}
                  className={cn(
                    "p-4 rounded-xl border cursor-pointer transition-all",
                    paymentMethod === 'pix'
                      ? "bg-red-500/10 border-red-500/50 ring-2 ring-red-500/30"
                      : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
                  )}
                  onClick={() => setPaymentMethod('pix')}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                      paymentMethod === 'pix' ? "border-red-500" : "border-zinc-600"
                    )}>
                      {paymentMethod === 'pix' && (
                        <div className="w-3 h-3 rounded-full bg-red-500" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-zinc-400" />
                        <h4 className="font-semibold text-foreground">PIX</h4>
                      </div>
                      <p className="text-xs text-zinc-500">
                        Você receberá um QR Code todo mês
                      </p>
                    </div>
                  </div>
                </motion.div>

                {/* Pagar na Barbearia */}
                <motion.div
                  whileTap={{ scale: 0.98 }}
                  className={cn(
                    "p-4 rounded-xl border cursor-pointer transition-all",
                    paymentMethod === 'cash'
                      ? "bg-red-500/10 border-red-500/50 ring-2 ring-red-500/30"
                      : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
                  )}
                  onClick={() => setPaymentMethod('cash')}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                      paymentMethod === 'cash' ? "border-red-500" : "border-zinc-600"
                    )}>
                      {paymentMethod === 'cash' && (
                        <div className="w-3 h-3 rounded-full bg-red-500" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Store className="w-4 h-4 text-zinc-400" />
                        <h4 className="font-semibold text-foreground">Pagar na Barbearia</h4>
                      </div>
                      <p className="text-xs text-zinc-500">
                        Pague presencialmente • Barbeiro confirma o pagamento
                      </p>
                    </div>
                  </div>
                </motion.div>
              </div>

              <Button
                onClick={() => setStep(4)}
                className="w-full h-14 text-lg font-bold bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 shadow-lg shadow-red-500/20"
              >
                Continuar
              </Button>
            </motion.div>
          )}

          {/* Step 4: Dados de Pagamento */}
          {step === 4 && selectedPlan && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div>
                <h2 className="text-xl font-bold mb-1">
                  {paymentMethod === 'cash' ? 'Confirmação' : 'Dados de Pagamento'}
                </h2>
                <p className="text-sm text-zinc-400">
                  {paymentMethod === 'card' 
                    ? 'Preencha os dados do seu cartão' 
                    : paymentMethod === 'cash'
                    ? 'Confirme para solicitar seu plano'
                    : 'Confirme para gerar o QR Code'}
                </p>
              </div>

              {paymentMethod === 'cash' && (
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center">
                      <Store className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground">Pagar na Barbearia</h4>
                      <p className="text-sm text-zinc-400">Pagamento presencial</p>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm text-zinc-400">
                    <p>• Seu plano ficará <span className="text-amber-400 font-medium">pendente</span> até o barbeiro confirmar o pagamento</p>
                    <p>• Dirija-se à barbearia e realize o pagamento</p>
                    <p>• O barbeiro dará baixa e seu plano será ativado automaticamente</p>
                    <p>• Todo mês o processo se repete</p>
                  </div>
                </div>
              )}

              {paymentMethod === 'card' && (
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
                  <div>
                    <Label htmlFor="cardHolderName" className="text-zinc-400 text-sm">Nome no Cartão</Label>
                    <Input
                      id="cardHolderName"
                      placeholder="Como está no cartão"
                      value={cardHolderName}
                      onChange={(e) => setCardHolderName(e.target.value)}
                      className="bg-zinc-800/50 border-zinc-700 mt-1.5"
                    />
                  </div>

                  <div>
                    <Label htmlFor="cardNumber" className="text-zinc-400 text-sm">Número do Cartão</Label>
                    <Input
                      id="cardNumber"
                      placeholder="0000 0000 0000 0000"
                      value={cardNumber}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '');
                        const formatted = value.replace(/(\d{4})(?=\d)/g, '$1 ');
                        setCardNumber(formatted);
                      }}
                      maxLength={19}
                      className="bg-zinc-800/50 border-zinc-700 mt-1.5"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label htmlFor="cardExpiryMonth" className="text-zinc-400 text-sm">Mês</Label>
                      <Input
                        id="cardExpiryMonth"
                        placeholder="MM"
                        value={cardExpiryMonth}
                        onChange={(e) => setCardExpiryMonth(e.target.value.replace(/\D/g, '').slice(0, 2))}
                        maxLength={2}
                        className="bg-zinc-800/50 border-zinc-700 mt-1.5"
                      />
                    </div>

                    <div>
                      <Label htmlFor="cardExpiryYear" className="text-zinc-400 text-sm">Ano</Label>
                      <Input
                        id="cardExpiryYear"
                        placeholder="AAAA"
                        value={cardExpiryYear}
                        onChange={(e) => setCardExpiryYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        maxLength={4}
                        className="bg-zinc-800/50 border-zinc-700 mt-1.5"
                      />
                    </div>

                    <div>
                      <Label htmlFor="cardCvv" className="text-zinc-400 text-sm">CVV</Label>
                      <Input
                        id="cardCvv"
                        placeholder="123"
                        type="password"
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        maxLength={4}
                        className="bg-zinc-800/50 border-zinc-700 mt-1.5"
                      />
                    </div>
                  </div>
                </div>
              )}

              {paymentMethod === 'pix' && (
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center">
                      <Zap className="w-5 h-5 text-green-500" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground">Pagamento PIX</h4>
                      <p className="text-sm text-zinc-400">Rápido e seguro</p>
                    </div>
                  </div>
                  <p className="text-sm text-zinc-400">
                    Clique em confirmar para gerar o QR Code PIX para pagamento da sua primeira mensalidade.
                  </p>
                </div>
              )}

              {/* Resumo */}
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 space-y-3">
                <div className="flex justify-between py-2 border-b border-zinc-800">
                  <span className="text-zinc-400">Plano:</span>
                  <span className="font-semibold text-foreground">{selectedPlan.nome}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-zinc-800">
                  <span className="text-zinc-400">Barbeiro:</span>
                  <span className="font-semibold text-foreground">{selectedBarber?.apelido || '—'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-zinc-800">
                  <span className="text-zinc-400">Forma de Pagamento:</span>
                  <span className="font-semibold text-foreground">
                    {paymentMethod === 'card' ? 'Cartão de Crédito' : paymentMethod === 'cash' ? 'Pagar na Barbearia' : 'PIX'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-3 bg-red-500/10 -mx-4 -mb-4 px-4 rounded-b-xl">
                  <span className="font-semibold text-foreground">Valor Mensal:</span>
                  <span className="text-2xl font-bold text-red-500">
                    R$ {selectedPlan.preco_mensal.toFixed(2).replace('.', ',')}
                  </span>
                </div>
              </div>

              <Button
                onClick={handleSubscribe}
                disabled={loading}
                className="w-full h-14 text-lg font-bold bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 shadow-lg shadow-red-500/20"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processando...
                  </div>
                ) : (
                  "Confirmar Assinatura"
                )}
              </Button>
            </motion.div>
          )}

          {/* Step 5: QR Code PIX */}
          {step === 5 && pixQrCode && (
            <motion.div
              key="step5"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-6"
            >
              {paymentConfirmed ? (
                <div className="bg-zinc-900/50 border border-green-500/30 rounded-2xl p-8 text-center space-y-4">
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="flex justify-center"
                  >
                    <div className="bg-green-500/20 rounded-full p-4">
                      <CheckCircle2 className="w-16 h-16 text-green-500" />
                    </div>
                  </motion.div>
                  <div>
                    <h2 className="text-2xl font-bold mb-2 text-foreground">Pagamento Confirmado</h2>
                    <p className="text-zinc-400">
                      Sua assinatura foi ativada com sucesso!
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-center">
                    <h2 className="text-xl font-bold mb-1 text-foreground">Escaneie o QR Code</h2>
                    <p className="text-sm text-zinc-400">
                      Use o app do seu banco para pagar
                    </p>
                  </div>

                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 space-y-6">
                    <div className="flex justify-center bg-white p-4 rounded-xl">
                      <img
                        src={pixQrCode.startsWith("https://") || pixQrCode.startsWith("data:") ? pixQrCode : `data:image/png;base64,${pixQrCode}`}
                        alt="QR Code PIX"
                        className="w-64 h-64"
                      />
                    </div>

                    {pixPayload && (
                      <div className="space-y-4">
                        <p className="text-base font-semibold text-foreground text-center">
                          Ou copie o código PIX
                        </p>
                        
                        <div className="bg-zinc-800/50 p-4 rounded-xl border border-zinc-700">
                          <p className="text-xs text-zinc-400 font-mono break-all">
                            {pixPayload}
                          </p>
                        </div>

                        <Button
                          onClick={copyPixCode}
                          className="w-full h-14 text-base font-semibold bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 shadow-lg shadow-red-500/20"
                        >
                          <Copy className="w-5 h-5 mr-2" />
                          Copiar Código PIX
                        </Button>
                        
                        <p className="text-xs text-zinc-500 text-center">
                          Toque no botão acima para copiar o código automaticamente
                        </p>
                      </div>
                    )}

                    <div className="text-center pt-4 border-t border-zinc-800">
                      <div className="flex items-center justify-center gap-2 text-zinc-400">
                        <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                        <p className="text-sm">
                          Aguardando confirmação do pagamento...
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ClienteAssinar;
