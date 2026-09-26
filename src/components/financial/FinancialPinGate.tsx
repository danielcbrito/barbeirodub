import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, ArrowLeft, ShieldCheck, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface FinancialPinGateProps {
  userId: string;
  userName?: string;
  userPhoto?: string | null;
  onBack?: () => void;
  children: React.ReactNode;
  /** Incrementar para forçar re-check do PIN */
  refreshKey?: number;
}

type GateState = "loading" | "no-pin" | "enter-pin" | "authenticated";

/**
 * FinancialPinGate — Tela de autenticação por PIN financeiro
 * Estilo banco digital premium, bloqueia acesso até PIN correto
 */
export function FinancialPinGate({
  userId,
  userName,
  userPhoto,
  onBack,
  children,
  refreshKey,
}: FinancialPinGateProps) {
  const [state, setState] = useState<GateState>("loading");
  const [pin, setPin] = useState<string[]>(["", "", "", ""]);
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const [validating, setValidating] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    checkPin();
  }, [userId, refreshKey]);

  const checkPin = async () => {
    try {
      // Server-side: nunca expõe o hash ao navegador.
      const { data, error: rpcError } = await supabase.rpc("has_financial_pin");
      if (rpcError) {
        setState("no-pin");
        return;
      }
      setState(data ? "enter-pin" : "no-pin");
    } catch {
      setState("no-pin");
    }
  };

  const handleDigit = useCallback(
    (index: number, value: string) => {
      if (!/^\d?$/.test(value)) return;

      const newPin = [...pin];
      newPin[index] = value;
      setPin(newPin);
      setError(false);

      // Avança para próximo campo
      if (value && index < 3) {
        inputRefs.current[index + 1]?.focus();
      }

      // Verifica PIN quando completo
      if (value && index === 3) {
        const fullPin = newPin.join("");
        if (fullPin.length === 4) {
          validatePin(fullPin);
        }
      }
    },
    [pin]
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent) => {
      if (e.key === "Backspace" && !pin[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
        const newPin = [...pin];
        newPin[index - 1] = "";
        setPin(newPin);
      }
    },
    [pin]
  );

  const validatePin = async (fullPin: string) => {
    setValidating(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("verify_financial_pin", {
        p_pin: fullPin,
      });
      if (!rpcError && data === true) {
        setState("authenticated");
        return;
      }
    } catch {
      /* fallthrough to error */
    } finally {
      setValidating(false);
    }
    setError(true);
    setShake(true);
    setTimeout(() => {
      setShake(false);
      setPin(["", "", "", ""]);
      inputRefs.current[0]?.focus();
    }, 600);
  };

  // Loading
  if (state === "loading") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background pt-[env(safe-area-inset-top)]">
        <div className="w-7 h-7 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  // Sem PIN — acesso direto
  if (state === "no-pin" || state === "authenticated") {
    return <>{children}</>;
  }

  // Tela de PIN
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background pt-[env(safe-area-inset-top)]">
      {/* Header minimalista */}
      <div className="flex items-center px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-4">
        {onBack && (
          <button
            onClick={onBack}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-foreground/[0.05] active:bg-foreground/10 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Conteúdo central */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 -mt-16">
        {/* Avatar/Ícone */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="mb-8"
        >
          {userPhoto ? (
            <div className="w-20 h-20 rounded-full overflow-hidden ring-2 ring-border/30 ring-offset-2 ring-offset-background">
              <img src={userPhoto} alt="" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-20 h-20 rounded-full bg-foreground/[0.04] border border-border/30 flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-muted-foreground/40" />
            </div>
          )}
        </motion.div>

        {/* Texto */}
        <motion.div
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.35 }}
          className="text-center mb-10"
        >
          <h2 className="text-lg font-semibold text-foreground mb-1.5">
            {userName ? `Olá, ${userName.split(" ")[0]}` : "Área Financeira"}
          </h2>
          <p className="text-[13px] text-muted-foreground/60 leading-relaxed">
            Digite seu PIN para acessar
          </p>
        </motion.div>

        {/* Campos PIN */}
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{
            y: 0,
            opacity: 1,
            x: shake ? [0, -12, 12, -8, 8, -4, 4, 0] : 0,
          }}
          transition={{
            y: { delay: 0.2, duration: 0.35 },
            opacity: { delay: 0.2, duration: 0.35 },
            x: { duration: 0.5, ease: "easeOut" },
          }}
          className="flex items-center gap-4 mb-8"
        >
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="relative">
              <input
                ref={(el) => { inputRefs.current[i] = el; }}
                type="password"
                inputMode="numeric"
                maxLength={1}
                value={pin[i]}
                onChange={(e) => handleDigit(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                autoFocus={i === 0}
                className={cn(
                  "w-14 h-16 text-center text-2xl font-bold rounded-2xl outline-none transition-all duration-200",
                  "bg-foreground/[0.03] border-2",
                  "focus:border-foreground/30 focus:bg-foreground/[0.06]",
                  "caret-transparent",
                  error
                    ? "border-destructive/50 bg-destructive/5"
                    : pin[i]
                    ? "border-foreground/20 bg-foreground/[0.05]"
                    : "border-border/30"
                )}
              />
              {/* Dot indicator */}
              {pin[i] && !error && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                >
                  <div className="w-3 h-3 rounded-full bg-foreground/80" />
                </motion.div>
              )}
            </div>
          ))}
        </motion.div>

        {/* Erro */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center gap-2 text-destructive mb-4"
            >
              <AlertCircle className="w-4 h-4" />
              <span className="text-[13px] font-medium">PIN incorreto. Tente novamente.</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer discreto */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex items-center gap-1.5 text-muted-foreground/30 mt-6"
        >
          <Lock className="w-3 h-3" />
          <span className="text-[11px] font-medium tracking-wide">
            Acesso protegido
          </span>
        </motion.div>
      </div>
    </div>
  );
}
