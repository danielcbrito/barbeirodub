import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Eye, EyeOff, Mail, Lock, ArrowLeft, Scissors } from "lucide-react";
import logoDub from "@/assets/logo-dub.png";

/* ─── Schemas ─────────────────────────────────────────────────────── */
const emailSchema = z.string().trim().email();
const signupSchema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  senha: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
});

/* ─── Google Icon ─────────────────────────────────────────────────── */
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

/**
 * Tela de cadastro para DONOS DE BARBEARIA (tenant_admin)
 * Fluxo: Google OAuth ou e-mail/senha → redireciona para /onboarding
 */
const Register = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [cooldownTimer, setCooldownTimer] = useState(0);

  const emailValid = emailSchema.safeParse(email).success;

  useEffect(() => {
    // Se já tem sessão e é tenant_admin, ir direto para o painel
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) return;
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);
      
      if (roles?.some((r) => r.role === "tenant_admin")) {
        // Verificar se onboarding foi completado
        const { data: tenant } = await supabase
          .from("tenants")
          .select("onboarding_completed")
          .eq("owner_user_id", session.user.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        
        if (tenant?.onboarding_completed) {
          navigate("/admin");
        } else {
          navigate("/onboarding");
        }
      }
    });
  }, []);

  useEffect(() => {
    if (cooldownTimer > 0) {
      const t = setTimeout(() => setCooldownTimer((c) => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [cooldownTimer]);

  const handleGoogleSignup = async () => {
    setIsGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/onboarding`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) toast.error("Erro ao conectar com Google: " + error.message);
    } catch {
      toast.error("Erro ao conectar com Google");
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const validated = signupSchema.parse({ email, senha });
      const { data, error } = await supabase.auth.signUp({
        email: validated.email,
        password: validated.senha,
        options: {
          emailRedirectTo: `${window.location.origin.includes("localhost") ? "https://dubadmin.lovable.app" : window.location.origin}/auth/callback`,
          data: { is_tenant_signup: true },
        },
      });
      if (error) {
        if (error.message.includes("already registered"))
          toast.error("Este e-mail já está cadastrado. Faça login.");
        else if (error.message.includes("only request this after")) {
          const seconds = parseInt(error.message.match(/\d+/)?.[0] || "10");
          setCooldownTimer(seconds);
          toast.error(`Aguarde ${seconds}s antes de tentar novamente.`);
        } else toast.error(error.message);
        return;
      }
      if (data.user) {
        toast.success("Conta criada! Verifique seu e-mail para continuar.");
      }
    } catch (err) {
      if (err instanceof z.ZodError) toast.error(err.errors[0].message);
      else toast.error("Erro ao criar conta");
    } finally {
      setIsLoading(false);
    }
  };

  const inputBase =
    "h-[52px] pl-11 bg-muted/30 border border-border/70 text-foreground placeholder:text-muted-foreground/40 rounded-xl focus:border-primary/40 focus:ring-1 focus:ring-primary/15 transition-all text-[15px]";

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">

      {/* Back */}
      <button
        onClick={() => navigate("/")}
        className="absolute left-5 top-5 flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors z-20"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="text-[13px] font-medium">Voltar</span>
      </button>

      <div className="flex-1 flex flex-col justify-center px-6 py-20 overflow-y-auto">
        <motion.div
          className="w-full max-w-[340px] mx-auto"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >

          {/* Logo + Heading */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: "hsl(var(--primary) / 0.12)" }}>
              <Scissors className="w-6 h-6" style={{ color: "hsl(var(--primary))" }} />
            </div>
            <h1 className="text-[22px] font-bold text-foreground tracking-tight text-center">
              Abra sua barbearia
            </h1>
            <p className="mt-1.5 text-[13px] text-muted-foreground text-center leading-snug max-w-[240px]">
              Crie sua conta e tenha um sistema completo em minutos
            </p>
          </div>

          {/* Google */}
          <button
            type="button"
            onClick={handleGoogleSignup}
            disabled={isGoogleLoading || isLoading}
            className="w-full h-[52px] rounded-xl border border-border/80 bg-card hover:bg-muted/40 transition-colors flex items-center justify-center gap-3 active:scale-[0.99] disabled:opacity-50 mb-6"
          >
            {isGoogleLoading
              ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              : <GoogleIcon />}
            <span className="text-[14px] font-semibold text-foreground">
              Continuar com Google
            </span>
          </button>

          {/* Divider */}
          <div className="relative flex items-center mb-6">
            <div className="flex-1 h-px bg-border/50" />
            <span className="mx-4 text-[12px] text-muted-foreground/50 uppercase tracking-widest">ou</span>
            <div className="flex-1 h-px bg-border/50" />
          </div>

          {/* Form */}
          <form onSubmit={handleSignup} className="space-y-4" noValidate>
            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider block">
                E-mail
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[17px] h-[17px] text-muted-foreground/35 pointer-events-none" />
                <Input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputBase}
                  placeholder="seu@email.com"
                />
              </div>
            </div>

            <AnimatePresence>
              {emailValid && (
                <motion.div
                  key="pwd"
                  className="space-y-1.5"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                >
                  <label className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider block">
                    Senha
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[17px] h-[17px] text-muted-foreground/35 pointer-events-none" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      className={`${inputBase} pr-12`}
                      placeholder="Mínimo 6 caracteres"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/35 hover:text-muted-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-[17px] h-[17px]" /> : <Eye className="w-[17px] h-[17px]" />}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {emailValid && (
                <motion.div
                  key="submit"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.2 }}
                  className="pt-1"
                >
                  <button
                    type="submit"
                    disabled={isLoading || cooldownTimer > 0 || !emailValid || senha.length < 6}
                    className="w-full h-[52px] rounded-xl font-semibold text-[15px] text-primary-foreground active:scale-[0.98] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow-red)" }}
                  >
                    {isLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Criando sua conta...
                      </span>
                    ) : cooldownTimer > 0 ? (
                      `Aguarde ${cooldownTimer}s`
                    ) : (
                      "Criar minha barbearia"
                    )}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </form>

          {/* Login link */}
          <div className="mt-8 text-center">
            <p className="text-[13px] text-muted-foreground">
              Já tem uma conta?{" "}
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="text-primary font-semibold hover:text-primary/80 transition-colors"
              >
                Entrar
              </button>
            </p>
          </div>

        </motion.div>
      </div>
    </div>
  );
};

export default Register;
