import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Eye, EyeOff, ChevronLeft } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

import { useStatusBarColor } from "@/hooks/useStatusBarColor";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";

/* ─── Schemas ─────────────────────────────────────────────────────── */
const emailSchema = z.string().trim().email("E-mail inválido").max(255);
const passwordSchema = z.string().min(6, "Senha deve ter pelo menos 6 caracteres");
const nameSchema = z.string().trim().min(3, "Digite seu nome completo").max(120);

/* ─── Helpers: máscara + validação BR ─────────────────────────────── */
const onlyDigits = (v: string) => v.replace(/\D/g, "");

const VALID_BR_DDDS = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "24", "27", "28",
  "31", "32", "33", "34", "35", "37", "38",
  "41", "42", "43", "44", "45", "46", "47", "48", "49",
  "51", "53", "54", "55",
  "61", "62", "63", "64", "65", "66", "67", "68", "69",
  "71", "73", "74", "75", "77", "79",
  "81", "82", "83", "84", "85", "86", "87", "88", "89",
  "91", "92", "93", "94", "95", "96", "97", "98", "99",
]);

const isValidBrDdd = (ddd: string) => VALID_BR_DDDS.has(ddd);

const maskCpf = (v: string) => {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
};

const isValidCpf = (raw: string) => {
  const cpf = onlyDigits(raw);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  const calc = (base: number) => {
    let sum = 0;
    for (let i = 0; i < base; i++) sum += Number(cpf[i]) * (base + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
};

const stripBrCountryCode = (v: string) => {
  let d = onlyDigits(v);

  // Remove o DDI do Brasil quando o usuário digita/cola 55 + DDD + número.
  // Ex.: 5511952160719 vira 11952160719 e aparece como (11) 95216-0719.
  // Se o usuário digitar só o DDD direto, continua igual.
  while (d.length > 11 && d.startsWith("55") && isValidBrDdd(d.slice(2, 4))) {
    d = d.slice(2);
  }

  // Durante a digitação, o campo antes travava em (55) 11952-1607 porque
  // o maxLength cortava antes do número completo. Assim que detecta 55 + DDD
  // real, já remove o DDI e libera o restante da digitação.
  const possibleDddAfterCountry = d.slice(2, 4);
  if (
    d.length >= 4 &&
    d.startsWith("55") &&
    possibleDddAfterCountry !== "55" &&
    isValidBrDdd(possibleDddAfterCountry)
  ) {
    d = d.slice(2);
  }

  return d.slice(0, 11);
};

/* ─── Países suportados (DDI + máscara/validação) ─────────────────── */
type Country = {
  code: string;
  name: string;
  flag: string;
  dial: string; // sem "+"
  minLen: number;
  maxLen: number;
  mask?: (d: string) => string;
};

const COUNTRIES: Country[] = [
  {
    code: "BR", name: "Brasil", flag: "🇧🇷", dial: "55", minLen: 10, maxLen: 11,
    mask: (d) =>
      d.length <= 10
        ? d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2")
        : d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2"),
  },
  { code: "US", name: "Estados Unidos", flag: "🇺🇸", dial: "1", minLen: 10, maxLen: 10,
    mask: (d) => d.replace(/(\d{3})(\d)/, "($1) $2").replace(/(\d{3})(\d)/, "$1-$2") },
  { code: "PT", name: "Portugal", flag: "🇵🇹", dial: "351", minLen: 9, maxLen: 9,
    mask: (d) => d.replace(/(\d{3})(\d{3})(\d)/, "$1 $2 $3") },
  { code: "ES", name: "Espanha", flag: "🇪🇸", dial: "34", minLen: 9, maxLen: 9,
    mask: (d) => d.replace(/(\d{3})(\d{3})(\d)/, "$1 $2 $3") },
  { code: "AR", name: "Argentina", flag: "🇦🇷", dial: "54", minLen: 10, maxLen: 11 },
  { code: "MX", name: "México", flag: "🇲🇽", dial: "52", minLen: 10, maxLen: 10 },
  { code: "CL", name: "Chile", flag: "🇨🇱", dial: "56", minLen: 9, maxLen: 9 },
  { code: "CO", name: "Colômbia", flag: "🇨🇴", dial: "57", minLen: 10, maxLen: 10 },
  { code: "PY", name: "Paraguai", flag: "🇵🇾", dial: "595", minLen: 9, maxLen: 9 },
  { code: "UY", name: "Uruguai", flag: "🇺🇾", dial: "598", minLen: 8, maxLen: 9 },
  { code: "GB", name: "Reino Unido", flag: "🇬🇧", dial: "44", minLen: 10, maxLen: 11 },
  { code: "FR", name: "França", flag: "🇫🇷", dial: "33", minLen: 9, maxLen: 9 },
  { code: "IT", name: "Itália", flag: "🇮🇹", dial: "39", minLen: 9, maxLen: 11 },
  { code: "DE", name: "Alemanha", flag: "🇩🇪", dial: "49", minLen: 10, maxLen: 11 },
];

const DEFAULT_COUNTRY = COUNTRIES[0];

/* ─── Bandeira SVG (desenho, não emoji) ───────────────────────────── */
const FlagIcon = ({ code, className = "" }: { code: string; className?: string }) => {
  const iso = code.toLowerCase();
  return (
    <img
      src={`https://flagcdn.com/w80/${iso}.png`}
      srcSet={`https://flagcdn.com/w160/${iso}.png 2x`}
      alt=""
      aria-hidden
      loading="lazy"
      className={`inline-block object-cover rounded-[3px] shadow-[0_0_0_1px_rgba(0,0,0,0.08)] ${className}`}
    />
  );
};

const localDigitsFor = (c: Country, v: string) => {
  if (c.code === "BR") return stripBrCountryCode(v);
  return onlyDigits(v).slice(0, c.maxLen);
};

const maskPhoneFor = (c: Country, v: string) => {
  const d = localDigitsFor(c, v);
  return c.mask ? c.mask(d) : d;
};

const isValidPhoneFor = (c: Country, v: string) => {
  const d = localDigitsFor(c, v);
  return d.length >= c.minLen && d.length <= c.maxLen;
};

/* ─── Floating label input (estilo iFood) ─────────────────────────── */
type FloatingInputProps = {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  enterKeyHint?: React.InputHTMLAttributes<HTMLInputElement>["enterKeyHint"];
  autoCapitalize?: string;
  autoCorrect?: string;
  spellCheck?: boolean;
  rightSlot?: React.ReactNode;
  inputRef?: React.Ref<HTMLInputElement>;
  maxLength?: number;
};

const FloatingInput = ({
  id,
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  autoComplete,
  enterKeyHint,
  autoCapitalize,
  autoCorrect,
  spellCheck,
  rightSlot,
  inputRef,
  maxLength,
}: FloatingInputProps) => {
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
        ref={inputRef}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        enterKeyHint={enterKeyHint}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        spellCheck={spellCheck}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={handleFocus}
        onBlur={() => setFocused(false)}
        data-no-auto-scroll="true"
        className={`peer h-full w-full rounded-2xl bg-transparent px-4 pt-[24px] pb-[7px] ${
          rightSlot ? "pr-12" : ""
        } text-[15.5px] text-foreground caret-primary outline-none leading-normal font-normal`}
        style={{ fontSize: 16, WebkitAppearance: "none" }}
      />

      {rightSlot && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center">
          {rightSlot}
        </div>
      )}
    </div>
  );
};

