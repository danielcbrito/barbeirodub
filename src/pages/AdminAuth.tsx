import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { motion } from "framer-motion";
import { Loader2, Eye, EyeOff, Mail, Lock, ShieldAlert, ShieldCheck, ArrowLeft } from "lucide-react";
import logoDub from "@/assets/logo-dub.png";

const loginSchema = z.object({
  email: z.string().trim().email("Email inválido"),
  senha: z.string().min(1, "Senha é obrigatória"),
});

/**
 * Página de autenticação exclusiva para ADMIN
 * Bloqueia qualquer tentativa de acesso de usuários não-admin
 */
const AdminAuth = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [formData, setFormData] = useState({ email: "", senha: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [deniedEmail, setDeniedEmail] = useState("");

  useEffect(() => {
    checkExistingSession();
  }, []);

  const checkExistingSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { authorized } = await checkIfAuthorized(session.user.id);
        if (authorized) {
          navigate("/admin");
        } else {
          await supabase.auth.signOut();
          setAccessDenied(true);
          setDeniedEmail(session.user.email || "");
        }
      }
    } catch (error) {
      console.error("Error checking session:", error);
    } finally {
      setCheckingSession(false);
    }
  };

  const checkIfAuthorized = async (userId: string): Promise<{ authorized: boolean; role: string | null }> => {
    const { data: roles, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "barber"]);

    if (error) {
      console.error("Error checking user role:", error);
      return { authorized: false, role: null };
    }

    if (roles && roles.length > 0) {
      const isAdmin = roles.some((r) => r.role === "admin");
      return { authorized: true, role: isAdmin ? "admin" : "barber" };
    }

    return { authorized: false, role: null };
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (accessDenied) {
      setAccessDenied(false);
      setDeniedEmail("");
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setAccessDenied(false);

    try {
      const validated = loginSchema.parse({ email: formData.email, senha: formData.senha });

      const { data, error } = await supabase.auth.signInWithPassword({
        email: validated.email,
        password: validated.senha,
      });

      if (error) {
        if (error.message.includes("Invalid login")) toast.error("Email ou senha incorretos");
        else if (error.message.includes("Email not confirmed")) toast.error("Confirme seu email antes de fazer login");
        else if (error.message.includes("User is banned")) toast.error("Sua conta foi suspensa. Entre em contato com o suporte.");
        else toast.error("Erro ao fazer login: " + error.message);
        return;
      }

      if (data.user) {
        const { authorized, role } = await checkIfAuthorized(data.user.id);
        if (!authorized) {
          await supabase.auth.signOut();
          setAccessDenied(true);
          setDeniedEmail(data.user.email || "");
          return;
        }
        const roleLabel = role === "admin" ? "Administrador" : "Barbeiro";
        toast.success(`Bem-vindo, ${roleLabel}!`);
        navigate("/admin");
      }
    } catch (error) {
      if (error instanceof z.ZodError) toast.error(error.errors[0].message);
      else toast.error("Erro ao processar login");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setAccessDenied(false);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/login`,
        },
      });
      if (error) {
        toast.error("Erro ao conectar com Google: " + error.message);
        setIsLoading(false);
      }
      // Redirect happens automatically — onAuthStateChange + checkExistingSession handles the rest
    } catch (err) {
      toast.error("Erro ao iniciar login com Google");
      setIsLoading(false);
    }
  };

  // Loading state
  if (checkingSession) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-[13px] text-muted-foreground">Verificando acesso...</p>
        </div>
      </div>
    );
  }

  const inputClass =
    "h-12 pl-11 bg-muted/50 border-border text-foreground placeholder:text-muted-foreground/50 rounded-xl focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all text-sm";

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background relative">
      {/* Botão voltar */}
      <button
        onClick={() => navigate("/")}
        className="absolute left-0 top-0 flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors z-20"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 1rem)", paddingLeft: "1.5rem" }}
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="text-[13px] font-medium">Voltar</span>
      </button>

      <div className="flex-1 flex flex-col justify-center px-6 py-16 overflow-y-auto overscroll-contain">
        <div className="w-full max-w-sm mx-auto">

          {/* Logo + Title */}
          <motion.div
            className="flex flex-col items-center mb-8"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <img src={logoDub} alt="Barbearia DUB" className="w-14 h-14 object-contain mb-4" />
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <h1 className="text-[22px] font-bold text-foreground tracking-tight">
                Painel Administrativo
              </h1>
            </div>
            <p className="text-[13px] text-muted-foreground text-center">
              Acesso restrito a administradores
            </p>
          </motion.div>

          {/* Access Denied Alert */}
          {accessDenied && (
            <motion.div
              className="mb-6 p-4 rounded-xl border"
              style={{
                background: "hsl(var(--destructive) / 0.08)",
                borderColor: "hsl(var(--destructive) / 0.25)",
              }}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25 }}
            >
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[13px] font-semibold text-destructive">Acesso Negado</p>
                  <p className="text-[12px] text-destructive/80 mt-0.5">
                    O email <span className="font-medium">{deniedEmail}</span> não possui permissão para acessar este sistema.
                  </p>
                  <p className="text-[12px] text-muted-foreground mt-1.5">
                    Este sistema é exclusivo para administradores da Barbearia DUB.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Form */}
          <motion.form
            onSubmit={handleLogin}
            className="space-y-4"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
          >
            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider block">
                Email administrativo
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-muted-foreground/40" />
                <Input
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleInputChange}
                  className={inputClass}
                  placeholder="admin@exemplo.com"
                />
              </div>
            </div>

            {/* Senha */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider block">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-muted-foreground/40" />
                <Input
                  name="senha"
                  type={showPassword ? "text" : "password"}
                  required
                  value={formData.senha}
                  onChange={handleInputChange}
                  className={`${inputClass} pr-11`}
                  placeholder="Sua senha"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-[50px] rounded-xl font-semibold text-[14px] text-primary-foreground active:scale-[0.98] transition-transform duration-150 disabled:opacity-50 flex items-center justify-center gap-2"
              style={{
                background: "var(--gradient-primary)",
                boxShadow: "var(--shadow-glow-red)",
                marginTop: "0.5rem",
              }}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verificando...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Acessar Painel
                </>
              )}
            </button>
          </motion.form>

          {/* Divider */}
          <motion.div
            className="flex items-center gap-3 my-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="flex-1 h-px bg-border/50" />
            <span className="text-[11px] text-muted-foreground/60 uppercase tracking-wider">ou</span>
            <div className="flex-1 h-px bg-border/50" />
          </motion.div>

          {/* Google Login */}
          <motion.button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full h-[50px] rounded-xl font-semibold text-[14px] bg-card border border-border hover:bg-muted/80 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 flex items-center justify-center gap-3 text-foreground"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Entrar com Google
          </motion.button>

          {/* Footer */}
          <motion.div
            className="mt-8 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <p className="text-[11px] text-muted-foreground/50 uppercase tracking-wider">
              © 2025 Barbearia DUB — Painel Administrativo
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default AdminAuth;
