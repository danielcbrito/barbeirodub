import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet, QrCode, CreditCard, TrendingUp,
  Landmark, ShieldCheck, CheckCircle2, Loader2,
  Lock, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { validateCPF, formatCPF, formatPhone, validatePhone } from "@/lib/validators";

type GateStatus = "loading" | "active" | "no_wallet" | "underage";
type CreationStatus = "idle" | "creating" | "success" | "error";

/**
 * Steps:
 * 0 = Boas-vindas (benefícios)
 * 1 = Segurança
 * 2 = Nome completo
 * 3 = CPF + Data nascimento
 * 4 = E-mail + Telefone
 * 5 = Ativação (criar subconta)
 * 6 = Sucesso
 */
type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const TOTAL_DATA_STEPS = 7;

interface WalletOnboardingGateProps {
  barbeiroId: string | null;
  userId?: string;
  barberName?: string;
  onBack?: () => void;
  children: React.ReactNode;
}

interface FormData {
  nome_completo: string;
  cpf: string;
  email: string;
  telefone: string;
  data_nascimento: string;
}

/* ── Seta curvada padrão do app ── */
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

/**
 * WalletOnboardingGate — Onboarding fullscreen premium para carteira digital.
 * Cada campo de dados é coletado em tela própria com transição suave.
 */
