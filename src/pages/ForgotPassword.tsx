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
      className={`relative h-[58px] rounded-2xl border-2 transition-all duration-200 ${
        focused
          ? "border-primary bg-primary/[0.02] shadow-sm"
          : "border-transparent bg-foreground/[0.05]"
      }`}
    >
      <label
        htmlFor={id}
        className={`pointer-events-none absolute left-4 select-none transition-all duration-150 ${
          active
            ? `top-[8px] text-[11px] font-semibold tracking-wide leading-none ${
                focused ? "text-primary" : "text-foreground/50"
              }`
            : "top-1/2 -translate-y-1/2 text-[15px] font-normal text-foreground/45"
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
        onFocus={handleFocus}
        onBlur={() => setFocused(false)}
        data-no-auto-scroll="true"
        className="peer h-full w-full rounded-2xl bg-transparent px-4 pt-[24px] pb-[7px] text-[15.5px] text-foreground caret-primary outline-none leading-normal font-normal"
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

  // Monitora o visualViewport: o container e o botão acompanham o teclado perfeitamente
  const initialHeightRef = useRef<number>(typeof window !== "undefined" ? window.innerHeight : 800);
  const [viewportHeight, setViewportHeight] = useState<number>(() =>
    typeof window !== "undefined" ? window.innerHeight : 800
  );
  const [vvOffset, setVvOffset] = useState<number>(0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const origOverflow = document.body.style.overflow;
    const origTouchAction = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";

    const vv = window.visualViewport;

    const update = () => {
      const vh = vv ? Math.round(vv.height) : window.innerHeight;
      const offset = vv ? Math.round(vv.offsetTop) : 0;
      setViewportHeight(vh);
      setVvOffset(offset);

      if (!initialHeightRef.current || vh > initialHeightRef.current) {
        initialHeightRef.current = Math.max(initialHeightRef.current || 0, window.innerHeight, vh);
      }

      const diff = initialHeightRef.current - vh;
      setIsKeyboardOpen(diff > 120);

      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0);
      }
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    update();
    if (vv) {
      vv.addEventListener("resize", update);
      vv.addEventListener("scroll", update);
    }
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update);

    return () => {
      document.body.style.overflow = origOverflow;
      document.body.style.touchAction = origTouchAction;
      document.body.style.overscrollBehavior = "";
      document.documentElement.style.overflow = "";
      document.documentElement.style.overscrollBehavior = "";
      if (vv) {
        vv.removeEventListener("resize", update);
        vv.removeEventListener("scroll", update);
      }
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
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
      data-no-auto-scroll="true"
      className="fixed inset-x-0 top-0 flex flex-col overflow-hidden bg-background text-foreground"
      style={{
        height: `${viewportHeight}px`,
        maxHeight: "100dvh",
        top: vvOffset ? `${vvOffset}px` : "0px",
      }}
    >
      {/* Header — SEMPRE FIXO no topo, NUNCA rola para fora nem desaparece */}
      <header
        className="relative flex items-center justify-center px-4 shrink-0 z-20 transition-all duration-200"
        style={{
          paddingTop: isKeyboardOpen
            ? "calc(var(--app-safe-top, env(safe-area-inset-top, 0px)) + 8px)"
            : "calc(var(--app-safe-top, env(safe-area-inset-top, 0px)) + 12px)",
          paddingBottom: isKeyboardOpen ? "6px" : "10px",
        }}
      >
        <button
          type="button"
          onClick={() => (emailSent ? navigate("/auth") : navigate(-1))}
          className="absolute left-3 flex h-9 w-9 items-center justify-center rounded-full text-foreground/85 active:scale-95 transition-all"
          aria-label="Voltar"
          style={{ touchAction: "manipulation" }}
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
        </button>
        <h2 className="text-[14.5px] sm:text-[15px] font-semibold text-foreground">Recuperar senha</h2>
      </header>

      {/* Main content: espaçoso e com cabeçalho protegido */}
      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col justify-start">
        <div className="px-6 w-full max-w-md mx-auto flex-1 flex flex-col justify-start">
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
                {/* Título e subtítulo — adaptam-se suavemente para garantir conforto total */}
                <div className={`transition-all duration-200 ${isKeyboardOpen ? "pt-1 pb-1" : "pt-4 pb-2"}`}>
                  <h1
                    className={`font-extrabold tracking-tight text-foreground leading-tight transition-all duration-200 ${
                      isKeyboardOpen ? "text-[21px] sm:text-[23px]" : "text-[25px] sm:text-[27px]"
                    }`}
                  >
                    Esqueceu sua senha?
                  </h1>
                  <p
                    className={`text-foreground/55 transition-all duration-200 ${
                      isKeyboardOpen ? "text-[12.5px] mt-0.5" : "text-[13px] mt-1.5"
                    }`}
                  >
                    Digite seu e-mail e enviaremos um link para você criar uma nova senha.
                  </p>
                </div>

                <form
                  onSubmit={handleSubmit}
                  className={`transition-all duration-200 ${isKeyboardOpen ? "space-y-2.5 mt-3" : "space-y-3 mt-5"}`}
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
        </div>
      </main>

      {/* Bottom CTA — sempre fixo na base, sobe suavemente com o teclado */}
      <footer
        className="w-full max-w-md mx-auto px-6 shrink-0 bg-background z-20"
        style={{
          paddingTop: isKeyboardOpen ? 6 : 10,
          paddingBottom: isKeyboardOpen
            ? "12px"
            : "calc(var(--app-safe-bottom, env(safe-area-inset-bottom, 0px)) + 16px)",
        }}
      >
        {!emailSent ? (
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={!canSubmit || isLoading}
            className="w-full h-[52px] sm:h-[54px] rounded-full bg-[#18181b] hover:bg-black text-white dark:bg-white dark:text-[#09090b] dark:hover:bg-zinc-100 font-semibold text-[15.5px] sm:text-[16px] tracking-normal shadow-[0_8px_24px_rgba(0,0,0,0.14)] dark:shadow-[0_8px_24px_rgba(255,255,255,0.08)] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
            style={{ touchAction: "manipulation" }}
          >
            {isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
            Enviar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => navigate("/auth")}
            className="w-full h-[52px] sm:h-[54px] rounded-full bg-[#18181b] hover:bg-black text-white dark:bg-white dark:text-[#09090b] dark:hover:bg-zinc-100 font-semibold text-[15.5px] sm:text-[16px] tracking-normal shadow-[0_8px_24px_rgba(0,0,0,0.14)] dark:shadow-[0_8px_24px_rgba(255,255,255,0.08)] active:scale-[0.98] transition-all flex items-center justify-center cursor-pointer"
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
