import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Loader2, CheckCircle2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const emailSchema = z.object({
  email: z.string().trim().email("Email inválido"),
});

/* ─── Floating input (mesmo padrão do Auth) ─────────────────────── */
const FloatingInput = ({
  id,
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  autoComplete,
  enterKeyHint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  enterKeyHint?: React.HTMLAttributes<HTMLInputElement>["enterKeyHint"];
}) => {
  const [focused, setFocused] = useState(false);
  const active = focused || value.length > 0;

  const handleFocus = () => {
    setFocused(true);
    if (typeof window !== "undefined") {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
  };

  return (
    <div
      className={`relative h-[60px] rounded-2xl border-2 transition-all duration-200 ${
        focused
          ? "border-primary bg-primary/[0.02] shadow-sm"
          : "border-transparent bg-foreground/[0.05]"
      }`}
    >
      <label
        htmlFor={id}
        className={`pointer-events-none absolute left-4 select-none transition-all duration-150 ${
          active
            ? `top-[9px] text-[12px] font-semibold tracking-wide leading-none ${
                focused ? "text-primary" : "text-foreground/50"
              }`
            : "top-1/2 -translate-y-1/2 text-[15.5px] font-normal text-foreground/45"
        }`}
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        enterKeyHint={enterKeyHint}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        data-no-auto-scroll="true"
        className="peer h-full w-full rounded-2xl bg-transparent px-4 pt-[25px] pb-[8px] text-[16px] text-foreground caret-primary outline-none leading-normal font-normal"
        style={{ fontSize: 16, WebkitAppearance: "none" }}
      />
    </div>
  );
};

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);



  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    try {
      const { email: validEmail } = emailSchema.parse({ email });
      const productionUrl = window.location.origin.includes("localhost")
        ? "https://dubadmin.lovable.app"
        : window.location.origin;

      const { error } = await supabase.auth.resetPasswordForEmail(validEmail, {
        redirectTo: `${productionUrl}/auth/callback`,
      });

      if (error) {
        toast.error("Erro ao enviar email: " + error.message);
        return;
      }
      setEmailSent(true);
    } catch (error) {
      if (error instanceof z.ZodError) toast.error(error.errors[0].message);
      else toast.error("Erro ao processar solicitação");
    } finally {
      setIsLoading(false);
    }
  };

  const canSubmit = email.trim().length > 3 && email.includes("@");

  return (
    <div
      data-no-auto-scroll="true"
      className="min-h-[100dvh] w-full flex flex-col bg-background text-foreground"
    >
      {/* Header — no topo */}
      <header
        className="w-full flex items-center justify-center px-4 relative shrink-0"
        style={{
          paddingTop: "calc(var(--app-safe-top, env(safe-area-inset-top, 0px)) + 12px)",
          paddingBottom: "12px",
        }}
      >
        <button
          type="button"
          onClick={() => (emailSent ? navigate("/auth") : navigate(-1))}
          className="absolute left-4 flex h-10 w-10 items-center justify-center rounded-full text-foreground/85 active:scale-95 transition-all"
          aria-label="Voltar"
          style={{ touchAction: "manipulation" }}
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
        </button>
        <h2 className="text-[15px] font-semibold text-foreground">Recuperar senha</h2>
      </header>

      {/* Main content: espaçoso e com respiro total do teclado */}
      <main className="w-full max-w-md mx-auto px-6 pt-3 pb-12 flex-1 flex flex-col justify-start">
        <AnimatePresence mode="wait">
          {!emailSent ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="w-full"
            >
              <div className="pt-2 pb-6">
                <h1 className="text-[26px] sm:text-[28px] font-extrabold tracking-tight text-foreground leading-tight">
                  Esqueceu sua senha?
                </h1>
                <p className="text-[14px] text-foreground/60 mt-1.5 leading-normal">
                  Digite seu e-mail e enviaremos um link para você criar uma nova senha.
                </p>
              </div>

              <form
                onSubmit={handleSubmit}
                className="space-y-4"
                noValidate
              >
                <FloatingInput
                  id="fp-email"
                  label="E-mail"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  enterKeyHint="send"
                  value={email}
                  onChange={setEmail}
                />

                <div className="pt-6">
                  <button
                    type="submit"
                    disabled={!canSubmit || isLoading}
                    className="w-full h-[54px] rounded-full bg-[#18181b] hover:bg-black text-white dark:bg-white dark:text-[#09090b] dark:hover:bg-zinc-100 font-semibold text-[16px] tracking-normal shadow-[0_8px_24px_rgba(0,0,0,0.14)] dark:shadow-[0_8px_24px_rgba(255,255,255,0.08)] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                    style={{ touchAction: "manipulation" }}
                  >
                    {isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
                    Enviar
                  </button>
                </div>

                <p className="pt-4 text-center text-[14px] text-foreground/60">
                  <button
                    type="button"
                    onClick={() => navigate("/auth")}
                    className="font-semibold text-primary hover:underline active:opacity-70 transition-opacity"
                    style={{ touchAction: "manipulation" }}
                  >
                    Voltar ao login
                  </button>
                </p>
              </form>
            </motion.div>
          ) : (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="w-full pt-8 flex flex-col items-center text-center"
            >
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
                style={{
                  background: "hsl(var(--primary) / 0.12)",
                  border: "1px solid hsl(var(--primary) / 0.25)",
                }}
              >
                <CheckCircle2 className="w-10 h-10 text-primary" />
              </div>
              <h1 className="text-[26px] font-extrabold tracking-tight text-foreground leading-tight">
                E-mail enviado
              </h1>
              <p className="mt-2 text-[14px] text-foreground/60 leading-relaxed max-w-[280px]">
                Verifique sua caixa de entrada em
              </p>
              <p className="mt-1 text-[14px] text-primary font-semibold break-all">{email}</p>
              <p className="mt-3 text-[13px] text-foreground/45 leading-relaxed max-w-[280px]">
                Toque no link do e-mail para redefinir sua senha.
              </p>

              <div className="pt-8 w-full">
                <button
                  type="button"
                  onClick={() => navigate("/auth")}
                  className="w-full h-[54px] rounded-full bg-[#18181b] hover:bg-black text-white dark:bg-white dark:text-[#09090b] dark:hover:bg-zinc-100 font-semibold text-[16px] tracking-normal shadow-[0_8px_24px_rgba(0,0,0,0.14)] dark:shadow-[0_8px_24px_rgba(255,255,255,0.08)] active:scale-[0.98] transition-all flex items-center justify-center cursor-pointer"
                  style={{ touchAction: "manipulation" }}
                >
                  Voltar ao login
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default ForgotPassword;