export function WalletOnboardingGate({
  barbeiroId,
  userId,
  barberName = "Profissional",
  onBack,
  children,
}: WalletOnboardingGateProps) {
  const [status, setStatus] = useState<GateStatus>("loading");
  const [step, setStep] = useState<Step>(0);
  const [creationStatus, setCreationStatus] = useState<CreationStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [resolvedName, setResolvedName] = useState(barberName);
  const [formData, setFormData] = useState<FormData>({
    nome_completo: "", cpf: "", email: "", telefone: "", data_nascimento: "",
  });
  const [fieldError, setFieldError] = useState("");
  const [direction, setDirection] = useState<1 | -1>(1);

  // ── Check wallet status ──
  // Migração Efí Bank (modelo B1 - repasse automático):
  // Não há mais onboarding/subconta. Carteira sempre ativa.
  // O barbeiro só precisa cadastrar uma chave PIX em Configurações
  // para receber os repasses automáticos.
  useEffect(() => {
    if (!barbeiroId) { setStatus("active"); return; }

    (async () => {
      try {
        const { data: barber } = await supabase
          .from("barbeiros")
          .select("apelido")
          .eq("id", barbeiroId)
          .maybeSingle();
        if (barber?.apelido) setResolvedName(barber.apelido);
      } catch { /* noop */ }
      setStatus("active");
    })();
  }, [barbeiroId]);

  /* ── Navigation helpers ── */
  const goNext = useCallback(() => {
    setFieldError("");
    setDirection(1);
    setStep(s => Math.min(s + 1, 6) as Step);
  }, []);

  const goBack = useCallback(() => {
    setFieldError("");
    setDirection(-1);
    setStep(s => Math.max(s - 1, 0) as Step);
  }, []);

  /* ── Validate current step before advancing ── */
  const validateAndNext = useCallback(() => {
    setFieldError("");

    if (step === 2) {
      if (!formData.nome_completo.trim()) { setFieldError("Informe seu nome completo"); return; }
      if (formData.nome_completo.trim().split(" ").length < 2) { setFieldError("Informe nome e sobrenome"); return; }
    }
    if (step === 3) {
      if (!formData.cpf.trim()) { setFieldError("Informe seu CPF"); return; }
      if (!validateCPF(formData.cpf)) { setFieldError("CPF inválido"); return; }
      if (!formData.data_nascimento.trim()) { setFieldError("Informe sua data de nascimento"); return; }
    }
    if (step === 4) {
      if (!formData.email.trim()) { setFieldError("Informe seu e-mail"); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) { setFieldError("E-mail inválido"); return; }
      if (formData.telefone.trim() && !validatePhone(formData.telefone)) { setFieldError("Telefone inválido"); return; }
    }

    goNext();
  }, [step, formData, goNext]);

  /* ── Save data + create subaccount ── */
  const handleActivate = useCallback(async () => {
    if (!barbeiroId) return;
    setCreationStatus("creating");
    setErrorMsg("");

    try {
      await supabase.from("barbeiros_private").upsert({
        barbeiro_id: barbeiroId,
        nome_completo: formData.nome_completo.trim(),
        cpf: formData.cpf.trim(),
        email: formData.email.trim(),
        telefone: formData.telefone.trim() || null,
        data_nascimento: formData.data_nascimento.trim() || null,
        updated_at: new Date().toISOString(),
      } as any, { onConflict: "barbeiro_id" });

      const { data, error } = await supabase.functions.invoke("create-asaas-subaccount", {
        body: {
          barbeiro_id: barbeiroId,
          cpf: formData.cpf.trim(),
          email: formData.email.trim(),
          nome_completo: formData.nome_completo.trim(),
          telefone: formData.telefone.trim() || null,
          data_nascimento: formData.data_nascimento.trim() || null,
        },
      });

      if (error) throw error;
      if (data?.success || data?.already_exists) {
        setCreationStatus("success");
        setDirection(1);
        setStep(6);
        toast.success("Carteira ativada com sucesso!");
      } else {
        throw new Error(data?.error || data?.details || "Erro desconhecido");
      }
    } catch (err: any) {
      const msg = err?.message || "Erro ao ativar carteira";
      setErrorMsg(msg);
      setCreationStatus("error");
      toast.error(msg);
    }
  }, [barbeiroId, formData]);

  const handleFinish = () => setStatus("active");

  // ── Loading ──
  if (status === "loading") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background pt-[env(safe-area-inset-top)]">
        <div className="w-6 h-6 border-2 border-muted-foreground/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (status === "active") return <>{children}</>;

  if (status === "underage") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background pt-[env(safe-area-inset-top)]">
        <OnboardingHeader onBack={onBack} step={-1} />
        <div className="flex-1 flex flex-col items-center justify-center px-6 -mt-12">
          <div className="w-14 h-14 rounded-2xl bg-muted/20 flex items-center justify-center mb-5">
            <ShieldCheck className="w-7 h-7 text-muted-foreground/30" />
          </div>
          <h1 className="text-lg font-semibold text-foreground text-center">Carteira indisponível</h1>
          <p className="text-xs text-muted-foreground mt-2 text-center max-w-[260px] leading-relaxed">
            Disponível apenas para maiores de 18 anos. Fale com o administrador.
          </p>
          {onBack && (
            <button onClick={onBack} className="mt-8 h-11 px-8 rounded-xl bg-secondary text-foreground font-semibold text-sm active:scale-[0.98] transition-all">
              Voltar
            </button>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════
  // ONBOARDING FLOW
  // ═══════════════════════════════════════

  const slideVariants = {
    enter: (d: number) => ({ x: d > 0 ? 60 : -60, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -60 : 60, opacity: 0 }),
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background pt-[env(safe-area-inset-top)]">
      <OnboardingHeader
        onBack={step === 0 ? onBack : goBack}
        step={step}
      />

      <div className="flex-1 overflow-y-auto scrollbar-none">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
            className="w-full"
          >
            {step === 0 && <StepBeneficios onNext={goNext} />}
            {step === 1 && <StepSeguranca onNext={goNext} />}
            {step === 2 && (
              <StepInput
                stepLabel="Etapa 1 de 3"
                title="Como você se chama?"
                hint="Utilize seu nome completo, como consta no documento de identidade."
                fields={[
                  { label: "Nome completo", value: formData.nome_completo, onChange: (v) => setFormData(p => ({ ...p, nome_completo: v })), placeholder: "Ex: João da Silva", autoFocus: true },
                ]}
                error={fieldError}
                onNext={validateAndNext}
              />
            )}
            {step === 3 && (
              <StepInput
                stepLabel="Etapa 2 de 3"
                title="Documentos"
                hint="Precisamos do CPF e data de nascimento para criar sua conta regulada."
                fields={[
                  { label: "CPF", value: formData.cpf, onChange: (v) => setFormData(p => ({ ...p, cpf: formatCPF(v) })), placeholder: "000.000.000-00", maxLength: 14, inputMode: "numeric", autoFocus: true },
                  { label: "Data de nascimento", value: formData.data_nascimento, onChange: (v) => setFormData(p => ({ ...p, data_nascimento: v })), type: "date" },
                ]}
                error={fieldError}
                onNext={validateAndNext}
              />
            )}
            {step === 4 && (
              <StepInput
                stepLabel="Etapa 3 de 3"
                title="Contato"
                hint="E-mail e telefone para notificações de pagamento e segurança da conta."
                fields={[
                  { label: "E-mail", value: formData.email, onChange: (v) => setFormData(p => ({ ...p, email: v })), placeholder: "seu@email.com", type: "email", autoFocus: true },
                  { label: "Telefone / WhatsApp", value: formData.telefone, onChange: (v) => setFormData(p => ({ ...p, telefone: formatPhone(v) })), placeholder: "(00) 00000-0000", maxLength: 15, inputMode: "tel", optional: true },
                ]}
                error={fieldError}
                onNext={validateAndNext}
              />
            )}
            {step === 5 && (
              <StepActivation
                name={resolvedName}
                creating={creationStatus === "creating"}
                errorMsg={errorMsg}
                onActivate={handleActivate}
              />
            )}
            {step === 6 && <StepSuccess onFinish={handleFinish} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// HEADER
// ═══════════════════════════════════════
function OnboardingHeader({ onBack, step }: { onBack?: () => void; step: number }) {
  const showDots = step >= 0 && step <= 5;

  return (
    <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
      <div className="flex items-center gap-1.5">
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

      {showDots && (
        <div className="flex items-center gap-[5px]">
          {Array.from({ length: 6 }).map((_, i) => (
            <motion.div
              key={i}
              layout
              className="rounded-full"
              animate={{
                width: i === step ? 16 : 5,
                height: 5,
                backgroundColor: i === step
                  ? "hsl(var(--primary))"
                  : i < step
                    ? "hsl(var(--primary) / 0.35)"
                    : "hsl(var(--muted-foreground) / 0.12)",
              }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════
// STEP 0 — Benefícios
// ═══════════════════════════════════════
function StepBeneficios({ onNext }: { onNext: () => void }) {
  const features = [
    { icon: QrCode, label: "PIX automático", desc: "QR Code gerado para cada atendimento" },
    { icon: CreditCard, label: "Cartão sem maquininha", desc: "Crédito e débito pelo link de pagamento" },
    { icon: TrendingUp, label: "Fature até 40% mais", desc: "Pagamento digital aumenta o ticket médio" },
  ];

  return (
    <div className="flex flex-col min-h-[calc(100dvh-56px)] px-5">
      {/* Top section */}
      <div className="flex-1 flex flex-col justify-center pb-8">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="mb-5"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/[0.06] border border-primary/[0.08]">
            <Wallet className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-semibold text-primary tracking-wide uppercase">Conta Digital</span>
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="text-[26px] font-bold text-foreground leading-[1.15] tracking-tight max-w-[300px]"
        >
          Receba pagamentos{" "}
          <span className="text-primary">direto no app</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, duration: 0.4 }}
          className="text-[13px] text-muted-foreground mt-3 leading-relaxed max-w-[320px]"
        >
          Recebimentos, extratos e saques centralizados. Sem maquininha, sem complicação.
        </motion.p>

        {/* Feature cards */}
        <div className="mt-8 space-y-2.5">
          {features.map(({ icon: Icon, label, desc }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.24 + i * 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center gap-3.5 p-3.5 rounded-xl bg-card border border-border/40 hover:border-border/60 transition-colors"
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
        <button
          onClick={onNext}
          className="w-full h-[52px] rounded-xl btn-neon text-[13px] font-semibold tracking-wide active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
        >
          Começar
          <ArrowRight className="w-4 h-4" />
        </button>
      </motion.div>
    </div>
  );
}

// ═══════════════════════════════════════
// STEP 1 — Segurança
// ═══════════════════════════════════════
function StepSeguranca({ onNext }: { onNext: () => void }) {
  const items = [
    { icon: Lock, label: "Criptografia bancária", desc: "Dados protegidos com padrão PCI DSS" },
    { icon: Landmark, label: "Regulado pelo Banco Central", desc: "Processado pelo Asaas, instituição regulada" },
    { icon: ShieldCheck, label: "Sem mensalidade", desc: "Taxa única de ativação, sem cobranças recorrentes" },
  ];

  return (
    <div className="flex flex-col min-h-[calc(100dvh-56px)] px-5">
      <div className="flex-1 flex flex-col justify-center pb-8">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="mb-5"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/[0.06] border border-emerald-500/[0.08]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-[10px] font-semibold text-emerald-500 tracking-wide uppercase">Segurança</span>
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="text-[26px] font-bold text-foreground leading-[1.15] tracking-tight max-w-[300px]"
        >
          Seus dados estão{" "}
          <span className="text-emerald-500">protegidos</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, duration: 0.4 }}
          className="text-[13px] text-muted-foreground mt-3 leading-relaxed max-w-[320px]"
        >
          Utilizamos infraestrutura bancária certificada para garantir a segurança das suas transações.
        </motion.p>

        <div className="mt-8 space-y-2.5">
          {items.map(({ icon: Icon, label, desc }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.24 + i * 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center gap-3.5 p-3.5 rounded-xl bg-card border border-border/40 hover:border-border/60 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500/[0.06] flex items-center justify-center shrink-0">
                <Icon className="w-[18px] h-[18px] text-emerald-500/80" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-foreground leading-tight">{label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55, duration: 0.4 }}
        className="pb-8"
      >
        <button
          onClick={onNext}
          className="w-full h-[52px] rounded-xl btn-neon text-[13px] font-semibold tracking-wide active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
        >
          Continuar
          <ArrowRight className="w-4 h-4" />
        </button>
      </motion.div>
    </div>
  );
}

// ═══════════════════════════════════════
// STEP INPUT — Formulário genérico
// ═══════════════════════════════════════
interface FieldDef {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  maxLength?: number;
  inputMode?: "numeric" | "tel" | "email" | "text";
  autoFocus?: boolean;
  optional?: boolean;
}

function StepInput({
  stepLabel,
  title,
  hint,
  fields,
  error,
  onNext,
}: {
  stepLabel: string;
  title: string;
  hint: string;
  fields: FieldDef[];
  error?: string;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-col min-h-[calc(100dvh-56px)] px-5">
      <div className="flex-1 flex flex-col justify-center pb-8">
        {/* Step label */}
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="text-[10px] font-semibold text-muted-foreground tracking-widest uppercase mb-3"
        >
          {stepLabel}
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="text-[24px] font-bold text-foreground leading-[1.15] tracking-tight"
        >
          {title}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.4 }}
          className="text-[12px] text-muted-foreground mt-2 leading-relaxed max-w-[340px]"
        >
          {hint}
        </motion.p>

        {/* Fields */}
        <div className="mt-8 space-y-5">
          {fields.map((field, i) => (
            <motion.div
              key={field.label}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <OnboardingField {...field} onEnter={onNext} />
            </motion.div>
          ))}
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="text-[11px] text-destructive font-medium mt-3"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Security micro-copy */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="flex items-center gap-1.5 mt-6"
        >
          <Lock className="w-3 h-3 text-muted-foreground/30" />
          <span className="text-[10px] text-muted-foreground/40">Dados criptografados e protegidos</span>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4 }}
        className="pb-8"
      >
        <button
          onClick={onNext}
          className="w-full h-[52px] rounded-xl btn-neon text-[13px] font-semibold tracking-wide active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
        >
          Continuar
          <ArrowRight className="w-4 h-4" />
        </button>
      </motion.div>
    </div>
  );
}

// ═══════════════════════════════════════
// STEP 5 — Ativação
// ═══════════════════════════════════════
function StepActivation({
  name,
  creating,
  errorMsg,
  onActivate,
}: {
  name: string;
  creating: boolean;
  errorMsg: string;
  onActivate: () => void;
}) {
  const firstName = name.split(" ")[0];

  return (
    <div className="flex flex-col min-h-[calc(100dvh-56px)] px-5">
      <div className="flex-1 flex flex-col justify-center pb-8">
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="text-[10px] font-semibold text-muted-foreground tracking-widest uppercase mb-3"
        >
          Ativação
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="text-[24px] font-bold text-foreground leading-[1.15] tracking-tight"
        >
          Tudo pronto, {firstName}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.4 }}
          className="text-[12px] text-muted-foreground mt-2 leading-relaxed max-w-[340px]"
        >
          Sua carteira será criada em poucos segundos. Comece a receber pagamentos imediatamente.
        </motion.p>

        {/* Summary */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24, duration: 0.4 }}
          className="mt-8 rounded-xl bg-card border border-border/40 p-4 space-y-3"
        >
          {[
            "Ativação em menos de 30 segundos",
            "Sem mensalidade ou custos fixos",
            "Comece a receber imediatamente",
          ].map((text, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.35 + i * 0.06 }}
              className="flex items-center gap-2.5"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span className="text-[12px] text-foreground">{text}</span>
            </motion.div>
          ))}
        </motion.div>

        {errorMsg && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 rounded-xl bg-destructive/[0.04] border border-destructive/10 p-3.5"
          >
            <p className="text-[11px] text-destructive leading-relaxed">{errorMsg}</p>
          </motion.div>
        )}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        className="pb-8"
      >
        <button
          onClick={onActivate}
          disabled={creating}
          className="w-full h-[52px] rounded-xl btn-neon text-[13px] font-semibold tracking-wide active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {creating ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Ativando...</>
          ) : (
            <><Wallet className="w-4 h-4" /> Ativar Carteira</>
          )}
        </button>
      </motion.div>
    </div>
  );
}

// ═══════════════════════════════════════
// STEP 6 — Sucesso
// ═══════════════════════════════════════
function StepSuccess({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="flex flex-col min-h-[calc(100dvh-56px)] px-5">
      <div className="flex-1 flex flex-col items-center justify-center text-center pb-8">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
          className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6"
        >
          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28 }}
          className="text-[24px] font-bold text-foreground leading-tight tracking-tight"
        >
          Carteira Ativada
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.38 }}
          className="text-[13px] text-muted-foreground mt-2.5 leading-relaxed max-w-[280px]"
        >
          Seus clientes agora podem pagar via <strong className="text-foreground font-medium">PIX</strong> e <strong className="text-foreground font-medium">Cartão</strong> diretamente pelo app.
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="pb-8"
      >
        <button
          onClick={onFinish}
          className="w-full h-[52px] rounded-xl bg-emerald-500 text-foreground font-semibold text-[13px] tracking-wide active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
        >
          Acessar Carteira
          <ArrowRight className="w-4 h-4" />
        </button>
      </motion.div>
    </div>
  );
}

// ═══════════════════════════════════════
// SHARED — Input Field
// ═══════════════════════════════════════
function OnboardingField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  maxLength,
  inputMode,
  autoFocus,
  optional,
  onEnter,
}: FieldDef & { onEnter?: () => void }) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) {
      const t = setTimeout(() => ref.current?.focus(), 380);
      return () => clearTimeout(t);
    }
  }, [autoFocus]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-[11px] font-semibold text-foreground/70 tracking-wide">
          {label}
        </label>
        {optional && (
          <span className="text-[9px] text-muted-foreground/40 tracking-wide">Opcional</span>
        )}
      </div>
      <input
        ref={ref}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        inputMode={inputMode}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        className="w-full h-[52px] rounded-xl border border-border/40 px-4 text-[15px] text-foreground bg-card outline-none transition-all duration-200 placeholder:text-muted-foreground/25 focus:border-primary focus:ring-1 focus:ring-primary/20 focus:bg-card-elevated"
      />
    </div>
  );
}
