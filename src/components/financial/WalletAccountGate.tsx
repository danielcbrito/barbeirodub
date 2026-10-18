import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Wallet, MessageCircle, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * ═══════════════════════════════════════════════════════════
 * WalletAccountGate — Bloqueia carteira até equipe configurar
 * ═══════════════════════════════════════════════════════════
 *
 * Verifica se o barbeiro já tem carteira Woovi ou conta financeira configurada.
 * premium com CTA para WhatsApp do suporte. A configuração é
 * feita manualmente pela equipe via painel admin/TI.
 */

const SUPPORT_WHATSAPP = "5511963390043";
const SUPPORT_MESSAGE = "Olá, quero ativar minha conta para recebimentos no app da Barbearia Dube.";

interface WalletAccountGateProps {
  barbeiroId: string | null;
  barberName?: string;
  onBack?: () => void;
  children: React.ReactNode;
}

type Status = "loading" | "ready" | "blocked";

function CurvedBackArrow() {
  return (
    <svg
      width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      className="text-foreground pointer-events-none"
    >
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a4 4 0 0 1 4 4v1" />
    </svg>
  );
}

export function WalletAccountGate({
  barbeiroId,
  barberName = "Profissional",
  onBack,
  children,
}: WalletAccountGateProps) {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      // Sem barbeiroId (admin sem perfil de barbeiro) → bloqueia
      if (!barbeiroId) {
        if (mounted) setStatus("blocked");
        return;
      }

      const { data, error } = await supabase
        .from("barbeiros")
        .select("woovi_pix_key, conta_configurada, conta_financeira_id")
        .eq("id", barbeiroId)
        .maybeSingle();

      if (!mounted) return;

      const hasConfiguredWallet =
        !!data?.woovi_pix_key ||
        (!!data?.conta_configurada && !!data?.conta_financeira_id);

      if (error || !hasConfiguredWallet) {
        setStatus("blocked");
      } else {
        setStatus("ready");
      }
    };

    check();
    return () => { mounted = false; };
  }, [barbeiroId]);

  if (status === "loading") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background pt-[env(safe-area-inset-top)]">
        <div className="w-6 h-6 border-2 border-muted-foreground/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (status === "ready") return <>{children}</>;

  // ── BLOCKED — tela de contato com suporte ──
  const whatsappUrl = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(SUPPORT_MESSAGE)}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background pt-[env(safe-area-inset-top)]">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        {onBack && (
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-secondary/50 active:scale-95 transition-all -ml-1"
            aria-label="Voltar"
          >
            <CurvedBackArrow />
          </button>
        )}
        <span className="text-[15px] font-semibold text-foreground tracking-tight">Carteira Digital</span>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto scrollbar-none">
        <div className="flex flex-col min-h-[calc(100dvh-56px)] px-5">
          <div className="flex-1 flex flex-col justify-center pb-8">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="mb-5"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/[0.06] border border-primary/[0.08]">
                <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                <span className="text-[10px] font-semibold text-primary tracking-wide uppercase">
                  Atendimento Personalizado
                </span>
              </div>
            </motion.div>

            {/* Ícone principal */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05, duration: 0.4 }}
              className="mb-6"
            >
              <div className="w-16 h-16 rounded-2xl bg-primary/[0.08] flex items-center justify-center">
                <Wallet className="w-8 h-8 text-primary" />
              </div>
            </motion.div>

            {/* Título */}
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="text-[26px] font-bold text-foreground leading-[1.15] tracking-tight"
            >
              Ativar sua{" "}
              <span className="text-primary">carteira</span>
            </motion.h1>

            {/* Descrição */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18, duration: 0.4 }}
              className="text-[13px] text-muted-foreground mt-3 leading-relaxed max-w-[340px]"
            >
              Para começar a receber seus pagamentos, você precisa ativar sua conta financeira com nossa equipe.
              Nosso time vai te ajudar em todo o processo de forma rápida e segura.
            </motion.p>

            {/* Vantagens */}
            <div className="mt-8 space-y-2.5">
              {[
                { icon: MessageCircle, label: "Atendimento humano", desc: "Equipe especializada via WhatsApp" },
                { icon: ShieldCheck, label: "Processo seguro", desc: "Configuração feita pela nossa equipe" },
                { icon: Wallet, label: "Pronto pra usar", desc: "Carteira liberada após ativação" },
              ].map(({ icon: Icon, label, desc }, i) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.26 + i * 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="flex items-center gap-3.5 p-3.5 rounded-xl bg-card border border-border/40"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/[0.06] flex items-center justify-center shrink-0">
                    <Icon className="w-[18px] h-[18px] text-primary/80" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-foreground leading-tight">{label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.4 }}
            className="pb-8"
          >
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full h-[52px] rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold tracking-wide active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-4 h-4" />
              Falar com suporte
            </a>
            <p className="text-center text-[10.5px] text-muted-foreground/70 mt-3">
              Disponível de segunda a sábado, das 9h às 18h
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
