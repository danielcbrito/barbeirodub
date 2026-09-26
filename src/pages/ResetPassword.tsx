import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { motion } from "framer-motion";
import { Loader2, CheckCircle2, AlertCircle, Lock, Eye, EyeOff } from "lucide-react";
import logoDub from "@/assets/logo-dub.png";

const passwordSchema = z
  .object({
    password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
    confirmPassword: z.string().min(6, "Confirme sua senha"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });

const ResetPassword = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [hasValidToken, setHasValidToken] = useState<boolean | null>(null);
  const [passwordReset, setPasswordReset] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [formData, setFormData] = useState({ password: "", confirmPassword: "" });
  const [confirmError, setConfirmError] = useState("");

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) {
        setHasValidToken(false);
        toast.error("Link de recuperação inválido ou expirado");
      } else {
        setHasValidToken(true);
      }
    };
    checkSession();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const next = { ...prev, [name]: value };
      // Real-time confirm check
      if (name === "confirmPassword" && next.password && value) {
        setConfirmError(next.password !== value ? "As senhas não coincidem" : "");
      } else {
        setConfirmError("");
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const validated = passwordSchema.parse(formData);
      const { error } = await supabase.auth.updateUser({ password: validated.password });
      if (error) {
        if (error.message.includes("session")) {
          toast.error("Sessão expirada. Solicite um novo link de recuperação.");
          setTimeout(() => navigate("/esqueci-senha"), 2000);
        } else {
          toast.error("Erro ao redefinir senha: " + error.message);
        }
        return;
      }
      setPasswordReset(true);
      toast.success("Senha redefinida com sucesso!");
      setTimeout(() => navigate("/auth"), 2500);
    } catch (error) {
      if (error instanceof z.ZodError) toast.error(error.errors[0].message);
      else toast.error("Erro ao processar redefinição");
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass =
    "h-12 pl-11 bg-muted/50 border-border text-foreground placeholder:text-muted-foreground/50 rounded-xl focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all text-sm";

  // Loading
  if (hasValidToken === null) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-[13px] text-muted-foreground">Verificando link de recuperação...</p>
        </div>
      </div>
    );
  }

  // Invalid token
  if (hasValidToken === false) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background px-6">
        <motion.div
          className="flex flex-col items-center text-center max-w-sm"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
        >
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
            style={{ background: "hsl(var(--destructive) / 0.12)", border: "1px solid hsl(var(--destructive) / 0.25)" }}
          >
            <AlertCircle className="w-10 h-10 text-destructive" />
          </div>
          <h2 className="text-[22px] font-bold text-foreground mb-2">Link inválido ou expirado</h2>
          <p className="text-[13px] text-muted-foreground mb-8 leading-relaxed">
            O link de recuperação não é válido ou já expirou. Solicite um novo link.
          </p>
          <button
            onClick={() => navigate("/esqueci-senha")}
            className="w-full h-[50px] rounded-xl font-semibold text-[14px] text-primary-foreground active:scale-[0.98] transition-transform duration-150"
            style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow-red)" }}
          >
            Solicitar novo link
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <div className="flex-1 flex flex-col justify-center px-6 py-16 overflow-y-auto overscroll-contain">
        <div className="w-full max-w-sm mx-auto">

          {!passwordReset ? (
            <>
              {/* Logo + Title */}
              <motion.div
                className="flex flex-col items-center mb-8"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              >
                <img src={logoDub} alt="DUB" className="w-14 h-14 object-contain mb-4" />
                <h1 className="text-[22px] font-bold text-foreground tracking-tight">
                  Redefinir senha
                </h1>
                <p className="mt-1 text-[13px] text-muted-foreground text-center">
                  Escolha uma nova senha segura para sua conta
                </p>
              </motion.div>

              {/* Form */}
              <motion.form
                onSubmit={handleSubmit}
                className="space-y-4"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
              >
                {/* Nova Senha */}
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider block">
                    Nova senha
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-muted-foreground/40" />
                    <Input
                      name="password"
                      type={showPassword ? "text" : "password"}
                      required
                      value={formData.password}
                      onChange={handleInputChange}
                      className={`${inputClass} pr-11`}
                      placeholder="Mínimo 6 caracteres"
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

                {/* Confirmar Senha */}
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider block">
                    Confirmar nova senha
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-muted-foreground/40" />
                    <Input
                      name="confirmPassword"
                      type={showConfirm ? "text" : "password"}
                      required
                      value={formData.confirmPassword}
                      onChange={handleInputChange}
                      className={`${inputClass} pr-11 ${confirmError ? "border-destructive/60" : ""}`}
                      placeholder="Digite a senha novamente"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                    >
                      {showConfirm ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                    </button>
                  </div>
                  {confirmError && (
                    <p className="text-[11px] text-destructive pl-1">{confirmError}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !!confirmError}
                  className="w-full h-[50px] rounded-xl font-semibold text-[14px] text-primary-foreground active:scale-[0.98] transition-transform duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: "var(--gradient-primary)",
                    boxShadow: "var(--shadow-glow-red)",
                    marginTop: "0.25rem",
                  }}
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Redefinindo...
                    </span>
                  ) : (
                    "Redefinir senha"
                  )}
                </button>
              </motion.form>
            </>
          ) : (
            /* Success */
            <motion.div
              className="flex flex-col items-center text-center"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
                style={{ background: "hsl(var(--primary) / 0.12)", border: "1px solid hsl(var(--primary) / 0.25)" }}
              >
                <CheckCircle2 className="w-10 h-10 text-primary" />
              </div>
              <h1 className="text-[22px] font-bold text-foreground mb-2">Senha redefinida!</h1>
              <p className="text-[13px] text-muted-foreground mb-6 leading-relaxed">
                Sua senha foi atualizada com sucesso.<br />Redirecionando para o login...
              </p>
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
