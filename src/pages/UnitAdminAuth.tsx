import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { motion } from "framer-motion";
import { Loader2, Eye, EyeOff, Mail, Lock, Shield, ShieldCheck, ArrowLeft, Building2 } from "lucide-react";
import logoDub from "@/assets/logo-dub.png";

const loginSchema = z.object({
  email: z.string().trim().email("Email inválido"),
  senha: z.string().min(1, "Senha é obrigatória"),
});

interface UnitInfo {
  id: string;
  nome: string;
  cidade?: string;
  bairro?: string;
}

/**
 * Página de login exclusiva para ADMIN DE UNIDADE
 * Autentica o usuário e verifica se ele possui role 'admin' em alguma barbeiro_unidades
 */
const UnitAdminAuth = () => {
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
        const result = await checkIfUnitAdmin(session.user.id);
        if (result.authorized) {
          navigate("/admin-unidade");
        } else {
          await supabase.auth.signOut();
        }
      }
    } catch (error) {
      console.error("Error checking session:", error);
    } finally {
      setCheckingSession(false);
    }
  };

  /** Verifica se o usuário é admin de pelo menos uma unidade */
  const checkIfUnitAdmin = async (userId: string): Promise<{ authorized: boolean; units: UnitInfo[] }> => {
    try {
      // Buscar barbeiro_id do usuário
      const { data: barbers } = await supabase
        .from("barbeiros")
        .select("id")
        .eq("user_id", userId)
        .eq("ativo", true)
        .is("deleted_at", null);

      if (!barbers || barbers.length === 0) {
        return { authorized: false, units: [] };
      }

      const barberIds = barbers.map(b => b.id);

      // Buscar vínculos com role='admin' em barbeiro_unidades
      const { data: adminLinks } = await (supabase
        .from("barbeiro_unidades")
        .select("unidade_id") as any)
        .in("barbeiro_id", barberIds)
        .eq("role", "admin");

      if (!adminLinks || adminLinks.length === 0) {
        // Verificar também se tem role 'unit_admin' na user_roles
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "unit_admin");

        if (!roles || roles.length === 0) {
          return { authorized: false, units: [] };
        }
      }

      const unitIds = (adminLinks || []).map(l => l.unidade_id);
      let units: UnitInfo[] = [];

      if (unitIds.length > 0) {
        const { data: unitData } = await supabase
          .from("tenant_unidades")
          .select("id, nome, cidade, bairro")
          .in("id", unitIds)
          .eq("ativo", true);
        units = (unitData || []).map(u => ({
          id: u.id,
          nome: u.nome,
          cidade: u.cidade || undefined,
          bairro: u.bairro || undefined,
        }));
      }

      return { authorized: true, units };
    } catch (err) {
      console.error("Erro ao verificar admin de unidade:", err);
      return { authorized: false, units: [] };
    }
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
        else toast.error("Erro ao fazer login: " + error.message);
        return;
      }

      if (data.user) {
        const result = await checkIfUnitAdmin(data.user.id);
        if (!result.authorized) {
          await supabase.auth.signOut();
          setAccessDenied(true);
          setDeniedEmail(data.user.email || "");
          return;
        }

        // Garantir que o user_roles tenha 'unit_admin'
        await supabase.from("user_roles").upsert(
          { user_id: data.user.id, role: "unit_admin" as any },
          { onConflict: "user_id,role" }
        );

        toast.success("Bem-vindo, Admin da Unidade!");
        navigate("/admin-unidade");
      }
    } catch (error) {
      if (error instanceof z.ZodError) toast.error(error.errors[0].message);
      else toast.error("Erro ao processar login");
    } finally {
      setIsLoading(false);
    }
  };

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
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-4">
              <Building2 className="w-7 h-7 text-amber-500" />
            </div>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-5 h-5 text-amber-500" />
              <h1 className="text-[22px] font-bold text-foreground tracking-tight">
                Admin de Unidade
              </h1>
            </div>
            <p className="text-[13px] text-muted-foreground text-center">
              Acesso exclusivo para administradores de filiais
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
                <Shield className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[13px] font-semibold text-destructive">Acesso Negado</p>
                  <p className="text-[12px] text-destructive/80 mt-0.5">
                    O email <span className="font-medium">{deniedEmail}</span> não é admin de nenhuma unidade.
                  </p>
                  <p className="text-[12px] text-muted-foreground mt-1.5">
                    Peça ao proprietário da barbearia para definir você como admin.
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
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider block">
                Email
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
                  placeholder="seu@email.com"
                />
              </div>
            </div>

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

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-[50px] rounded-xl font-semibold text-[14px] bg-amber-500 text-foreground active:scale-[0.98] transition-transform duration-150 disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-amber-600"
              style={{ marginTop: "0.5rem" }}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verificando...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Acessar Painel da Unidade
                </>
              )}
            </button>
          </motion.form>

          <motion.div
            className="mt-8 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <p className="text-[11px] text-muted-foreground/50 uppercase tracking-wider">
              Admin de Unidade — Acesso restrito
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default UnitAdminAuth;
