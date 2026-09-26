import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import {
  Shield, Zap, Calendar, Users, BarChart3, MessageSquare,
  Crown, CheckCircle2, ArrowRight, Lock, Star
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface TenantPaywallProps {
  tenantNome: string;
  onLogout: () => void;
}

interface PlanData {
  id: string;
  nome: string;
  descricao: string;
  preco_mensal: number;
  funcionalidades: string[];
  destaque: boolean;
}

const FEATURE_ICONS: Record<string, any> = {
  "Agenda inteligente ilimitada": Calendar,
  "Gestão completa de clientes": Users,
  "Relatórios e estatísticas": BarChart3,
  "Sistema financeiro completo": Shield,
  "Promoções e cupons": Star,
  "Disparos via WhatsApp": MessageSquare,
  "Suporte prioritário": Zap,
  "Sem limite de barbeiros": Users,
};

/**
 * Tela de bloqueio total — aparece quando o trial expirou.
 * Usa técnicas avançadas de conversão:
 * - Autoridade (números concretos)
 * - Escassez (oferta limitada)
 * - Prova social implícita
 * - Reciprocidade (já configurou tudo, não perca)
 * - Aversão à perda (seus dados estão seguros MAS inacessíveis)
 */
export function TenantPaywall({ tenantNome, onLogout }: TenantPaywallProps) {
  const [plan, setPlan] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPlan = async () => {
      const { data } = await supabase
        .from("tenant_planos")
        .select("id, nome, descricao, preco_mensal, preco_anual, funcionalidades, ativo, destaque")
        .eq("ativo", true)
        .eq("destaque", true)
        .limit(1)
        .maybeSingle();

      if (data) {
        setPlan({
          ...data,
          funcionalidades: Array.isArray(data.funcionalidades)
            ? data.funcionalidades as string[]
            : [],
        });
      }
      setLoading(false);
    };
    loadPlan();
  }, []);

  const firstName = tenantNome?.split(" ")[0] || "Profissional";

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      {/* Header com gradiente premium */}
      <div
        className="relative px-6 pt-14 pb-10 text-center overflow-hidden"
        style={{
          background: "linear-gradient(165deg, hsl(var(--primary) / 0.15) 0%, hsl(var(--background)) 70%)",
        }}
      >
        {/* Círculos decorativos */}
        <div className="absolute top-8 right-8 w-32 h-32 rounded-full bg-primary/5 blur-2xl" />
        <div className="absolute bottom-4 left-6 w-24 h-24 rounded-full bg-primary/8 blur-xl" />

        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 18, delay: 0.1 }}
          className="relative z-10 w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-5"
        >
          <Lock className="w-7 h-7 text-primary" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="relative z-10 space-y-2"
        >
          <h1 className="text-[22px] font-bold text-foreground leading-tight">
            {firstName}, seu período de teste acabou
          </h1>
          <p className="text-[13px] text-muted-foreground leading-relaxed max-w-sm mx-auto">
            Você já configurou <span className="text-foreground font-medium">tudo</span> — sua agenda, seus serviços, seus horários.
            Não deixe esse trabalho ser perdido.
          </p>
        </motion.div>
      </div>

      {/* Corpo — benefícios e CTA */}
      <div className="flex-1 px-5 pb-8 space-y-6">

        {/* Card de dados seguros (reciprocidade + aversão à perda) */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-xl border border-border/40 p-4"
          style={{
            background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--primary) / 0.04) 100%)",
          }}
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Shield className="w-4 h-4 text-emerald-500" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-foreground">Seus dados estão seguros</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                Todas as suas configurações, clientes e histórico foram preservados. 
                Ao assinar, tudo volta exatamente como estava.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Plano com funcionalidades */}
        {plan && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="rounded-xl border border-primary/20 p-5 relative overflow-hidden"
            style={{
              background: "linear-gradient(150deg, hsl(var(--card)) 0%, hsl(var(--primary) / 0.06) 100%)",
            }}
          >
            {/* Badge destaque */}
            <div className="flex items-center gap-2 mb-4">
              <Crown className="w-4.5 h-4.5 text-primary" />
              <span className="text-[14px] font-bold text-foreground">{plan.nome}</span>
              <div className="ml-auto flex items-baseline gap-0.5">
                <span className="text-[11px] text-muted-foreground">R$</span>
                <span className="text-[22px] font-bold text-primary leading-none">
                  {plan.preco_mensal.toFixed(2).replace(".", ",")}
                </span>
                <span className="text-[11px] text-muted-foreground">/mês</span>
              </div>
            </div>

            <p className="text-[12px] text-muted-foreground mb-4 leading-relaxed">
              {plan.descricao}
            </p>

            <div className="space-y-2.5">
              {plan.funcionalidades.map((feat, i) => {
                const Icon = FEATURE_ICONS[feat] || CheckCircle2;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 + i * 0.06 }}
                    className="flex items-center gap-2.5"
                  >
                    <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span className="text-[12px] text-foreground/90">{feat}</span>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* CTA principal */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="space-y-3 pt-2"
        >
          <Button
            onClick={() => {
              // Abrir página de assinatura (por enquanto alerta — integração Cakto futura)
              window.open("https://wa.me/5500000000000?text=Quero+assinar+o+plano+Profissional", "_blank");
            }}
            className="w-full h-13 text-[14px] font-semibold rounded-xl bg-primary hover:bg-primary/90 transition-all duration-300 group"
          >
            Assinar Agora
            <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-0.5" />
          </Button>

          <p className="text-center text-[10px] text-muted-foreground">
            Cancele quando quiser • Sem taxa de adesão • Suporte dedicado
          </p>
        </motion.div>

        {/* Proof social sutil */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1 }}
          className="text-center pt-2"
        >
          <p className="text-[11px] text-muted-foreground/70">
            Mais de <span className="text-foreground/80 font-medium">200 barbearias</span> já confiam na nossa plataforma
          </p>
        </motion.div>

        {/* Link secundário para sair */}
        <div className="text-center pt-4">
          <button
            onClick={onLogout}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
          >
            Sair da conta
          </button>
        </div>
      </div>
    </div>
  );
}
