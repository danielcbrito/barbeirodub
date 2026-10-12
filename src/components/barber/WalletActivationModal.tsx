import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet, TrendingUp, Users, CreditCard, QrCode,
  ChevronRight, ChevronLeft, Loader2, CheckCircle2,
  Landmark, Sparkles, ShieldCheck, X,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface WalletActivationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  barbeiroId: string;
  barberName?: string;
  onSuccess?: () => void;
}

type ActivationStep = 0 | 1 | 2 | 3;
type CreationStatus = "idle" | "creating" | "success" | "error";
type PixKeyType = "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "RANDOM";

function detectPixKeyType(v: string): PixKeyType {
  const digits = v.replace(/\D/g, "");
  if (/^\S+@\S+\.\S+$/.test(v)) return "EMAIL";
  if (digits.length === 11) return "CPF";
  if (digits.length === 14) return "CNPJ";
  if (digits.length >= 10 && digits.length <= 13) return "PHONE";
  return "RANDOM";
}

/**
 * Modal de onboarding guiado para ativação da carteira digital (subconta Woovi).
 *
 * 3 etapas de carrossel + etapa final com chave Pix + criação.
 */
export function WalletActivationModal({
  open,
  onOpenChange,
  barbeiroId,
  barberName = "Profissional",
  onSuccess,
}: WalletActivationModalProps) {
  const [step, setStep] = useState<ActivationStep>(0);
  const [creationStatus, setCreationStatus] = useState<CreationStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [pixKey, setPixKey] = useState("");

  const handleCreate = useCallback(async () => {
    const key = pixKey.trim();
    if (!key) {
      setErrorMsg("Informe sua chave Pix");
      return;
    }
    setCreationStatus("creating");
    setErrorMsg("");

    try {
      const { data, error } = await supabase.functions.invoke("woovi-create-subaccount", {
        body: { pix_key: key, pix_key_type: detectPixKeyType(key) },
      });

      if (error) throw error;

      if (data?.ok) {
        setCreationStatus("success");
        setStep(3);
        toast.success("Carteira ativada com sucesso! 🎉");
        onSuccess?.();
      } else {
        throw new Error(data?.error || "Erro desconhecido");
      }
    } catch (err: any) {
      console.error("[WalletActivationModal] Erro:", err);
      const msg = err?.message || "Erro ao ativar carteira";
      setErrorMsg(msg);
      setCreationStatus("error");
      toast.error(msg);
    }
  }, [barbeiroId, onSuccess, pixKey]);

  const handleClose = () => {
    if (creationStatus !== "creating") {
      onOpenChange(false);
      // Reset after close animation
      setTimeout(() => {
        setStep(0);
        setCreationStatus("idle");
        setErrorMsg("");
        setPixKey("");
      }, 300);
    }
  };

  const nextStep = () => setStep((s) => Math.min(s + 1, 2) as ActivationStep);
  const prevStep = () => setStep((s) => Math.max(s - 1, 0) as ActivationStep);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[420px] p-0 gap-0 overflow-hidden border-border/50 bg-card">
        {/* Close button */}
        <button
          onClick={handleClose}
          disabled={creationStatus === "creating"}
          className="absolute right-3 top-3 z-10 w-7 h-7 rounded-full bg-muted/50 flex items-center justify-center hover:bg-muted transition-colors"
        >
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </button>

        {/* Step dots */}
        <div className="flex items-center justify-center gap-1.5 pt-5 pb-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-300 ${
                i === step
                  ? "w-6 bg-primary"
                  : i < step
                  ? "w-1.5 bg-primary/40"
                  : "w-1.5 bg-muted-foreground/20"
              }`}
            />
          ))}
        </div>

        {/* Content carousel */}
        <div className="relative min-h-[380px] overflow-hidden">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <StepSlide key="step0">
                <div className="flex flex-col items-center text-center px-8 pt-4 pb-6">
                  {/* Icon hero */}
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-6">
                    <TrendingUp className="w-10 h-10 text-primary" />
                  </div>

                  <h2 className="text-[20px] font-black text-foreground leading-tight">
                    Atraia mais clientes
                  </h2>
                  <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed max-w-[280px]">
                    Barbearias que aceitam PIX e cartão faturam até{" "}
                    <strong className="text-foreground">40% a mais</strong> que as que aceitam apenas dinheiro.
                  </p>

                  {/* Benefits */}
                  <div className="w-full mt-6 space-y-2.5">
                    <BenefitRow
                      icon={Users}
                      title="Clientes preferem digital"
                      desc="78% dos clientes preferem pagar via PIX ou cartão"
                    />
                    <BenefitRow
                      icon={CreditCard}
                      title="Receba de qualquer lugar"
                      desc="Pagamentos caem direto na sua carteira digital"
                    />
                    <BenefitRow
                      icon={Sparkles}
                      title="Profissionalismo"
                      desc="Destaque-se dos concorrentes com pagamento moderno"
                    />
                  </div>
                </div>
              </StepSlide>
            )}

            {step === 1 && (
              <StepSlide key="step1">
                <div className="flex flex-col items-center text-center px-8 pt-4 pb-6">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 flex items-center justify-center mb-6">
                    <Wallet className="w-10 h-10 text-emerald-500" />
                  </div>

                  <h2 className="text-[20px] font-black text-foreground leading-tight">
                    Tudo na palma da mão
                  </h2>
                  <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed max-w-[280px]">
                    Sua carteira digital concentra tudo: recebimentos, extratos e saques — direto no app.
                  </p>

                  <div className="w-full mt-6 space-y-2.5">
                    <BenefitRow
                      icon={QrCode}
                      title="PIX instantâneo"
                      desc="Cliente paga via QR Code, dinheiro cai na hora"
                      accentClass="text-emerald-500"
                    />
                    <BenefitRow
                      icon={ShieldCheck}
                      title="Seguro e regulado"
                      desc="Processado pela Woovi, autorizada pelo Banco Central"
                      accentClass="text-emerald-500"
                    />
                    <BenefitRow
                      icon={Landmark}
                      title="Saque quando quiser"
                      desc="Transfira para sua chave Pix a qualquer momento"
                      accentClass="text-emerald-500"
                    />
                  </div>
                </div>
              </StepSlide>
            )}

            {step === 2 && (
              <StepSlide key="step2">
                <div className="flex flex-col items-center text-center px-8 pt-4 pb-6">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-amber-500/10 flex items-center justify-center mb-6">
                    <Landmark className="w-10 h-10 text-primary" />
                  </div>

                  <h2 className="text-[20px] font-black text-foreground leading-tight">
                    Ative agora, {barberName.split(" ")[0]}!
                  </h2>
                  <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed max-w-[300px]">
                    Informe a <strong className="text-foreground">chave Pix</strong> onde você quer receber. Os pagamentos dos clientes caem direto nessa chave.
                  </p>

                  {/* PIX key input */}
                  <div className="w-full mt-5">
                    <input
                      type="text"
                      value={pixKey}
                      onChange={(e) => setPixKey(e.target.value)}
                      placeholder="CPF, e-mail, telefone ou chave aleatória"
                      className="w-full h-12 px-4 rounded-xl bg-secondary/50 border border-border/40 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 transition-colors"
                      disabled={creationStatus === "creating"}
                    />
                  </div>

                  {errorMsg && (
                    <div className="w-full mt-3 bg-destructive/[0.08] border border-destructive/20 rounded-lg p-2.5">
                      <p className="text-[11px] text-destructive">{errorMsg}</p>
                    </div>
                  )}

                  {/* CTA Button */}
                  <button
                    onClick={handleCreate}
                    disabled={creationStatus === "creating" || !pixKey.trim()}
                    className="w-full mt-5 flex items-center justify-center gap-2.5 h-12 rounded-xl bg-primary text-primary-foreground font-bold text-[14px] transition-all active:scale-[0.98] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
                  >
                    {creationStatus === "creating" ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Ativando carteira...
                      </>
                    ) : (
                      <>
                        <Wallet className="w-5 h-5" />
                        Ativar Carteira Digital
                      </>
                    )}
                  </button>
                </div>
              </StepSlide>
            )}

            {step === 3 && (
              <StepSlide key="step3">
                <div className="flex flex-col items-center text-center px-8 pt-8 pb-6">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
                    className="w-24 h-24 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6"
                  >
                    <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                  </motion.div>

                  <h2 className="text-[22px] font-black text-foreground leading-tight">
                    Carteira Ativada! 🎉
                  </h2>
                  <p className="text-[13px] text-muted-foreground mt-3 leading-relaxed max-w-[280px]">
                    Seus clientes agora podem pagar via <strong className="text-foreground">PIX</strong> e{" "}
                    <strong className="text-foreground">Cartão</strong> diretamente pelo app. O dinheiro cai na sua carteira.
                  </p>

                  <button
                    onClick={handleClose}
                    className="w-full mt-8 flex items-center justify-center gap-2 h-12 rounded-xl bg-emerald-500 text-foreground font-bold text-[14px] transition-all active:scale-[0.98] hover:opacity-90"
                  >
                    <Sparkles className="w-5 h-5" />
                    Começar a receber!
                  </button>
                </div>
              </StepSlide>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation bar — only for steps 0-2 */}
        {step < 3 && (
          <div className="flex items-center justify-between px-6 pb-5">
            {step > 0 ? (
              <button
                onClick={prevStep}
                className="flex items-center gap-1 text-[12px] text-muted-foreground font-medium hover:text-foreground transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Voltar
              </button>
            ) : (
              <button
                onClick={handleClose}
                className="text-[12px] text-muted-foreground/60 font-medium hover:text-foreground transition-colors"
              >
                Depois
              </button>
            )}

            {step < 2 && (
              <button
                onClick={nextStep}
                className="flex items-center gap-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-[12px] font-semibold transition-all active:scale-[0.97] hover:opacity-90"
              >
                Próximo
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Animated slide wrapper */
function StepSlide({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.25, ease: "easeInOut" }}
    >
      {children}
    </motion.div>
  );
}

/** Compact benefit row */
function BenefitRow({
  icon: Icon,
  title,
  desc,
  accentClass = "text-primary",
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
  accentClass?: string;
}) {
  return (
    <div className="flex items-start gap-3 text-left">
      <div className={`w-8 h-8 rounded-lg bg-secondary/80 flex items-center justify-center shrink-0 mt-0.5`}>
        <Icon className={`w-4 h-4 ${accentClass}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-foreground">{title}</p>
        <p className="text-[10px] text-muted-foreground leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}
