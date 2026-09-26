import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkle, ArrowLeft, Loader2, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { toast } from "sonner";
import { z } from "zod";

/**
 * AuthBottomSheet — Fluxo universal de autenticação (Notion/Slack/Luma)
 *
 * Etapas:
 *  'initial'  → Escolha do método (E-mail, Apple, Google)
 *  'email'    → Input de e-mail + botão "Continuar"
 *  'password' → E-mail existe em barbeiros → login com senha
 *  'signup'   → E-mail novo → cadastro com nome + senha
 */

interface AuthBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = "initial" | "email" | "password" | "signup";

/* ─── Validation ─── */
const emailSchema = z.string().trim().email("Digite um e-mail válido");

/* ─── SVG Icons ─── */
const AppleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.52-3.23 0-1.44.62-2.2.44-3.06-.4C3.79 16.17 4.36 9.02 8.93 8.76c1.27.07 2.16.72 2.91.76.95-.19 1.86-.89 3.13-.81 1.61.1 2.83.76 3.36 2.03-3.52 2.09-.95 6.64 2.72 5.54-.62 1.7-1.47 3.37-4 4zm-4.83-17c.11 1.78-1.31 3.43-3.1 3.72-.21-1.99 1.41-3.53 3.1-3.72z" />
  </svg>
);

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

/* ─── Shared styles ─── */
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "13px 16px",
  fontSize: 15,
  fontFamily: "DM Sans, sans-serif",
  borderRadius: 12,
  border: "1.5px solid #e0e0e0",
  outline: "none",
  backgroundColor: "#fff",
  color: "#111",
  transition: "border-color 0.15s",
};

const btnBlack: React.CSSProperties = {
  backgroundColor: "#111",
  borderRadius: 12,
  padding: "13px 14px",
  width: "100%",
  border: "none",
  cursor: "pointer",
};

const btnText: React.CSSProperties = {
  color: "#fff",
  fontWeight: 600,
  fontSize: 14,
  fontFamily: "DM Sans, sans-serif",
};

/* ─── Fade transition config ─── */
const fadeVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};

/* ─── Error messages ─── */
const ERROR_MESSAGES = {
  INVALID_EMAIL: "Digite um e-mail válido",
  WRONG_PASSWORD: "Senha incorreta. Tente novamente.",
  WEAK_PASSWORD: "Mínimo 6 caracteres",
  NETWORK: "Sem conexão. Tente novamente.",
  GENERIC: "Algo deu errado. Tente novamente.",
  EMPTY_PASSWORD: "Digite sua senha",
  EMPTY_NAME: "Digite seu nome completo",
} as const;

