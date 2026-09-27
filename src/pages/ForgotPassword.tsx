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
/* ─── Floating input (mesmo padrão do Auth / iFood) ──────────────── */
const FloatingInput = ({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  autoComplete,
  enterKeyHint,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  enterKeyHint?: React.InputHTMLAttributes<HTMLInputElement>["enterKeyHint"];
  autoFocus?: boolean;
}) => {
  const [focused, setFocused] = useState(false);
  const active = focused || value.length > 0;

  return (
    <div
      className={`relative h-[62px] rounded-2xl transition-all duration-150 ${
        focused
          ? "border-2 border-primary bg-transparent shadow-sm"
          : "border border-transparent bg-foreground/[0.06] hover:bg-foreground/[0.08]"
      }`}
    >
      <label
        htmlFor={id}
        className={`pointer-events-none absolute left-5 select-none transition-all duration-150 ${
          active
            ? `top-[9px] text-[11.5px] font-medium tracking-wide leading-none ${
                focused ? "text-primary" : "text-foreground/55"
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
        autoFocus={autoFocus}
        placeholder={active && placeholder ? placeholder : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        data-no-auto-scroll="true"
        className="peer h-full w-full rounded-2xl bg-transparent px-5 pt-[22px] pb-[6px] text-[15.5px] text-foreground caret-primary outline-none leading-normal font-normal"
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
      const { email: validEmail } = emailSchema.parse({ email: email.trim().toLowerCase() });
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
      className="min-h-[100dvh] w-full flex flex-col bg-background text-foreground overflow-y-auto overscroll-y-contain"
      style={{
        paddingTop: "calc(var(--app-safe-top, env(safe-area-inset-top, 0px)) + 12px)",
        paddingBottom: "calc(var(--app-safe-bottom, env(safe-area-inset-bottom, 0px)) + 24px)",
      }}
    >
      {/* ─── Header: centralizado com < na esquerda ─── */}
      <header className="relative flex items-center justify-center px-4 shrink-0 pb-3">
        <button
          type="button"
          onClick={() => (emailSent ? navigate("/auth") : navigate(-1))}
          className="absolute left-3 flex h-10 w-10 items-center justify-center rounded-full text-foreground/80 hover:bg-foreground/5 active:scale-95 transition-all"
          aria-label="Voltar"
          style={{ touchAction: "manipulation" }}
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
        </button>
        <h2 className="text-[16px] font-semibold text-foreground/90">Recuperar senha</h2>
      </header>

      <div className="w-full max-w-md mx-auto px-6 pt-3 flex-1 flex flex-col justify-start">
        <AnimatePresence mode="wait">
          {!emailSent ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }}
              className="w-full"
            >
              <form
                onSubmit={handleSubmit}
                className="space-y-3.5 pt-1"
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

                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={!canSubmit || isLoading}
                    className="w-full h-[54px] rounded-full bg-[#18181b] hover:bg-black text-white dark:bg-white dark:text-[#09090b] dark:hover:bg-zinc-100 font-semibold text-[16px] tracking-normal shadow-[0_8px_24px_rgba(0,0,0,0.14)] dark:shadow-[0_8px_24px_rgba(255,255,255,0.08)] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                    style={{ touchAction: "manipulation" }}
                  >
                    {isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
                    Continuar
                  </button>
                </div>

                <p className="pt-4 text-center text-[13.5px] text-foreground/60">
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
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.25 }}
              className="w-full pt-4 flex flex-col items-center text-center"
            >
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mb-5"
                style={{
                  background: "hsl(var(--primary) / 0.12)",
                  border: "1px solid hsl(var(--primary) / 0.25)",
                }}
              >
                <CheckCircle2 className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-[23px] sm:text-[25px] font-bold tracking-tight text-foreground leading-tight">
                E-mail enviado
              </h1>
              <p className="mt-2 text-[14px] text-foreground/60 leading-relaxed max-w-[280px]">
                Verifique sua caixa de entrada em
              </p>
              <p className="mt-1 text-[14px] text-primary font-semibold break-all">{email}</p>
              <p className="mt-3 text-[13px] text-foreground/45 leading-relaxed max-w-[280px]">
                Toque no link recebido no e-mail para criar uma nova senha.
              </p>

              <div className="pt-6 w-full">
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
      </div>
    </div>
  );
};

export default ForgotPassword;