/* ─── Seletor de país (bandeira + DDI + seta) ─────────────────────── */
import { ChevronDown, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const CountryPicker = ({
  value,
  onChange,
}: {
  value: Country;
  onChange: (c: Country) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = COUNTRIES.filter(
    (c) =>
      c.name.toLowerCase().includes(q.toLowerCase()) ||
      c.dial.includes(q.replace(/\D/g, "")),
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`País: ${value.name} +${value.dial}`}
          className="flex h-[58px] shrink-0 items-center gap-1.5 rounded-2xl border-2 border-transparent bg-foreground/[0.05] px-3.5 outline-none transition-colors focus-visible:border-primary"
        >
          <FlagIcon code={value.code} className="w-7 h-5" />
          <span className="text-[15px] font-medium text-foreground">+{value.dial}</span>
          <ChevronDown className="h-4 w-4 text-foreground/60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[280px] p-0 overflow-hidden"
      >
        <div className="p-2 border-b border-border">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar país ou DDI"
            className="h-9 w-full rounded-md bg-foreground/[0.06] px-3 text-sm outline-none"
            autoFocus
          />
        </div>
        <div className="max-h-[280px] overflow-y-auto py-1">
          {filtered.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => {
                onChange(c);
                setOpen(false);
                setQ("");
              }}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-foreground/[0.06]"
            >
              <FlagIcon code={c.code} className="w-6 h-[18px]" />
              <span className="flex-1 truncate">{c.name}</span>
              <span className="text-foreground/60">+{c.dial}</span>
              {c.code === value.code && <Check className="h-4 w-4 text-primary" />}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-foreground/60">
              Nenhum país encontrado
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};



/* ─── Tipos de step do cadastro ───────────────────────────────────── */
type SignupStep = "name" | "email" | "cpf" | "phone" | "password" | "otp";
const SIGNUP_ORDER: SignupStep[] = ["name", "email", "cpf", "phone", "password", "otp"];

/**
 * Auth — Login e cadastro multi-etapa com verificação por WhatsApp.
 */
const Auth = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const initialSignup = (searchParams.get("mode") || "login") === "signup";

  useStatusBarColor("app-background");

  // Modo global
  const [mode, setMode] = useState<"login" | "signup">(initialSignup ? "signup" : "login");

  // Monitora o visualViewport: o container e o botão acompanham o teclado perfeitamente em Android, iOS e Safari
  const initialHeightRef = useRef<number>(typeof window !== "undefined" ? window.innerHeight : 800);
  const [viewportHeight, setViewportHeight] = useState<number>(() =>
    typeof window !== "undefined" ? window.innerHeight : 800
  );
  const [vvOffset, setVvOffset] = useState<number>(0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Bloqueia qualquer rolagem indesejada do documento na tela de login
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

      // Garante que o documento nunca seja deslocado para cima ou fora de visão
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

  // Login state
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Signup state
  const [step, setStep] = useState<SignupStep>("name");
  const [sName, setSName] = useState("");
  const [sEmail, setSEmail] = useState("");
  const [sCpf, setSCpf] = useState("");
  const [sPhone, setSPhone] = useState("");
  const [sCountry, setSCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [sPassword, setSPassword] = useState("");
  const [sShowPassword, setSShowPassword] = useState(false);
  const [sCode, setSCode] = useState("");
  const [sUserId, setSUserId] = useState<string | null>(null);
  const [sResendCooldown, setSResendCooldown] = useState(0);
  const [sCpfError, setSCpfError] = useState<string | null>(null);

  const emailValid = emailSchema.safeParse(email).success;
  const passwordValid = passwordSchema.safeParse(senha).success;
  const canSubmit = emailValid && passwordValid;

  /* ─── Session bootstrap ─────────────────────────────────────────── */
  useEffect(() => {
    const verified = searchParams.get("verified");
    if (verified === "true" || verified === "whatsapp") {
      toast.success("Conta confirmada! Faça login para continuar.", { duration: 5000 });
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email_confirmed_at) {
        navigate("/", { replace: true });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Cooldowns ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (sResendCooldown <= 0) return;
    const t = setTimeout(() => setSResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [sResendCooldown]);

  // Auto-submit OTP quando 6 dígitos forem preenchidos
  const autoOtpTriedRef = useRef<string>("");
  useEffect(() => {
    if (mode !== "signup" || step !== "otp") return;
    if (sCode.length !== 6 || isLoading) return;
    if (autoOtpTriedRef.current === sCode) return;
    autoOtpTriedRef.current = sCode;
    handleSignupNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sCode, step, mode, isLoading]);

  /* ─── Login submit ──────────────────────────────────────────────── */
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || isLoading || cooldown > 0) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: senha,
      });
      if (error) {
        if (error.message.includes("Invalid login")) toast.error("E-mail ou senha incorretos");
        else if (error.message.includes("Email not confirmed"))
          toast.error("Confirme seu cadastro pelo WhatsApp antes de entrar");
        else toast.error("Erro ao fazer login");
        return;
      }
      if (data.user && !data.user.email_confirmed_at) {
        toast.error("Confirme seu cadastro pelo WhatsApp antes de entrar");
        return;
      }
      navigate("/", { replace: true });
    } finally {
      setIsLoading(false);
    }
  };

  /* ─── Signup helpers ────────────────────────────────────────────── */
  const stepValidity: Record<SignupStep, boolean> = {
    name: nameSchema.safeParse(sName).success,
    email: emailSchema.safeParse(sEmail).success,
    cpf: isValidCpf(sCpf),
    phone: isValidPhoneFor(sCountry, sPhone),
    password: passwordSchema.safeParse(sPassword).success,
    otp: /^\d{6}$/.test(sCode),
  };

  const goToStep = (next: SignupStep) => {
    setStep(next);
  };

  const stepBack = () => {
    const idx = SIGNUP_ORDER.indexOf(step);
    if (idx <= 0) {
      // Voltar do primeiro step -> volta para login
      setMode("login");
      return;
    }
    // Permite voltar do OTP para corrigir dados
    if (step === "otp") {
      setSCode("");
    }
    goToStep(SIGNUP_ORDER[idx - 1]);
  };

  const requestWhatsAppCode = async (userId: string) => {
    const normalizedPhone = `${sCountry.dial}${localDigitsFor(sCountry, sPhone)}`;
    const { data, error } = await supabase.functions.invoke("whatsapp-verification", {
      body: {
        action: "generate",
        user_id: userId,
        phone: normalizedPhone,
        user_name: sName.trim(),
        user_email: sEmail.trim().toLowerCase(),
        user_cpf: onlyDigits(sCpf),
      },
    });
    if (error || !data?.success) {
      throw new Error(data?.error || error?.message || "Falha ao enviar código");
    }
  };

  const handleSignupNext = async () => {
    if (!stepValidity[step] || isLoading) return;

    // Validação extra no step de CPF: bloquear se já existir barbeiro com esse CPF
    if (step === "cpf") {
      setIsLoading(true);
      try {
        const { data, error } = await (supabase.rpc as any)("check_cpf_available_for_barber", {
          p_cpf: onlyDigits(sCpf),
        });
        if (error) {
          toast.error("Não foi possível validar o CPF. Tente novamente.");
          return;
        }
        const result = data as { available: boolean; reason: string } | null;
        if (!result?.available) {
          setSCpfError("Esse CPF já está em uso.");
          return;
        }
      } finally {
        setIsLoading(false);
      }
    }

    // Steps intermediários apenas avançam
    if (step !== "password" && step !== "otp") {
      const idx = SIGNUP_ORDER.indexOf(step);
      goToStep(SIGNUP_ORDER[idx + 1]);
      return;
    }

    // Step "password": cria usuário + envia OTP
    if (step === "password") {
      setIsLoading(true);
      try {
        const productionUrl = window.location.origin.includes("localhost")
          ? "https://dubadmin.lovable.app"
          : window.location.origin;
        const { data, error } = await supabase.auth.signUp({
          email: sEmail.trim().toLowerCase(),
          password: sPassword,
          options: {
            data: {
              nome: sName.trim(),
              cpf: onlyDigits(sCpf),
              telefone: `${sCountry.dial}${localDigitsFor(sCountry, sPhone)}`,
              is_tenant_signup: true,
            },
            emailRedirectTo: `${productionUrl}/auth/callback`,
          },
        });
        if (error) {
          if (error.message.toLowerCase().includes("already registered")) {
            toast.error("Este e-mail já está cadastrado. Faça login.");
            setMode("login");
            setEmail(sEmail.trim().toLowerCase());
            return;
          }
          if (error.message.includes("only request this after")) {
            const seconds = parseInt(error.message.match(/\d+/)?.[0] || "10");
            setCooldown(seconds);
            toast.error(`Aguarde ${seconds}s antes de tentar novamente.`);
            return;
          }
          toast.error("Erro ao criar conta. Tente novamente.");
          return;
        }
        const userId = data.user?.id;
        if (!userId) {
          toast.error("Não foi possível iniciar o cadastro.");
          return;
        }
        setSUserId(userId);
        try {
          await requestWhatsAppCode(userId);
          setSResendCooldown(60);
          toast.success("Código enviado para seu WhatsApp");
          goToStep("otp");
        } catch (err: any) {
          toast.error(err.message || "Erro ao enviar código via WhatsApp");
        }
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Step "otp": verifica código e faz login
    if (step === "otp" && sUserId) {
      setIsLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("whatsapp-verification", {
          body: { action: "verify", user_id: sUserId, code: sCode },
        });
        if (error || !data?.success) {
          toast.error(data?.error || "Código incorreto");
          return;
        }
        // O cadastro iniciado por "Criar conta" é sempre dono de uma nova barbearia.
        // Garante o papel correto antes do login/redirect, mesmo para usuários criados
        // antes da correção do trigger do banco.
        await supabase.rpc("assign_tenant_admin_role", { p_user_id: sUserId });

        // Login automático
        const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
          email: sEmail.trim().toLowerCase(),
          password: sPassword,
        });
        if (loginError) {
          toast.success("Conta confirmada! Faça login para continuar.");
          setMode("login");
          setEmail(sEmail.trim().toLowerCase());
          return;
        }

        await queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.shared.permissoes(loginData.user?.id ?? sUserId),
        });

        toast.success("Bem-vindo!");
        // Signup flow → sempre vai para o onboarding da barbearia (tenant admin),
        // nunca para o app do cliente.
        navigate("/onboarding", { replace: true });
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleResendCode = async () => {
    if (!sUserId || sResendCooldown > 0 || isLoading) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-verification", {
        body: { action: "resend", user_id: sUserId },
      });
      if (error || !data?.success) {
        if (data?.cooldown_remaining) setSResendCooldown(data.cooldown_remaining);
        toast.error(data?.error || "Não foi possível reenviar o código");
        return;
      }
      setSResendCooldown(60);
      toast.success("Novo código enviado");
    } finally {
      setIsLoading(false);
    }
  };

  /* ─── Conteúdo por step (signup) ────────────────────────────────── */
  const signupContent = useMemo(() => {
    switch (step) {
      case "name":
        return {
          heading: "Como podemos te chamar?",
          hint: "Digite seu nome completo",
          input: (
            <FloatingInput
              id="s-name"
              label="Nome completo"
              value={sName}
              onChange={setSName}
              autoComplete="name"
              autoCapitalize="words"
              enterKeyHint="next"
            />
          ),
        };
      case "email":
        return {
          heading: "Qual seu e-mail?",
          hint: "Usaremos para entrar no aplicativo",
          input: (
            <FloatingInput
              id="s-email"
              label="E-mail"
              value={sEmail}
              onChange={setSEmail}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
            />
          ),
        };
      case "cpf":
        return {
          heading: "Informe seu CPF",
          hint: "Necessário para identificação",
          input: (
            <FloatingInput
              id="s-cpf"
              label="CPF"
              value={sCpf}
              onChange={(v) => { setSCpf(maskCpf(v)); if (sCpfError) setSCpfError(null); }}
              inputMode="numeric"
              enterKeyHint="next"
              maxLength={14}
            />
          ),
        };
      case "phone":
        return {
          heading: "Qual seu WhatsApp?",
          hint: "Enviaremos um código para confirmar",
          input: (
            <div className="flex items-stretch gap-2">
              <CountryPicker
                value={sCountry}
                onChange={(c) => {
                  setSCountry(c);
                  // Ao trocar de país, reaplica a máscara do novo país
                  setSPhone(maskPhoneFor(c, sPhone));
                }}
              />
              <div className="flex-1 min-w-0">
                <FloatingInput
                  id="s-phone"
                  label="Celular (WhatsApp)"
                  value={sPhone}
                  onChange={(v) => setSPhone(maskPhoneFor(sCountry, v))}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  enterKeyHint="next"
                  maxLength={20}
                />
              </div>
            </div>
          ),
        };
      case "password":
        return {
          heading: "Crie sua senha",
          hint: "Mínimo de 6 caracteres",
          input: (
            <FloatingInput
              id="s-password"
              label="Senha"
              value={sPassword}
              onChange={setSPassword}
              type={sShowPassword ? "text" : "password"}
              autoComplete="new-password"
              enterKeyHint="done"
              rightSlot={
                <button
                  type="button"
                  onClick={() => setSShowPassword((v) => !v)}
                  aria-label={sShowPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-foreground/70 active:scale-95"
                  style={{ touchAction: "manipulation" }}
                >
                  {sShowPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              }
            />
          ),
        };
      case "otp":
        return {
          heading: "Digite o código",
          hint: `Enviamos um código para o WhatsApp ${sPhone}`,
          input: (
            <div className="flex justify-center pt-2">
              <InputOTP
                maxLength={6}
                value={sCode}
                onChange={(v) => setSCode(onlyDigits(v).slice(0, 6))}
                autoFocus
              >
                <InputOTPGroup className="gap-2">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot
                      key={i}
                      index={i}
                      className="h-14 w-12 rounded-xl border-2 border-foreground/15 bg-foreground/[0.06] text-foreground text-xl font-bold first:rounded-l-xl last:rounded-r-xl"
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
          ),
        };
    }
  }, [step, sName, sEmail, sCpf, sPhone, sPassword, sShowPassword, sCode]);

  /* ─── CTA label ─────────────────────────────────────────────────── */
  const ctaLabel =
    mode === "login"
      ? cooldown > 0
        ? `Aguarde ${cooldown}s`
        : "Continuar"
      : step === "otp"
      ? "Confirmar"
      : step === "password"
      ? "Continuar"
      : "Continuar";

  const title = mode === "login" ? "Entrar" : "Criar conta";

  const canGoCta =
    mode === "login" ? canSubmit && cooldown === 0 : stepValidity[step];

  const onCtaClick = (e: React.MouseEvent | React.FormEvent) => {
    e.preventDefault();
    if (mode === "login") handleLoginSubmit(e as React.FormEvent);
    else handleSignupNext();
  };

  const onBackClick = () => {
    if (mode === "signup") {
      stepBack();
      return;
    }
    navigate("/");
  };

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
      {/* ─── Header: SEMPRE FIXO no topo, NUNCA rola para fora nem desaparece ─── */}
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
          onClick={onBackClick}
          aria-label="Voltar"
          className="absolute left-3 flex h-9 w-9 items-center justify-center rounded-full text-foreground/80 hover:bg-foreground/5 active:scale-95 transition-all"
          style={{ touchAction: "manipulation" }}
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
        </button>
        <h2 className="text-[14.5px] sm:text-[15px] font-semibold text-foreground/90">{title}</h2>
      </header>

      {/* Progress bar (signup) */}
      {mode === "signup" && (
        <div className="px-6 pb-1 max-w-md mx-auto w-full shrink-0">
          <div className="h-[3px] w-full rounded-full bg-foreground/10 overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{
                width: `${((SIGNUP_ORDER.indexOf(step) + 1) / SIGNUP_ORDER.length) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* ─── Main content: espaçoso e com cabeçalho protegido ─── */}
      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col justify-start">
        <div className="px-6 w-full max-w-md mx-auto flex-1 flex flex-col justify-start">
          <AnimatePresence mode="wait">
            <motion.div
              key={mode === "login" ? "login" : `signup-${step}`}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="w-full"
            >
              {mode === "login" ? (
                <>
                  {/* Título e subtítulo — adaptam-se suavemente para garantir conforto total */}
                  <div className={`transition-all duration-200 ${isKeyboardOpen ? "pt-1 pb-1" : "pt-4 pb-2"}`}>
                    <h1
                      className={`font-extrabold tracking-tight text-foreground leading-tight transition-all duration-200 ${
                        isKeyboardOpen ? "text-[21px] sm:text-[23px]" : "text-[25px] sm:text-[27px]"
                      }`}
                    >
                      Entrar na sua conta
                    </h1>
                    <p
                      className={`text-foreground/60 transition-all duration-200 ${
                        isKeyboardOpen ? "text-[12.5px] mt-0.5" : "text-[13.5px] mt-1"
                      }`}
                    >
                      Informe suas credenciais para acessar o aplicativo
                    </p>
                  </div>

                  <form
                    id="auth-login-form"
                    onSubmit={handleLoginSubmit}
                    className={`transition-all duration-200 ${isKeyboardOpen ? "space-y-2.5 mt-3" : "space-y-3 mt-5"}`}
                    noValidate
                  >
                    <FloatingInput
                      id="email-input"
                      label="E-mail"
                      value={email}
                      onChange={setEmail}
                      type="email"
                      inputMode="email"
                      autoComplete="username"
                      enterKeyHint="next"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                    <FloatingInput
                      id="senha-input"
                      label="Senha"
                      value={senha}
                      onChange={setSenha}
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      enterKeyHint="done"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      rightSlot={
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                          className="flex h-10 w-10 items-center justify-center rounded-full text-foreground/60 hover:text-foreground active:scale-95 transition-all"
                          style={{ touchAction: "manipulation" }}
                        >
                          {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                      }
                    />
                    <div className="pt-0.5">
                      <button
                        type="button"
                        onClick={() => navigate("/esqueci-senha")}
                        className="text-[13px] font-semibold text-primary hover:underline underline-offset-4 active:opacity-70 transition-opacity"
                        style={{ touchAction: "manipulation" }}
                      >
                        Esqueci minha senha
                      </button>
                    </div>
                    <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
                      Continuar
                    </button>
                  </form>
                </>
              ) : (
                <>
                  {/* Signup título e subtítulo */}
                  <div className={`transition-all duration-200 ${isKeyboardOpen ? "pt-1 pb-1" : "pt-4 pb-2"}`}>
                    <h1
                      className={`font-extrabold tracking-tight text-foreground leading-tight transition-all duration-200 ${
                        isKeyboardOpen ? "text-[21px] sm:text-[23px]" : "text-[24px] sm:text-[26px]"
                      }`}
                    >
                      {signupContent!.heading}
                    </h1>
                    <p
                      className={`text-foreground/60 transition-all duration-200 ${
                        isKeyboardOpen ? "text-[12.5px] mt-0.5" : "text-[13.5px] mt-1"
                      }`}
                    >
                      {signupContent!.hint}
                    </p>
                  </div>

                  <form
                    id="auth-signup-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSignupNext();
                    }}
                    className={`transition-all duration-200 ${isKeyboardOpen ? "space-y-2.5 mt-3" : "space-y-3 mt-5"}`}
                    noValidate
                  >
                    {signupContent!.input}
                    <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
                      Continuar
                    </button>
                  </form>

                  {step === "cpf" && sCpfError && (
                    <p className="mt-2 text-[13px] font-medium text-destructive">{sCpfError}</p>
                  )}

                  {step === "otp" && (
                    <div className="pt-3">
                      <button
                        type="button"
                        onClick={handleResendCode}
                        disabled={sResendCooldown > 0 || isLoading}
                        className="text-[13px] font-semibold text-primary underline underline-offset-4 active:opacity-70 disabled:opacity-40 disabled:no-underline"
                        style={{ touchAction: "manipulation" }}
                      >
                        {sResendCooldown > 0
                          ? `Reenviar em ${sResendCooldown}s`
                          : "Reenviar código"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* ─── Footer / CTA — sempre fixo na base, sobe suavemente com o teclado ──── */}
      <footer
        className="w-full max-w-md mx-auto px-6 shrink-0 bg-background z-20"
        style={{
          paddingTop: isKeyboardOpen ? 6 : 10,
          paddingBottom: isKeyboardOpen
            ? "12px"
            : "calc(var(--app-safe-bottom, env(safe-area-inset-bottom, 0px)) + 16px)",
        }}
      >
        <button
          type="button"
          onClick={onCtaClick}
          disabled={!canGoCta || isLoading}
          className="w-full h-[52px] sm:h-[54px] rounded-full bg-[#18181b] hover:bg-black text-white dark:bg-white dark:text-[#09090b] dark:hover:bg-zinc-100 font-semibold text-[15.5px] sm:text-[16px] tracking-normal shadow-[0_8px_24px_rgba(0,0,0,0.14)] dark:shadow-[0_8px_24px_rgba(255,255,255,0.08)] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
          style={{ touchAction: "manipulation" }}
        >
          {isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
          {ctaLabel}
        </button>

        {step !== "otp" && !isKeyboardOpen && (
          <p className="mt-3 text-center text-[13.5px] text-foreground/60">
            {mode === "signup" ? "Já tem uma conta?" : "Não tem uma conta?"}{" "}
            <button
              type="button"
              onClick={() => {
                if (mode === "login") {
                  setMode("signup");
                  setStep("name");
                } else {
                  setMode("login");
                }
              }}
              className="font-semibold text-primary hover:underline active:opacity-70 transition-opacity"
              style={{ touchAction: "manipulation" }}
            >
              {mode === "signup" ? "Entrar" : "Criar conta"}
            </button>
          </p>
        )}
      </footer>
    </div>
  );
};

export default Auth;
