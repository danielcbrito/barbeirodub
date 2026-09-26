import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import {
  Wallet, CheckCircle2, Loader2, ChevronRight, QrCode,
  CreditCard, TrendingUp, X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

interface CreateBankBannerProps {
  barbeiroId: string;
  basePath?: string;
  /** "card" = banner completo (dashboard), "inline" = compacto (dentro de telas) */
  variant?: "card" | "inline";
}

type BankStatus = "loading" | "active" | "missing_data" | "ready" | "creating" | "error";

/**
 * Banner premium de ativação da carteira digital (subconta Woovi).
 * Design persuasivo com gradientes e copy orientada a conversão.
 */
export function CreateBankBanner({ barbeiroId, basePath = "/barbeiro", variant = "card" }: CreateBankBannerProps) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<BankStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    checkStatus();
  }, [barbeiroId]);

  const checkStatus = async () => {
    try {
      const [barberRes, privateRes] = await Promise.all([
        supabase
          .from("barbeiros")
          .select("woovi_pix_key, conta_configurada, conta_financeira_id, apelido, tenant_id, user_id")
          .eq("id", barbeiroId)
          .single(),
        supabase
          .from("barbeiros_private")
          .select("cpf, email")
          .eq("barbeiro_id", barbeiroId)
          .maybeSingle(),
      ]);

      if (barberRes.error) throw barberRes.error;

      const hasConfiguredWallet =
        !!barberRes.data?.woovi_pix_key ||
        (!!barberRes.data?.conta_configurada && !!barberRes.data?.conta_financeira_id);

      if (hasConfiguredWallet) {
        setStatus("active");
        return;
      }

      // Barbeiro de tenant (não-owner) — usa conta compartilhada do dono
      if (barberRes.data?.tenant_id && barberRes.data?.user_id) {
        const { data: tenantData } = await supabase
          .from("tenants")
          .select("owner_user_id")
          .eq("id", barberRes.data.tenant_id)
          .maybeSingle();

        if (tenantData?.owner_user_id && tenantData.owner_user_id !== barberRes.data.user_id) {
          setStatus("active");
          return;
        }
      }

      // Barbeiro funcionário por role global — usa conta compartilhada
      if (barberRes.data?.user_id) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", barberRes.data.user_id);

        const userRoles = (roles || []).map((r) => String(r.role));
        const hasBarberRole = userRoles.includes("barber") || userRoles.includes("barbeiro");
        const isEmployee = hasBarberRole && !userRoles.includes("admin") && !userRoles.includes("tenant_admin");

        if (isEmployee) {
          setStatus("active");
          return;
        }
      }

      const cpf = privateRes.data?.cpf?.replace(/\D/g, "");
      const email = privateRes.data?.email?.trim();

      if (!cpf || !email) {
        setStatus("missing_data");
        return;
      }

      setStatus("ready");
    } catch (err) {
      console.error("[CreateBankBanner] Erro:", err);
      setStatus("error");
      setErrorMsg("Erro ao verificar carteira");
    }
  };

  // Não renderiza nada enquanto carrega ou se carteira já está ativa
  if (status === "loading") return null;
  if (status === "active") return null;
  if (dismissed) return null;

  // ── Dados incompletos — direcionamento suave ──
  if (status === "missing_data") {
    return (
      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
        onClick={() => navigate(`${basePath}/financeiro`)}
        className="group w-full relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.06] via-background to-primary/[0.03] transition-all active:scale-[0.985] hover:border-primary/30"
      >
        {/* Glow sutil */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/[0.04] rounded-full blur-2xl pointer-events-none" />

        <div className="relative flex items-center gap-3.5 px-4 py-4">
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 transition-transform group-hover:scale-105">
            <QrCode className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-[13px] font-bold text-foreground leading-tight">
              Ative pagamentos via PIX
            </p>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              Complete seus dados para começar a receber
            </p>
          </div>
          <ChevronRight className="w-4.5 h-4.5 text-primary/50 shrink-0 transition-transform group-hover:translate-x-0.5" />
        </div>
      </motion.button>
    );
  }

  // ── Erro ──
  if (status === "error") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl bg-destructive/[0.06] border border-destructive/15 px-4 py-3.5"
      >
        <p className="text-[12px] font-medium text-destructive">{errorMsg}</p>
        <button
          onClick={() => { setStatus("loading"); checkStatus(); }}
          className="mt-1.5 text-[11px] font-semibold text-foreground/70 hover:text-foreground transition-colors"
        >
          Tentar novamente →
        </button>
      </motion.div>
    );
  }

  // ══════════════════════════════════════════════
  // ── PRONTO PARA ATIVAR — Banner persuasivo premium ──
  // ══════════════════════════════════════════════
  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      onClick={() => navigate(`${basePath}/financeiro`)}
      className="group w-full relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-background to-primary/[0.04] transition-all active:scale-[0.985] hover:border-primary/35 hover:shadow-lg hover:shadow-primary/[0.04]"
    >
      {/* Decorativo — glow animado */}
      <div className="absolute -top-16 -right-16 w-40 h-40 bg-primary/[0.06] rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-primary/[0.03] rounded-full blur-2xl pointer-events-none" />

      {/* Dismiss button */}
      <button
        onClick={(e) => { e.stopPropagation(); setDismissed(true); }}
        className="absolute top-3 right-3 w-6 h-6 rounded-full bg-foreground/[0.05] hover:bg-foreground/[0.1] flex items-center justify-center transition-colors z-10"
        aria-label="Fechar"
      >
        <X className="w-3 h-3 text-muted-foreground/50" />
      </button>

      <div className="relative px-4 py-5">
        {/* Ícone principal */}
        <div className="flex items-center gap-3 mb-3.5">
          <div className="w-11 h-11 rounded-2xl bg-foreground/[0.06] flex items-center justify-center transition-transform group-hover:scale-105">
            <Wallet className="w-5 h-5 text-foreground" />
          </div>
          <div className="text-left">
            <p className="text-[15px] font-bold text-foreground leading-tight">
              Carteira Digital
            </p>
            <p className="text-[11px] text-primary/70 font-semibold mt-0.5">
              Grátis · Ativa em segundos
            </p>
          </div>
        </div>

        {/* Benefícios */}
        <div className="flex flex-col gap-2 mb-4">
          {[
            { icon: QrCode, text: "Receba PIX com QR Code automático" },
            { icon: CreditCard, text: "Aceite cartão de crédito e débito" },
            { icon: TrendingUp, text: "Aumente suas vendas em até 40%" },
          ].map(({ icon: Icon, text }, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-lg bg-foreground/[0.04] flex items-center justify-center shrink-0">
                <Icon className="w-3.5 h-3.5 text-primary/70" />
              </div>
              <span className="text-[12px] text-foreground/80 font-medium">{text}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="flex items-center justify-between rounded-xl bg-primary/10 px-4 py-3 transition-colors group-hover:bg-primary/15">
          <span className="text-[13px] font-bold text-primary">
            Configurar Carteira
          </span>
          <ChevronRight className="w-4.5 h-4.5 text-primary/60 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </motion.button>
  );
}
