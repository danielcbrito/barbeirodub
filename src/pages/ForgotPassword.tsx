import { useEffect, useState } from "react";
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

  return (
    <div
      className={`relative rounded-2xl transition-colors ${
        focused
          ? "border border-primary bg-transparent"
          : "border border-transparent bg-foreground/[0.06]"
      }`}
    >
      <label
        htmlFor={id}
        className={`pointer-events-none absolute left-5 transition-all ${
          active
            ? `top-2 text-[11px] ${focused ? "text-primary" : "text-foreground/60"}`
            : "top-1/2 -translate-y-1/2 text-[15px] text-foreground/55"
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
        className="peer h-[68px] w-full rounded-2xl bg-transparent px-5 pt-5 pb-1 text-[15px] text-foreground caret-primary outline-none"
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

  // Keyboard height (iOS/Android) — usado para fazer o CTA subir junto do teclado suavemente e sem travar
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;

    const updateKeyboard = () => {
      if (!vv) {
        setKeyboardHeight(0);
        return;
      }
      const diff = window.innerHeight - vv.height - (vv.offsetTop || 0);
      setKeyboardHeight(diff > 60 ? Math.round(diff) : 0);
    };

    updateKeyboard();

    if (vv) {
      vv.addEventListener("resize", updateKeyboard);
      vv.addEventListener("scroll", updateKeyboard);
    }
    window.addEventListener("resize", updateKeyboard);
    window.addEventListener("orientationchange", updateKeyboard);

    return () => {
      if (vv) {
        vv.removeEventListener("resize", updateKeyboard);
        vv.removeEventListener("scroll", updateKeyboard);
      }
      window.removeEventListener("resize", updateKeyboard);
      window.removeEventListener("orientationchange", updateKeyboard);
    };
  }, []);

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
      className="fixed inset-0 flex flex-col justify-between overflow-hidden bg-background"
      style={{
        background: "hsl(var(--background))",
        color: "hsl(var(--foreground))",
      }}
    >
      {/* Top bar */}
      <div
        className="relative flex items-center justify-center px-4 shrink-0"
        style={{ paddingTop: "calc(var(--app-safe-top, env(safe-area-inset-top, 0px)) + 10px)", paddingBottom: 10 }}
      >
        <button
          type="button"
          onClick={() => (emailSent ? navigate("/auth") : navigate(-1))}
          className="absolute left-3 flex h-10 w-10 items-center justify-center rounded-full text-foreground/85 active:scale-95 transition-all"
          aria-label="Voltar"
          style={{ touchAction: "manipulation" }}
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
        </button>
        <h2 className="text-[15px] font-semibold text-foreground">Recuperar senha</h2>
      </div>

      {/* Content */}
      <main
        className="flex-1 w-full max-w-md mx-auto overflow-y-auto overscroll-contain px-6 pb-8"
        style={{
          paddingBottom: keyboardHeight > 0 ? `${keyboardHeight + 110}px` : "24px",
          transition: "padding-bottom 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <AnimatePresence mode="wait">
          {!emailSent ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="w-full pt-6"
            >
              <h1 className="text-[26px] font-extrabold tracking-tight text-foreground leading-tight">
                Esqueceu sua senha?
              </h1>
              <p className="mt-1.5 text-[13px] text-foreground/55">
                Digite seu e-mail e enviaremos um link para você criar uma nova senha.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-3" noValidate>
                <FloatingInput
                  id="fp-email"
                  label="E-mail"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  enterKeyHint="send"
                  value={email}
                  onChange={setEmail}
                />
                <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
                  Enviar
                </button>
              </form>
            </motion.div>
          ) : (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="w-full pt-10 flex flex-col items-center text-center"
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
              <h1 className="text-[24px] font-extrabold tracking-tight text-foreground leading-tight">
                E-mail enviado
              </h1>
              <p className="mt-2 text-[13px] text-foreground/60 leading-relaxed max-w-[280px]">
                Verifique sua caixa de entrada em
              </p>
              <p className="mt-1 text-[13px] text-primary font-semibold break-all">{email}</p>
              <p className="mt-3 text-[12px] text-foreground/45 leading-relaxed max-w-[280px]">
                Toque no link do e-mail para redefinir sua senha.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom CTA — Sempre embaixo, sobe junto do teclado sem travar */}
      <footer
        className="relative w-full max-w-md mx-auto px-6 pt-3 shrink-0 bg-background z-40 after:content-[''] after:absolute after:top-full after:left-0 after:right-0 after:h-[100vh] after:bg-background"
        style={{
          paddingBottom: keyboardHeight > 0
            ? "12px"
            : "calc(var(--app-safe-bottom, env(safe-area-inset-bottom, 0px)) + 16px)",
          transform: keyboardHeight > 0 ? `translate3d(0, -${keyboardHeight}px, 0)` : "translate3d(0, 0, 0)",
          transition: "transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), padding-bottom 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
          willChange: "transform",
        }}
      >
        {!emailSent ? (
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={!canSubmit || isLoading}
            className="w-full h-[54px] rounded-full bg-[#18181b] hover:bg-black text-white dark:bg-white dark:text-[#09090b] dark:hover:bg-zinc-100 font-semibold text-[15.5px] sm:text-[16px] tracking-normal shadow-[0_8px_24px_rgba(0,0,0,0.14)] dark:shadow-[0_8px_24px_rgba(255,255,255,0.08)] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
            style={{ touchAction: "manipulation" }}
          >
            {isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
            Enviar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => navigate("/auth")}
            className="w-full h-[54px] rounded-full bg-[#18181b] hover:bg-black text-white dark:bg-white dark:text-[#09090b] dark:hover:bg-zinc-100 font-semibold text-[15.5px] sm:text-[16px] tracking-normal shadow-[0_8px_24px_rgba(0,0,0,0.14)] dark:shadow-[0_8px_24px_rgba(255,255,255,0.08)] active:scale-[0.98] transition-all flex items-center justify-center cursor-pointer"
            style={{ touchAction: "manipulation" }}
          >
            Voltar ao login
          </button>
        )}
      </footer>
    </div>
  );
};

export default ForgotPassword;