export default function AuthBottomSheet({ isOpen, onClose }: AuthBottomSheetProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("initial");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const emailInputRef = useRef<HTMLInputElement>(null);

  /* ─── Reset on close ─── */
  const handleClose = useCallback(() => {
    onClose();
    setTimeout(() => {
      setStep("initial");
      setEmail("");
      setPassword("");
      setNome("");
      setShowPassword(false);
      setError("");
      setIsLoading(false);
    }, 400);
  }, [onClose]);

  /* ─── Go back to email step ─── */
  const goBackToEmail = () => {
    setPassword("");
    setNome("");
    setShowPassword(false);
    setError("");
    setStep("email");
  };

  /* ─── OAuth providers ─── */
  const handleGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) toast.error("Erro ao conectar com Google");
  };

  const handleApple = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) toast.error("Erro ao conectar com Apple");
  };

  /* ─── ETAPA 2: Verificar e-mail e rotear ─── */
  const handleEmailContinue = async () => {
    setError("");
    const result = emailSchema.safeParse(email.trim());
    if (!result.success) {
      setError(ERROR_MESSAGES.INVALID_EMAIL);
      return;
    }

    setIsLoading(true);
    try {
      // Verificar se existe barbeiro com este e-mail
      const { data: isBarber, error: rpcError } = await supabase.rpc(
        "check_barbeiro_email_exists",
        { p_email: email.trim() }
      );

      if (rpcError) {
        console.error("Erro ao verificar e-mail:", rpcError);
        setError(ERROR_MESSAGES.GENERIC);
        return;
      }

      if (isBarber === true) {
        setStep("password");
        return;
      }

      // Não é barbeiro — verificar se existe em auth.users
      // (pode ser admin, ti, tenant_admin)
      const { data: userExists } = await supabase.rpc(
        "check_email_exists",
        { p_email: email.trim() }
      );

      if (userExists) {
        // Email existe no sistema mas não é barbeiro
        // AuthRouter redirecionará para rota correta após login
        setStep("password");
        return;
      }

      // Email não existe em lugar nenhum — novo usuário
      setStep("signup");
    } catch {
      setError(ERROR_MESSAGES.NETWORK);
    } finally {
      setIsLoading(false);
    }
  };

  /* ─── ETAPA 3A: Login com senha ─── */
  const handlePasswordLogin = async () => {
    setError("");
    if (!password.trim()) {
      setError(ERROR_MESSAGES.EMPTY_PASSWORD);
      return;
    }

    setIsLoading(true);
    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (loginError) {
        if (loginError.message.includes("Invalid login credentials")) {
          setError(ERROR_MESSAGES.WRONG_PASSWORD);
        } else {
          setError(ERROR_MESSAGES.GENERIC);
        }
        return;
      }

      // Invalida cache de permissões para forçar refetch com sessão autenticada
      const {
        data: { user },
      } = await supabase.auth.getUser();

      await queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.shared.permissoes(user?.id),
      });

      handleClose();
      toast.success("Login realizado com sucesso!");
    } catch {
      setError(ERROR_MESSAGES.NETWORK);
    } finally {
      setIsLoading(false);
    }
  };

  /* ─── ETAPA 3B: Criar conta ─── */
  const handleSignup = async () => {
    setError("");

    if (!nome.trim()) {
      setError(ERROR_MESSAGES.EMPTY_NAME);
      return;
    }
    if (!password.trim() || password.length < 6) {
      setError(ERROR_MESSAGES.WEAK_PASSWORD);
      return;
    }

    setIsLoading(true);
    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            nome: nome.trim(),
          },
        },
      });

      if (signUpError) {
        if (signUpError.message.includes("already registered")) {
          // Conta já existe no auth mas não em barbeiros → tentar login
          setError("Este e-mail já possui conta. Tente fazer login.");
          setStep("password");
        } else {
          setError(ERROR_MESSAGES.GENERIC);
        }
        return;
      }

      // Se o signup retornar sessão, o usuário já está logado
      if (signUpData?.session) {
        handleClose();
        toast.success("Conta criada com sucesso!");
      } else {
        // Supabase pediu confirmação de e-mail
        toast.success("Conta criada! Verifique seu e-mail para confirmar.");
        handleClose();
      }
    } catch {
      setError(ERROR_MESSAGES.NETWORK);
    } finally {
      setIsLoading(false);
    }
  };

  /* ─── Esqueceu a senha ─── */
  const handleForgotPassword = async () => {
    setError("");
    setIsLoading(true);
    try {
      const redirectUrl = window.location.origin.includes("localhost")
        ? "https://dubadmin.lovable.app/reset-password"
        : `${window.location.origin}/reset-password`;

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: redirectUrl }
      );

      if (resetError) {
        setError("Erro ao enviar link de recuperação.");
        return;
      }

      toast.success("Link de recuperação enviado para seu e-mail!");
    } catch {
      setError(ERROR_MESSAGES.NETWORK);
    } finally {
      setIsLoading(false);
    }
  };

  /* ─── Password input with toggle ─── */
  const PasswordInput = ({
    value,
    onChange,
    onKeyDown,
    placeholder = "Sua senha",
  }: {
    value: string;
    onChange: (v: string) => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
    placeholder?: string;
  }) => (
    <div style={{ position: "relative" }}>
      <input
        type={showPassword ? "text" : "password"}
        autoFocus
        value={value}
        onChange={(e) => { onChange(e.target.value); setError(""); }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={isLoading}
        style={{ ...inputStyle, paddingRight: 44 }}
        onFocus={(e) => (e.target.style.borderColor = "#111")}
        onBlur={(e) => (e.target.style.borderColor = "#e0e0e0")}
      />
      <button
        type="button"
        onClick={() => setShowPassword(!showPassword)}
        className="flex items-center justify-center transition-opacity hover:opacity-60"
        style={{
          position: "absolute",
          right: 12,
          top: "50%",
          transform: "translateY(-50%)",
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
        }}
      >
        {showPassword ? <EyeOff size={16} color="#999" /> : <Eye size={16} color="#999" />}
      </button>
    </div>
  );

  /* ─── "← Usar outro e-mail" link ─── */
  const BackToEmailLink = () => (
    <button
      onClick={goBackToEmail}
      disabled={isLoading}
      className="transition-opacity hover:opacity-70 disabled:opacity-40"
      style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
    >
      <span style={{ fontSize: 12, color: "#888", fontFamily: "DM Sans, sans-serif" }}>
        ← Usar outro e-mail
      </span>
    </button>
  );

  /* ─── Render step content ─── */
  const renderContent = () => {
    switch (step) {
      /* ═══ INITIAL ═══ */
      case "initial":
        return (
          <motion.div key="initial" variants={fadeVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }} className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <Sparkle size={20} color="#111" fill="#111" strokeWidth={0} />
              <button onClick={handleClose} className="flex items-center justify-center transition-opacity hover:opacity-60 p-0" style={{ background: "none", border: "none" }}>
                <X size={18} strokeWidth={1.5} color="#999" />
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <h2 style={{ fontSize: 21, fontWeight: 700, color: "#111", fontFamily: "DM Sans, sans-serif" }}>Comece agora</h2>
              <p style={{ fontSize: 13, color: "#888", lineHeight: 1.5, fontFamily: "DM Sans, sans-serif" }}>Cadastre-se para participar de eventos e gerenciar sua agenda.</p>
            </div>

            <button onClick={() => { setError(""); setStep("email"); }} className="w-full flex items-center justify-center active:scale-[0.97] transition-transform duration-100" style={btnBlack}>
              <span style={btnText}>Continuar com E-mail</span>
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px" style={{ backgroundColor: "#e8e5e0" }} />
              <span style={{ fontSize: 11, color: "#bbb", fontFamily: "DM Sans, sans-serif" }}>ou</span>
              <div className="flex-1 h-px" style={{ backgroundColor: "#e8e5e0" }} />
            </div>

            <div className="flex gap-2.5">
              <button onClick={handleApple} className="flex-1 flex items-center justify-center gap-2 active:scale-[0.97] transition-transform duration-100" style={{ backgroundColor: "#f5f3ef", borderRadius: 12, padding: "11px 0" }}>
                <AppleIcon />
                <span style={{ fontWeight: 600, fontSize: 13, color: "#111", fontFamily: "DM Sans, sans-serif" }}>Apple</span>
              </button>
              <button onClick={handleGoogle} className="flex-1 flex items-center justify-center gap-2 active:scale-[0.97] transition-transform duration-100" style={{ backgroundColor: "#f5f3ef", borderRadius: 12, padding: "11px 0" }}>
                <GoogleIcon />
                <span style={{ fontWeight: 600, fontSize: 13, color: "#111", fontFamily: "DM Sans, sans-serif" }}>Google</span>
              </button>
            </div>

            <p className="text-center" style={{ fontSize: 10, color: "#bbb", fontFamily: "DM Sans, sans-serif", lineHeight: 1.4 }}>
              Ao continuar, você concorda com os{" "}
              <span className="underline cursor-pointer">Termos</span> e{" "}
              <span className="underline cursor-pointer">Política de Privacidade</span>
            </p>
          </motion.div>
        );

      /* ═══ ETAPA 2: EMAIL INPUT ═══ */
      case "email":
        return (
          <motion.div key="email" variants={fadeVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }} className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <button onClick={() => setStep("initial")} className="flex items-center justify-center transition-opacity hover:opacity-60 p-0" style={{ background: "none", border: "none" }}>
                <ArrowLeft size={18} strokeWidth={1.5} color="#999" />
              </button>
              <button onClick={handleClose} className="flex items-center justify-center transition-opacity hover:opacity-60 p-0" style={{ background: "none", border: "none" }}>
                <X size={18} strokeWidth={1.5} color="#999" />
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <h2 style={{ fontSize: 21, fontWeight: 700, color: "#111", fontFamily: "DM Sans, sans-serif" }}>Digite seu e-mail</h2>
              <p style={{ fontSize: 13, color: "#888", lineHeight: 1.5, fontFamily: "DM Sans, sans-serif" }}>Vamos verificar se você já tem uma conta.</p>
            </div>

            <div>
              <input
                ref={emailInputRef}
                type="email"
                autoFocus
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleEmailContinue()}
                placeholder="seu@email.com"
                disabled={isLoading}
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = "#111")}
                onBlur={(e) => (e.target.style.borderColor = "#e0e0e0")}
              />
              {error && <p style={{ fontSize: 12, color: "#ef4444", marginTop: 6, fontFamily: "DM Sans, sans-serif" }}>{error}</p>}
            </div>

            <button
              onClick={handleEmailContinue}
              disabled={isLoading || !email.trim()}
              className="w-full flex items-center justify-center active:scale-[0.97] transition-transform duration-100 disabled:opacity-40"
              style={btnBlack}
            >
              {isLoading
                ? <Loader2 size={18} color="#fff" className="animate-spin" />
                : <span style={btnText}>Continuar</span>}
            </button>
          </motion.div>
        );

      /* ═══ ETAPA 3A: PASSWORD LOGIN ═══ */
      case "password":
        return (
          <motion.div key="password" variants={fadeVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }} className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <button onClick={goBackToEmail} className="flex items-center justify-center transition-opacity hover:opacity-60 p-0" style={{ background: "none", border: "none" }}>
                <ArrowLeft size={18} strokeWidth={1.5} color="#999" />
              </button>
              <button onClick={handleClose} className="flex items-center justify-center transition-opacity hover:opacity-60 p-0" style={{ background: "none", border: "none" }}>
                <X size={18} strokeWidth={1.5} color="#999" />
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <h2 style={{ fontSize: 21, fontWeight: 700, color: "#111", fontFamily: "DM Sans, sans-serif" }}>Bem-vindo de volta!</h2>
              <p style={{ fontSize: 13, color: "#888", lineHeight: 1.5, fontFamily: "DM Sans, sans-serif" }}>
                <span style={{ color: "#555", fontWeight: 500 }}>{email}</span>
              </p>
            </div>

            <PasswordInput
              value={password}
              onChange={setPassword}
              onKeyDown={(e) => e.key === "Enter" && handlePasswordLogin()}
              placeholder="Sua senha"
            />

            {error && <p style={{ fontSize: 12, color: "#ef4444", marginTop: -8, fontFamily: "DM Sans, sans-serif" }}>{error}</p>}

            <button
              onClick={handlePasswordLogin}
              disabled={isLoading || !password.trim()}
              className="w-full flex items-center justify-center active:scale-[0.97] transition-transform duration-100 disabled:opacity-40"
              style={btnBlack}
            >
              {isLoading
                ? <Loader2 size={18} color="#fff" className="animate-spin" />
                : <span style={btnText}>Entrar</span>}
            </button>

            {/* Esqueceu a senha */}
            <div className="flex items-center justify-between">
              <BackToEmailLink />
              <button
                onClick={handleForgotPassword}
                disabled={isLoading}
                className="transition-opacity hover:opacity-70 disabled:opacity-40"
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                <span style={{ fontSize: 12, color: "#888", fontFamily: "DM Sans, sans-serif" }}>
                  Esqueci minha senha
                </span>
              </button>
            </div>
          </motion.div>
        );

      /* ═══ ETAPA 3B: SIGNUP ═══ */
      case "signup":
        return (
          <motion.div key="signup" variants={fadeVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }} className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <button onClick={goBackToEmail} className="flex items-center justify-center transition-opacity hover:opacity-60 p-0" style={{ background: "none", border: "none" }}>
                <ArrowLeft size={18} strokeWidth={1.5} color="#999" />
              </button>
              <button onClick={handleClose} className="flex items-center justify-center transition-opacity hover:opacity-60 p-0" style={{ background: "none", border: "none" }}>
                <X size={18} strokeWidth={1.5} color="#999" />
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <h2 style={{ fontSize: 21, fontWeight: 700, color: "#111", fontFamily: "DM Sans, sans-serif" }}>Criar sua conta</h2>
              <p style={{ fontSize: 13, color: "#888", lineHeight: 1.5, fontFamily: "DM Sans, sans-serif" }}>
                <span style={{ color: "#555", fontWeight: 500 }}>{email}</span>
              </p>
            </div>

            {/* Nome completo */}
            <input
              type="text"
              autoFocus
              value={nome}
              onChange={(e) => { setNome(e.target.value); setError(""); }}
              placeholder="Seu nome completo"
              disabled={isLoading}
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = "#111")}
              onBlur={(e) => (e.target.style.borderColor = "#e0e0e0")}
            />

            {/* Criar senha */}
            <PasswordInput
              value={password}
              onChange={setPassword}
              onKeyDown={(e) => e.key === "Enter" && handleSignup()}
              placeholder="Criar senha (mínimo 6 caracteres)"
            />

            {error && <p style={{ fontSize: 12, color: "#ef4444", marginTop: -8, fontFamily: "DM Sans, sans-serif" }}>{error}</p>}

            <button
              onClick={handleSignup}
              disabled={isLoading || !nome.trim() || !password.trim()}
              className="w-full flex items-center justify-center active:scale-[0.97] transition-transform duration-100 disabled:opacity-40"
              style={btnBlack}
            >
              {isLoading
                ? <Loader2 size={18} color="#fff" className="animate-spin" />
                : <span style={btnText}>Criar conta</span>}
            </button>

            <BackToEmailLink />
          </motion.div>
        );
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            className="fixed inset-0 z-50"
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={handleClose}
          />

          {/* Bottom sheet */}
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 flex justify-center pointer-events-none px-2 pb-2"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <div
              className="pointer-events-auto flex flex-col w-full"
              style={{
                maxWidth: 380,
                backgroundColor: "#ffffff",
                borderRadius: 20,
                boxShadow: "0 8px 40px rgba(0,0,0,0.15), 0 2px 12px rgba(0,0,0,0.08)",
              }}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-2.5 pb-0.5">
                <div className="rounded-full" style={{ width: 32, height: 3.5, backgroundColor: "#d4d4d4" }} />
              </div>

              {/* Content */}
              <div className="px-5 pb-5 pt-1.5">
                <AnimatePresence mode="wait">
                  {renderContent()}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
