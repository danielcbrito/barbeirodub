import { useCallback, useEffect, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Eye,
  EyeOff,
  Wallet as WalletIcon,
  ArrowDownToLine,
  ArrowRight,
  X,
  Calendar,
  ShieldCheck,
  Lock,
  AlertCircle,

  Key,

  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

/* ─── Types ───────────────────────────────────────────────── */

interface WooviWalletSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  barbeiroId: string;
  barbeiroNome: string;
}

interface BarberRow {
  woovi_pix_key: string | null;
  woovi_subaccount_name: string | null;
  woovi_pix_key_type: string | null;
  woovi_auto_withdraw_enabled: boolean | null;
}

interface WooviTransaction {
  id: string;
  type: "deposit" | "withdraw";
  value_centavos: number;
  status: string;
  created_at: string;
  description?: string;
  blocked?: boolean;
}

type PinMode = "create" | "validate";

type PixKeyType = "cpf" | "cnpj" | "email" | "phone" | "random";
type ViewTab = "saldo" | "movimento" | "subconta";

const PIX_KEY_LABELS: Record<PixKeyType, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  email: "E-mail",
  phone: "Telefone",
  random: "Aleatória",
};

const TABS: { id: ViewTab; label: string }[] = [
  { id: "saldo", label: "Saldo" },
  { id: "movimento", label: "Em espera" },
  { id: "subconta", label: "Conta" },
];

const fmtBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const onlyDigits = (s: string) => s.replace(/\D+/g, "");

const normalizePixKey = (key: string, type: PixKeyType) => {
  const raw = key.trim();
  if (type === "cpf" || type === "cnpj") return onlyDigits(raw);
  if (type === "phone") {
    const digits = onlyDigits(raw);
    if (!digits) return "";
    return digits.startsWith("55") ? `+${digits}` : `+55${digits}`;
  }
  return raw;
};

const validatePixKey = (key: string, type: PixKeyType) => {
  if (!key) return "Informe a chave Pix";
  if (type === "cpf" && key.length !== 11) return "CPF deve ter 11 números";
  if (type === "cnpj" && key.length !== 14) return "CNPJ deve ter 14 números";
  if (type === "phone" && !/^\+55\d{10,11}$/.test(key)) {
    return "Telefone deve ter DDD e 10 ou 11 números";
  }
  if (type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) {
    return "E-mail inválido";
  }
  return null;
};

const emptyPin = ["", "", "", ""];

const PAID_WOOVI_STATUSES = ["PAID", "paid", "COMPLETED", "ACTIVE_PAID"];
const REFUNDED_WOOVI_STATUSES = ["REFUNDED", "refunded"];
const VISIBLE_WOOVI_STATUSES = [...PAID_WOOVI_STATUSES, ...REFUNDED_WOOVI_STATUSES];

interface LocalWooviCharge {
  id: string;
  value_centavos: number | null;
  status: string | null;
  created_at: string | null;
  paid_at: string | null;
  released_at: string | null;
  refunded_at: string | null;
  agendamentos?: { status: string | null } | null;
}

const mapWooviChargeToTransaction = (charge: LocalWooviCharge): WooviTransaction | null => {
  const status = charge.status ?? "";
  const isRefunded = REFUNDED_WOOVI_STATUSES.includes(status);
  const isPaid = PAID_WOOVI_STATUSES.includes(status);

  if (!isPaid && !isRefunded) return null;

  const blocked = isPaid && !charge.released_at;
  return {
    id: `c-${charge.id}`,
    type: isRefunded ? "withdraw" : "deposit",
    value_centavos: Number(charge.value_centavos ?? 0),
    status: isRefunded ? "Estornado" : blocked ? "Aguardando finalização do corte" : "Disponível",
    created_at: charge.refunded_at ?? charge.paid_at ?? charge.created_at ?? new Date().toISOString(),
    description: isRefunded
      ? "Cancelamento — estornado ao cliente"
      : blocked
        ? "Pix recebido · aguardando confirmação"
        : "Pagamento recebido (Pix)",
    blocked,
  };
};

type StoreApiAction = "woovi_get_balance" | "woovi_history" | "woovi_withdraw";
type StoreApiPayload = { action: StoreApiAction; [key: string]: unknown };
type StoreApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
};

/**
 * Chamada resiliente da Store API: respostas 4xx da Edge Function não podem
 * quebrar a tela. O payload padronizado `{ success, data, error }` sempre volta
 * para a UI decidir o estado correto (ex.: PIN expirado antes do saque).
 */
async function invokeStoreApi<T>(payload: StoreApiPayload): Promise<StoreApiResponse<T>> {
  const { data, error } = await supabase.functions.invoke("store-api", { body: payload });

  if (error instanceof FunctionsHttpError) {
    try {
      return (await error.context.json()) as StoreApiResponse<T>;
    } catch {
      return {
        success: false,
        error: { code: "EDGE_HTTP_ERROR", message: error.message || "Erro na carteira" },
      };
    }
  }

  if (error) {
    return {
      success: false,
      error: { code: "EDGE_INVOKE_ERROR", message: error.message || "Erro na carteira" },
    };
  }

  return data as StoreApiResponse<T>;
}

/* ─── Paleta — tokens do design system do app ─────────────── */

const COLORS = {
  yellow: "hsl(var(--gold))",
  red: "hsl(var(--primary))",
  redDark: "hsl(var(--primary))",
  card: "hsl(var(--card))",
  ink: "hsl(var(--foreground))",
  inkSoft: "hsl(var(--muted-foreground))",
  indigo: "hsl(var(--primary))",
  green: "hsl(var(--success))",
  greenSoft: "hsl(var(--success) / 0.12)",
  divider: "hsl(var(--border))",
  surface: "hsl(var(--muted) / 0.4)",
  amber: "hsl(var(--gold))",
  amberSoft: "hsl(var(--gold) / 0.12)",
  dangerSoft: "hsl(var(--primary) / 0.12)",
  page: "hsl(var(--background))",
};

const WALLET_CARD_RADIUS = 16;
const WALLET_TOP_SAFE_OFFSET = "max(28px, calc(env(safe-area-inset-top, 0px) + 12px))";


/**
 * Carteira Woovi — tela cheia inspirada no Will Bank.
 * Abas: Saldo / Movimento / Subconta. A aba ativa "encaixa"
 * no card branco através de uma língua branca conectora.
 * Header amarelo com blob vermelho circular ao fundo.
 */
export function WooviWalletSheet({
  open,
  onOpenChange,
  barbeiroId,
  barbeiroNome,
}: WooviWalletSheetProps) {
  const [loading, setLoading] = useState(true);
  const [barber, setBarber] = useState<BarberRow | null>(null);
  const [balanceCentavos, setBalanceCentavos] = useState<number>(0);
  const [blockedCentavos, setBlockedCentavos] = useState<number>(0);
  const availableCentavos = Math.max(0, balanceCentavos - blockedCentavos);
  const [showBalance, setShowBalance] = useState(true);
  const [activeTab, setActiveTab] = useState<ViewTab>("saldo");

  const [creating, setCreating] = useState(false);
  const [formName, setFormName] = useState(barbeiroNome ?? "");
  const [formKeyType, setFormKeyType] = useState<PixKeyType>("cpf");
  const [formKey, setFormKey] = useState("");

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawValue, setWithdrawValue] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinMode, setPinMode] = useState<PinMode>("validate");
  const [hasPin, setHasPin] = useState<boolean>(false);
  const [pinDigits, setPinDigits] = useState<string[]>(emptyPin);
  const [pinConfirmDigits, setPinConfirmDigits] = useState<string[]>(emptyPin);
  const [pinError, setPinError] = useState<string | null>(null);
  const [savingPinSession, setSavingPinSession] = useState(false);

  // Alteração de PIN financeiro (atual + novo + confirmação)
  const [changePinOpen, setChangePinOpen] = useState(false);
  const [changeCurrentDigits, setChangeCurrentDigits] = useState<string[]>(emptyPin);
  const [changeNewDigits, setChangeNewDigits] = useState<string[]>(emptyPin);
  const [changeConfirmDigits, setChangeConfirmDigits] = useState<string[]>(emptyPin);
  const [changePinError, setChangePinError] = useState<string | null>(null);
  const [savingChangePin, setSavingChangePin] = useState(false);

  const resetChangePinForm = () => {
    setChangeCurrentDigits([...emptyPin]);
    setChangeNewDigits([...emptyPin]);
    setChangeConfirmDigits([...emptyPin]);
    setChangePinError(null);
  };

  const openChangePin = async () => {
    try {
      await loadPinStatus();
    } catch (err) {
      console.error("[woovi] pin status:", err);
    }
    resetChangePinForm();
    setChangePinOpen(true);
  };

  const submitChangePin = async () => {
    if (savingChangePin) return;
    const current = changeCurrentDigits.join("");
    const next = changeNewDigits.join("");
    const confirm = changeConfirmDigits.join("");

    if (!hasPin) {
      setChangePinError("Nenhum PIN cadastrado. Faça um saque para criar.");
      return;
    }
    if (current.length !== 4 || next.length !== 4 || confirm.length !== 4) {
      setChangePinError("Preencha todos os campos com 4 dígitos");
      return;
    }
    if (next !== confirm) {
      setChangePinError("O novo PIN e a confirmação não conferem");
      return;
    }
    if (next === current) {
      setChangePinError("O novo PIN deve ser diferente do atual");
      return;
    }

    setSavingChangePin(true);
    try {
      // Validação e escrita 100% no servidor.
      const { error } = await supabase.rpc("set_financial_pin", {
        p_new_pin: next,
        p_current_pin: current,
      });
      if (error) {
        const msg = (error.message || "").toLowerCase();
        if (msg.includes("current_pin_invalid")) {
          setChangePinError("PIN atual incorreto");
          setChangeCurrentDigits([...emptyPin]);
        } else if (msg.includes("invalid_pin_format")) {
          setChangePinError("PIN deve ter 4 dígitos");
        } else {
          setChangePinError("Erro ao alterar PIN");
        }
        return;
      }
      setHasPin(true);
      toast.success("PIN financeiro alterado com sucesso");
      resetChangePinForm();
      setChangePinOpen(false);
    } catch (err) {
      setChangePinError((err as Error).message || "Erro ao alterar PIN");
    } finally {
      setSavingChangePin(false);
    }
  };

  const [savingSettings, setSavingSettings] = useState(false);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoConfigOpen, setAutoConfigOpen] = useState(false);
  const [autoDay, setAutoDay] = useState<string>("wednesday");
  const [pixKeyOpen, setPixKeyOpen] = useState(false);
  const [pixKeyDraft, setPixKeyDraft] = useState("");
  const [pixKeyTypeDraft, setPixKeyTypeDraft] = useState<PixKeyType>("cpf");
  const [savingPixKey, setSavingPixKey] = useState(false);

  const [historyLoading, setHistoryLoading] = useState(false);
  const [transactions, setTransactions] = useState<WooviTransaction[]>([]);
  const [extratoOpen, setExtratoOpen] = useState(false);
  const [extratoFilter, setExtratoFilter] = useState<"all" | "deposit" | "withdraw">("all");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const initials = (barbeiroNome ?? "")
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const hasSubaccount = Boolean(barber?.woovi_pix_key);
  const firstName = (barbeiroNome ?? "").split(" ")[0] || "Barbeiro";

  const loadBarber = useCallback(async () => {
    const { data } = await supabase
      .from("barbeiros")
      .select(
        "woovi_pix_key, woovi_subaccount_name, woovi_pix_key_type, woovi_auto_withdraw_enabled",
      )
      .eq("id", barbeiroId)
      .maybeSingle<BarberRow>();
    setBarber(data);
    setAutoEnabled(Boolean(data?.woovi_auto_withdraw_enabled));
    return data;
  }, [barbeiroId]);

  const loadPinStatus = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) {
      setHasPin(false);
      return false;
    }

    // Server-side: retorna apenas boolean; nunca expõe hash ao browser.
    const { data, error } = await supabase.rpc("has_financial_pin");
    if (error) throw error;
    const exists = !!data;
    setHasPin(exists);
    return exists;
  }, []);

  const loadLocalWalletData = useCallback(async ({ syncBalance = false }: { syncBalance?: boolean } = {}) => {
    const [{ data: charges, error: chargesError }, { data: saques }] = await Promise.all([
      supabase
        .from("woovi_charges")
        .select("id, value_centavos, status, created_at, paid_at, released_at, refunded_at, agendamentos(status)")
        .eq("barbeiro_id", barbeiroId)
        .in("status", VISIBLE_WOOVI_STATUSES)
        .order("created_at", { ascending: false })
        .limit(80),
      supabase
        .from("saques")
        .select("id, valor, status, created_at")
        .eq("barbeiro_id", barbeiroId)
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

    if (chargesError) throw chargesError;

    const localCharges = (charges ?? []) as LocalWooviCharge[];
    const blocked = localCharges.reduce((sum, charge) => {
      const appointmentStatus = charge.agendamentos?.status ?? "";
      const appointmentCancelled = ["cancelled_by_user", "cancelled_by_admin", "excluido"].includes(appointmentStatus);
      const isBlockedPaid = PAID_WOOVI_STATUSES.includes(charge.status ?? "") && !charge.released_at && !appointmentCancelled;
      return isBlockedPaid ? sum + Number(charge.value_centavos ?? 0) : sum;
    }, 0);
    const released = localCharges.reduce((sum, charge) => {
      const isReleasedPaid = PAID_WOOVI_STATUSES.includes(charge.status ?? "") && Boolean(charge.released_at);
      return isReleasedPaid ? sum + Number(charge.value_centavos ?? 0) : sum;
    }, 0);

    const mappedCharges = localCharges
      .map(mapWooviChargeToTransaction)
      .filter(Boolean) as WooviTransaction[];
    const mappedSaques = (saques ?? []).map((s) => ({
      id: `s-${s.id}`,
      type: "withdraw" as const,
      value_centavos: Math.round(Number(s.valor ?? 0) * 100),
      status: s.status ?? "processando",
      created_at: s.created_at,
      description: "Saque Pix",
    }));

    const localTransactions = [...mappedCharges, ...mappedSaques].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );

    // O saldo exibido nunca deve ser recalculado localmente quando a Woovi respondeu.
    // Este sync só existe como fallback defensivo se a Edge Function de saldo falhar.
    if (syncBalance) {
      // Saques que já saíram (ou estão a caminho) precisam ser descontados,
      // senão o saldo local fica inflado com dinheiro que o barbeiro já recebeu.
      const sacado = (saques ?? []).reduce((sum, s) => {
        const st = String(s.status ?? "").toLowerCase();
        const naoDebita = st === "falhou" || st === "cancelado" || st === "estornado" || st === "recusado";
        return naoDebita ? sum : sum + Math.round(Number(s.valor ?? 0) * 100);
      }, 0);
      setBlockedCentavos(blocked);
      setBalanceCentavos(Math.max(0, released + blocked - sacado));
    }

    return localTransactions;
  }, [barbeiroId]);

  const loadBalance = useCallback(async () => {
    // O AppID externo está inválido. Manter a Woovi fora do carregamento
    // inicial evita que uma falha do provedor derrube a interface.
    try {
      await loadLocalWalletData({ syncBalance: true });
    } catch (fallbackErr) {
      console.error("[woovi] saldo local:", fallbackErr);
      setBalanceCentavos(0);
      setBlockedCentavos(0);
    }
  }, [loadLocalWalletData]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      try {
        const localTransactions = await loadLocalWalletData();
        setTransactions(localTransactions);
      } catch (fallbackErr) {
        console.error("[woovi] histórico local:", fallbackErr);
      }
    } finally {
      setHistoryLoading(false);
    }
  }, [loadLocalWalletData]);

  useEffect(() => {
    if (!open) return;
    setFormName(barbeiroNome ?? "");
    setActiveTab("saldo");
    setAvatarFailed(false);
    (async () => {
      setLoading(true);
      const b = await loadBarber();
      await loadPinStatus().catch((err) => console.error("[woovi] pin:", err));
      if (b?.woovi_pix_key) await loadBalance();
      // Carrega avatar do profile via auth.uid()
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (uid) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("avatar_url")
          .eq("id", uid)
          .maybeSingle();
        setAvatarUrl(prof?.avatar_url ?? null);
      }
      setLoading(false);
    })();
  }, [open, barbeiroId, barbeiroNome, loadBarber, loadBalance, loadPinStatus]);

  const resetPinForm = () => {
    setPinDigits([...emptyPin]);
    setPinConfirmDigits([...emptyPin]);
    setPinError(null);
  };

  const openPinGate = async () => {
    let currentHasPin = hasPin;
    try {
      currentHasPin = await loadPinStatus();
    } catch (err) {
      console.error("[woovi] pin status:", err);
    }
    resetPinForm();
    setPinMode(currentHasPin ? "validate" : "create");
    setPinOpen(true);
  };

  const createFinancialPinSession = async () => {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) throw new Error("Sessão expirada. Faça login novamente.");

    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const tokenHash = btoa(`${userId}:${Date.now()}:${crypto.randomUUID()}`);
    const { error } = await supabase.from("financeiro_auth_sessions").insert({
      user_id: userId,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });
    if (error) throw error;
  };

  const authorizePinAndWithdraw = async () => {
    if (savingPinSession) return;
    setSavingPinSession(true);
    try {
      const pin = pinDigits.join("");
      if (pin.length !== 4) {
        setPinError("Informe os 4 dígitos do PIN");
        return;
      }

      if (pinMode === "create") {
        const confirmPin = pinConfirmDigits.join("");
        if (confirmPin.length !== 4) {
          setPinError("Confirme os 4 dígitos do PIN");
          return;
        }
        if (pin !== confirmPin) {
          setPinError("Os PINs não conferem");
          return;
        }

        // Cria PIN via SECURITY DEFINER — hash bcrypt no servidor.
        const { error } = await supabase.rpc("set_financial_pin", {
          p_new_pin: pin,
          p_current_pin: null,
        });
        if (error) throw error;
        setHasPin(true);
      } else {
        const { data: ok, error } = await supabase.rpc("verify_financial_pin", {
          p_pin: pin,
        });
        if (error || ok !== true) {
          setPinError("PIN incorreto");
          setPinDigits([...emptyPin]);
          return;
        }
      }

      await createFinancialPinSession();
      setPinOpen(false);
      resetPinForm();
      await handleWithdraw(true);
    } catch (err) {
      setPinError((err as Error).message || "Erro ao validar PIN");
    } finally {
      setSavingPinSession(false);
    }
  };

  useEffect(() => {
    if (hasSubaccount && open) loadHistory();
  }, [activeTab, hasSubaccount, open, loadHistory]);

  const handleCreate = async () => {
    if (!formName.trim()) return toast.error("Informe o nome.");
    if (!formKey.trim()) return toast.error("Informe a chave Pix.");

    const pixKey = normalizePixKey(formKey, formKeyType);
    const pixKeyError = validatePixKey(pixKey, formKeyType);
    if (pixKeyError) return toast.error(pixKeyError);

    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("woovi-create-subaccount", {
        body: {
          barbeiro_id: barbeiroId,
          pix_key: pixKey,
          pix_key_type: formKeyType,
          name: formName.trim(),
        },
      });
      if (error) {
        throw new Error(error.message || "Não foi possível conectar ao servidor de carteira");
      }
      if (!data?.success) throw new Error(data?.error?.message || "Falha ao criar subconta");

      toast.success("Conta de pagamento criada!");
      await loadBarber();
      await loadBalance();
    } catch (err) {
      toast.error((err as Error).message || "Erro ao criar conta");
    } finally {
      setCreating(false);
    }
  };

  const handleWithdraw = async (pinAlreadyValidated = false) => {
    const valueReais = parseFloat(withdrawValue.replace(",", "."));
    if (!valueReais || valueReais <= 0) return toast.error("Valor inválido");
    const cents = Math.round(valueReais * 100);
    if (cents > availableCentavos) {
      return toast.error(
        blockedCentavos > 0
          ? `Disponível ${fmtBRL(availableCentavos)} — ${fmtBRL(blockedCentavos)} aguardando finalização do corte`
          : "Saldo insuficiente",
      );
    }

    if (!pinAlreadyValidated) {
      await openPinGate();
      return;
    }

    setWithdrawing(true);
    try {
      const response = await invokeStoreApi<{ woovi?: unknown }>({
        action: "woovi_withdraw",
        value_centavos: cents,
      });

      if (!response.success) {
        if (response.error?.code === "PIN_REQUIRED") {
          toast.error("Valide seu PIN financeiro para sacar.");
          await openPinGate();
          return;
        }
        throw new Error(response.error?.message || "Falha no saque");
      }
      toast.success("Saque solicitado!");
      setWithdrawValue("");
      setWithdrawOpen(false);
      await loadBalance();
      await loadHistory();
      
    } catch (err) {
      toast.error((err as Error).message || "Erro ao sacar");
    } finally {
      setWithdrawing(false);
    }
  };

  const handleSaveSettings = async (next: boolean) => {
    setAutoEnabled(next);
    setSavingSettings(true);
    try {
      const { error } = await supabase
        .from("barbeiros")
        .update({ woovi_auto_withdraw_enabled: next })
        .eq("id", barbeiroId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      toast.success(
        next
          ? "Saque automático ativado (toda quarta-feira)"
          : "Saque automático desativado",
      );
    } catch (err) {
      setAutoEnabled(!next);
      toast.error((err as Error).message || "Erro ao salvar");
    } finally {
      setSavingSettings(false);
    }
  };

  /* ─── render ─── */
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        hideClose
        className="p-0 border-0 rounded-none max-h-[100dvh] h-[100dvh] w-screen overflow-hidden flex flex-col"
        style={{ background: COLORS.page, height: "100dvh", maxHeight: "100dvh" }}
      >
        <SheetTitle className="sr-only">Carteira</SheetTitle>

        {/* HEADER minimalista */}
        <div
          className="relative px-5 pb-4 flex items-center justify-between gap-3 z-10"
          style={{ paddingTop: WALLET_TOP_SAFE_OFFSET }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center shrink-0"
              style={{ background: COLORS.surface, border: `1px solid ${COLORS.divider}` }}
            >
              {avatarUrl && !avatarFailed ? (
                <img
                  src={avatarUrl}
                  alt={barbeiroNome || "Avatar"}
                  className="w-full h-full object-cover"
                  onError={() => setAvatarFailed(true)}
                />
              ) : initials ? (
                <span className="text-[13px] font-semibold" style={{ color: COLORS.ink }}>
                  {initials}
                </span>
              ) : (
                <User className="w-4 h-4" style={{ color: COLORS.inkSoft }} />
              )}
            </div>
            <div className="min-w-0">
              <p
                className="text-[11px] uppercase tracking-[0.14em] leading-none mb-1"
                style={{ color: COLORS.inkSoft }}
              >
                Carteira
              </p>
              <p
                className="text-[15px] font-semibold leading-none truncate tracking-tight"
                style={{ color: COLORS.ink }}
              >
                {firstName}
              </p>
            </div>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-opacity active:opacity-70"
            style={{ background: COLORS.surface, border: `1px solid ${COLORS.divider}` }}
            aria-label="Fechar"
          >
            <X className="w-4 h-4" style={{ color: COLORS.ink }} />
          </button>
        </div>

        {/* CONTAINER central */}
        <div
          className="relative z-10 flex-1 min-h-0 flex flex-col items-center overflow-y-auto overscroll-contain px-5 pb-5"
          style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
        >
          {loading ? (
            <div
              className="w-full max-w-md rounded-2xl min-h-[240px] flex-1 flex items-center justify-center"
              style={{ background: COLORS.card, border: `1px solid ${COLORS.divider}` }}
            >
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: COLORS.inkSoft }} />
            </div>
          ) : !hasSubaccount ? (
            /* Modo criação: card único de ponta a ponta, sem abas */
            <div
              className="w-full max-w-md rounded-2xl min-h-[320px] flex-1 flex flex-col overflow-hidden"
              style={{ background: COLORS.card, border: `1px solid ${COLORS.divider}` }}
            >
              <CreationForm
                formName={formName}
                setFormName={setFormName}
                formKeyType={formKeyType}
                setFormKeyType={setFormKeyType}
                formKey={formKey}
                setFormKey={setFormKey}
                creating={creating}
                onCreate={handleCreate}
              />
            </div>
          ) : (
            <>
              {/* TABS — segmento minimalista */}
              <div
                className="relative z-20 grid w-full max-w-md shrink-0 p-1 rounded-xl mb-1"
                style={{
                  gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))`,
                  background: COLORS.surface,
                  border: `1px solid ${COLORS.divider}`,
                }}
              >
                {TABS.map((t) => {
                  const active = activeTab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setActiveTab(t.id)}
                      className="relative flex h-9 items-center justify-center rounded-lg text-[13px] font-semibold tracking-tight transition-colors duration-150"
                      style={{
                        color: active ? COLORS.ink : COLORS.inkSoft,
                        background: active ? COLORS.card : "transparent",
                        border: active ? `1px solid ${COLORS.divider}` : "1px solid transparent",
                      }}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {/* CARD central */}
              <div
                className="relative z-10 w-full max-w-md shrink-0 overflow-hidden flex flex-col rounded-2xl"
                style={{
                  background: COLORS.card,
                  border: `1px solid ${COLORS.divider}`,
                }}
              >

                <div className="pb-6">

                  {activeTab === "saldo" ? (
                    <SaldoView
                      balanceCentavos={availableCentavos}
                      blockedCentavos={blockedCentavos}
                      showBalance={showBalance}
                      onToggle={() => setShowBalance((v) => !v)}
                      onSacar={() => setWithdrawOpen(true)}
                      onOpenExtrato={() => setExtratoOpen(true)}
                    />
                  ) : activeTab === "movimento" ? (
                    <MovimentoView
                      blockedCentavos={blockedCentavos}
                      showBalance={showBalance}
                      onToggle={() => setShowBalance((v) => !v)}
                    />
                  ) : (
                    <SubcontaView
                      barber={barber}
                      fallbackName={barbeiroNome}
                      hasSubaccount={hasSubaccount}
                    />

                  )}
                </div>
              </div>

              {/* Configurações abaixo do card */}
              {activeTab === "saldo" && (
                <div className="w-full max-w-md shrink-0 mt-4 space-y-2">
                  <ConfigRow
                    icon={<Calendar className="w-4 h-4" style={{ color: COLORS.inkSoft }} />}
                    label="Saque automático"
                    value={autoEnabled ? "Ativo" : "Desativado"}
                    onClick={() => setAutoConfigOpen(true)}
                  />
                  <ConfigRow
                    icon={<Key className="w-4 h-4" style={{ color: COLORS.inkSoft }} />}
                    label="Chave Pix"
                    value={
                      barber?.woovi_pix_key
                        ? barber.woovi_pix_key.length > 8
                          ? `${barber.woovi_pix_key.slice(0, 3)}•••${barber.woovi_pix_key.slice(-3)}`
                          : barber.woovi_pix_key
                        : "Não cadastrada"
                    }
                    onClick={() => {
                      setPixKeyDraft(barber?.woovi_pix_key ?? "");
                      setPixKeyTypeDraft(((barber?.woovi_pix_key_type as PixKeyType) ?? "cpf"));
                      setPixKeyOpen(true);
                    }}
                  />

                  {/* Extrato — prévia */}
                  <ExtratoPreview
                    loading={historyLoading}
                    transactions={transactions}
                    onOpen={() => setExtratoOpen(true)}
                  />
                </div>
              )}

              {/* Extrato dos aguardando — abaixo do card "Em espera" */}
              {activeTab === "movimento" && (
                <div className="w-full max-w-md shrink-0 mt-4">
                  <ExtratoPreview
                    loading={historyLoading}
                    transactions={transactions.filter((t) => t.blocked)}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Sheet de Sacar */}
        {withdrawOpen && (
          <div
            className="absolute inset-0 z-30 flex items-end"
            style={{ background: "rgba(0,0,0,0.45)" }}
            onClick={() => !withdrawing && setWithdrawOpen(false)}
          >
            <div
              className="w-full rounded-t-3xl p-5 space-y-4"
              style={{ background: COLORS.card }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-[17px] font-bold" style={{ color: COLORS.ink }}>
                  Sacar via Pix
                </h3>
                <button
                  onClick={() => setWithdrawOpen(false)}
                  disabled={withdrawing}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: COLORS.surface }}
                >
                  <X className="w-4 h-4" style={{ color: COLORS.ink }} />
                </button>
              </div>
              <div className="rounded-2xl p-3" style={{ background: COLORS.surface }}>
                <p className="text-[11px]" style={{ color: COLORS.inkSoft }}>
                  Saldo disponível
                </p>
                <p className="text-[22px] font-extrabold" style={{ color: COLORS.ink }}>
                  {fmtBRL(availableCentavos)}
                </p>
                {blockedCentavos > 0 && (
                  <p className="text-[11px] mt-1" style={{ color: COLORS.amber }}>
                    {fmtBRL(blockedCentavos)} aguardando finalização do corte
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-[13px]" style={{ color: COLORS.ink }}>
                  Valor
                </Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={withdrawValue}
                  onChange={(e) => setWithdrawValue(e.target.value)}
                  className="h-12 text-lg border-2"
                  style={{ borderColor: COLORS.divider }}
                />
                <button
                  type="button"
                  onClick={() =>
                    setWithdrawValue((availableCentavos / 100).toFixed(2).replace(".", ","))
                  }
                  className="text-[12px] font-semibold"
                  style={{ color: COLORS.indigo }}
                >
                  Sacar tudo
                </button>
              </div>
              <Button
                onClick={() => handleWithdraw()}
                disabled={withdrawing || availableCentavos <= 0}
                className="w-full h-12 text-[14px] font-semibold"
                style={{ background: COLORS.indigo, color: "hsl(var(--primary-foreground))" }}
              >
                {withdrawing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processando...
                  </>
                ) : (
                  <>
                    <ArrowDownToLine className="w-4 h-4 mr-2" /> Confirmar saque
                  </>
                )}
              </Button>
              <p
                className="text-[11px] flex items-center gap-1.5"
                style={{ color: COLORS.inkSoft }}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Requer PIN financeiro validado nos últimos 15 min.
              </p>
            </div>
          </div>
        )}

        {/* Sheet: PIN financeiro para autorizar saque */}
        {pinOpen && (
          <div
            className="absolute inset-0 z-40 flex items-end"
            style={{ background: "rgba(0,0,0,0.48)" }}
            onClick={() => !savingPinSession && setPinOpen(false)}
          >
            <div
              className="w-full rounded-t-3xl p-5 space-y-5"
              style={{ background: COLORS.card }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: COLORS.surface }}
                  >
                    <Lock className="w-4 h-4" style={{ color: COLORS.ink }} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[16px] font-bold" style={{ color: COLORS.ink }}>
                      {pinMode === "create" ? "Criar PIN financeiro" : "Confirmar PIN"}
                    </h3>
                    <p className="text-[11px] truncate" style={{ color: COLORS.inkSoft }}>
                      Saque para {barber?.woovi_pix_key ?? "chave Pix cadastrada"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setPinOpen(false)}
                  disabled={savingPinSession}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: COLORS.surface }}
                >
                  <X className="w-4 h-4" style={{ color: COLORS.ink }} />
                </button>
              </div>

              <div className="rounded-2xl p-3" style={{ background: COLORS.surface }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px]" style={{ color: COLORS.inkSoft }}>
                    Valor do saque
                  </span>
                  <span className="text-[15px] font-bold tabular-nums" style={{ color: COLORS.ink }}>
                    {fmtBRL(Math.round((parseFloat(withdrawValue.replace(",", ".")) || 0) * 100))}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-[12px] font-semibold" style={{ color: COLORS.ink }}>
                  {pinMode === "create" ? "Novo PIN de 4 dígitos" : "PIN financeiro"}
                </Label>
                <div className="flex items-center justify-center gap-3">
                  {[0, 1, 2, 3].map((index) => (
                    <Input
                      key={`pin-${index}`}
                      type="password"
                      inputMode="numeric"
                      maxLength={1}
                      value={pinDigits[index]}
                      onChange={(event) => {
                        const value = event.target.value.replace(/\D/g, "").slice(-1);
                        const next = [...pinDigits];
                        next[index] = value;
                        setPinDigits(next);
                        setPinError(null);
                      }}
                      className="w-12 h-14 text-center text-xl font-bold rounded-2xl"
                      style={{ borderColor: pinError ? COLORS.red : COLORS.divider, color: COLORS.ink }}
                    />
                  ))}
                </div>
              </div>

              {pinMode === "create" && (
                <div className="space-y-3">
                  <Label className="text-[12px] font-semibold" style={{ color: COLORS.ink }}>
                    Confirmar PIN
                  </Label>
                  <div className="flex items-center justify-center gap-3">
                    {[0, 1, 2, 3].map((index) => (
                      <Input
                        key={`pin-confirm-${index}`}
                        type="password"
                        inputMode="numeric"
                        maxLength={1}
                        value={pinConfirmDigits[index]}
                        onChange={(event) => {
                          const value = event.target.value.replace(/\D/g, "").slice(-1);
                          const next = [...pinConfirmDigits];
                          next[index] = value;
                          setPinConfirmDigits(next);
                          setPinError(null);
                        }}
                        className="w-12 h-14 text-center text-xl font-bold rounded-2xl"
                        style={{ borderColor: pinError ? COLORS.red : COLORS.divider, color: COLORS.ink }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {pinError && (
                <div className="flex items-center justify-center gap-2 text-[12px]" style={{ color: COLORS.red }}>
                  <AlertCircle className="w-4 h-4" />
                  <span>{pinError}</span>
                </div>
              )}

              <Button
                onClick={authorizePinAndWithdraw}
                disabled={savingPinSession}
                className="w-full h-12 text-[14px] font-semibold rounded-md"
                style={{ background: COLORS.indigo, color: "hsl(var(--primary-foreground))" }}
              >
                {savingPinSession ? <Loader2 className="w-4 h-4 animate-spin" /> : "Autorizar saque"}
              </Button>
            </div>
          </div>
        )}

        {/* Sheet: Saque automático */}
        {autoConfigOpen && (
          <div
            className="absolute inset-0 z-30 flex items-end"
            style={{ background: "rgba(0,0,0,0.45)" }}
            onClick={() => !savingSettings && setAutoConfigOpen(false)}
          >
            <div
              className="w-full rounded-t-2xl p-5 space-y-4"
              style={{ background: COLORS.card }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-medium tracking-tight" style={{ color: COLORS.ink }}>
                  Saque automático
                </h3>
                <button
                  onClick={() => setAutoConfigOpen(false)}
                  disabled={savingSettings}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: COLORS.surface }}
                >
                  <X className="w-4 h-4" style={{ color: COLORS.ink }} />
                </button>
              </div>

              <p className="text-[12px]" style={{ color: COLORS.inkSoft }}>
                Receba seu saldo automaticamente na sua chave Pix cadastrada.
              </p>

              <div className="space-y-2">
                <Label className="text-[12px]" style={{ color: COLORS.ink }}>
                  Dia da semana
                </Label>
                <Select value={autoDay} onValueChange={setAutoDay}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monday">Segunda-feira</SelectItem>
                    <SelectItem value="tuesday">Terça-feira</SelectItem>
                    <SelectItem value="wednesday">Quarta-feira</SelectItem>
                    <SelectItem value="thursday">Quinta-feira</SelectItem>
                    <SelectItem value="friday">Sexta-feira</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div
                className="flex items-center justify-between gap-3 px-3 py-3 rounded-md"
                style={{ border: `1px solid ${COLORS.divider}` }}
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-medium" style={{ color: COLORS.ink }}>
                    Ativar saque automático
                  </p>
                  <p className="text-[11px] mt-0.5 truncate" style={{ color: COLORS.inkSoft }}>
                    Chave Pix: {barber?.woovi_pix_key ?? "—"}
                  </p>
                </div>
                <Switch
                  checked={autoEnabled}
                  onCheckedChange={handleSaveSettings}
                  disabled={savingSettings || !barber?.woovi_pix_key}
                />
              </div>

              <Button
                onClick={() => setAutoConfigOpen(false)}
                disabled={savingSettings}
                className="w-full h-11"
                style={{ background: COLORS.indigo, color: "hsl(var(--primary-foreground))" }}
              >
                {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : "Concluir"}
              </Button>
            </div>
          </div>
        )}

        {/* Sheet: Cadastrar / trocar chave Pix */}
        {pixKeyOpen && (
          <div
            className="absolute inset-0 z-30 flex items-end"
            style={{ background: "rgba(0,0,0,0.45)" }}
            onClick={() => !savingPixKey && setPixKeyOpen(false)}
          >
            <div
              className="w-full rounded-t-2xl p-5 space-y-4"
              style={{ background: COLORS.card }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-medium tracking-tight" style={{ color: COLORS.ink }}>
                  Chave Pix
                </h3>
                <button
                  onClick={() => setPixKeyOpen(false)}
                  disabled={savingPixKey}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: COLORS.surface }}
                >
                  <X className="w-4 h-4" style={{ color: COLORS.ink }} />
                </button>
              </div>

              <div
                className="rounded-md px-3 py-2.5"
                style={{ background: COLORS.surface }}
              >
                <p className="text-[10px] uppercase tracking-[0.1em]" style={{ color: COLORS.inkSoft }}>
                  Chave atual
                </p>
                <p className="text-[13px] font-medium tabular-nums mt-1 break-all" style={{ color: COLORS.ink }}>
                  {barber?.woovi_pix_key ?? "Nenhuma cadastrada"}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-[12px]" style={{ color: COLORS.ink }}>
                  Tipo da chave
                </Label>
                <Select
                  value={pixKeyTypeDraft}
                  onValueChange={(v) => setPixKeyTypeDraft(v as PixKeyType)}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cpf">CPF</SelectItem>
                    <SelectItem value="cnpj">CNPJ</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="phone">Telefone</SelectItem>
                    <SelectItem value="random">Aleatória</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-[12px]" style={{ color: COLORS.ink }}>
                  Nova chave
                </Label>
                <Input
                  value={pixKeyDraft}
                  onChange={(e) => setPixKeyDraft(e.target.value)}
                  placeholder="Digite a chave Pix"
                  className="h-11"
                />
              </div>

              <Button
                onClick={async () => {
                  const normalizedPixKey = normalizePixKey(pixKeyDraft, pixKeyTypeDraft);
                  const validationError = validatePixKey(normalizedPixKey, pixKeyTypeDraft);
                  if (validationError) {
                    toast.error(validationError);
                    return;
                  }
                  setSavingPixKey(true);
                  try {
                    const { data, error } = await supabase
                      .from("barbeiros")
                      .update({
                        woovi_pix_key: normalizedPixKey,
                        woovi_pix_key_type: pixKeyTypeDraft,
                      })
                      .eq("id", barbeiroId)
                      .select("id")
                      .maybeSingle();
                    if (error) throw error;
                    if (!data) throw new Error("Não foi possível atualizar este barbeiro");
                    toast.success("Chave Pix atualizada");
                    await loadBarber();
                    setPixKeyOpen(false);
                  } catch (err) {
                    toast.error((err as Error).message || "Erro ao salvar chave");
                  } finally {
                    setSavingPixKey(false);
                  }
                }}
                disabled={savingPixKey}
                className="w-full h-11"
                style={{ background: COLORS.indigo, color: "hsl(var(--primary-foreground))" }}
              >
                {savingPixKey ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar chave"}
              </Button>

              <button
                onClick={() => {
                  setPixKeyOpen(false);
                  openChangePin();
                }}
                disabled={savingPixKey}
                className="w-full h-11 rounded-md text-[13px] font-medium border flex items-center justify-center gap-2"
                style={{ borderColor: COLORS.divider, color: COLORS.ink, background: COLORS.card }}
              >
                <Lock className="w-4 h-4" />
                Alterar PIN financeiro
              </button>
            </div>
          </div>
        )}

        {/* Sheet: Alterar PIN financeiro */}
        {changePinOpen && (
          <div
            className="absolute inset-0 z-40 flex items-end"
            style={{ background: "rgba(0,0,0,0.48)" }}
            onClick={() => !savingChangePin && setChangePinOpen(false)}
          >
            <div
              className="w-full rounded-t-3xl p-5 space-y-5 max-h-[90vh] overflow-y-auto"
              style={{ background: COLORS.card }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: COLORS.surface }}
                  >
                    <Lock className="w-4 h-4" style={{ color: COLORS.ink }} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[16px] font-bold" style={{ color: COLORS.ink }}>
                      Alterar PIN financeiro
                    </h3>
                    <p className="text-[11px]" style={{ color: COLORS.inkSoft }}>
                      Informe o PIN atual e defina um novo
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setChangePinOpen(false)}
                  disabled={savingChangePin}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: COLORS.surface }}
                >
                  <X className="w-4 h-4" style={{ color: COLORS.ink }} />
                </button>
              </div>

              {[
                { label: "PIN atual", digits: changeCurrentDigits, setter: setChangeCurrentDigits, prefix: "cur" },
                { label: "Novo PIN (4 dígitos)", digits: changeNewDigits, setter: setChangeNewDigits, prefix: "new" },
                { label: "Confirmar novo PIN", digits: changeConfirmDigits, setter: setChangeConfirmDigits, prefix: "cnf" },
              ].map((field) => (
                <div key={field.prefix} className="space-y-3">
                  <Label className="text-[12px] font-semibold" style={{ color: COLORS.ink }}>
                    {field.label}
                  </Label>
                  <div className="flex items-center justify-center gap-3">
                    {[0, 1, 2, 3].map((index) => (
                      <Input
                        key={`${field.prefix}-${index}`}
                        type="password"
                        inputMode="numeric"
                        maxLength={1}
                        value={field.digits[index]}
                        onChange={(event) => {
                          const value = event.target.value.replace(/\D/g, "").slice(-1);
                          const arr = [...field.digits];
                          arr[index] = value;
                          field.setter(arr);
                          setChangePinError(null);
                        }}
                        className="w-12 h-14 text-center text-xl font-bold rounded-2xl"
                        style={{ borderColor: changePinError ? COLORS.red : COLORS.divider, color: COLORS.ink }}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {changePinError && (
                <div className="flex items-center justify-center gap-2 text-[12px]" style={{ color: COLORS.red }}>
                  <AlertCircle className="w-4 h-4" />
                  <span>{changePinError}</span>
                </div>
              )}

              <Button
                onClick={submitChangePin}
                disabled={savingChangePin}
                className="w-full h-12 text-[14px] font-semibold rounded-md"
                style={{ background: COLORS.indigo, color: "hsl(var(--primary-foreground))" }}
              >
                {savingChangePin ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar novo PIN"}
              </Button>
            </div>
          </div>
        )}

        {/* Extrato — tela cheia */}
        {extratoOpen && (
          <div className="absolute inset-0 z-40 flex flex-col" style={{ background: COLORS.card }}>
            <div
              className="flex items-center gap-3 px-5 py-4 border-b"
              style={{ borderColor: COLORS.divider }}
            >
              <button
                onClick={() => setExtratoOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: COLORS.surface }}
                aria-label="Voltar"
              >
                <X className="w-4 h-4" style={{ color: COLORS.ink }} />
              </button>
              <h2 className="text-[15px] font-medium" style={{ color: COLORS.ink }}>
                Extrato
              </h2>
            </div>

            <div
              className="flex gap-2 px-5 py-3 border-b"
              style={{ borderColor: COLORS.divider }}
            >
              {[
                { id: "all", label: "Todos" },
                { id: "deposit", label: "Entradas" },
                { id: "withdraw", label: "Saídas" },
              ].map((f) => {
                const active = extratoFilter === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setExtratoFilter(f.id as typeof extratoFilter)}
                    className="px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors"
                    style={{
                      background: active ? COLORS.ink : COLORS.surface,
                      color: active ? "hsl(var(--background))" : COLORS.inkSoft,
                    }}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-y-auto px-5">
              {historyLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: COLORS.inkSoft }} />
                </div>
              ) : (() => {
                const list = transactions.filter((t) =>
                  extratoFilter === "all" ? true : t.type === extratoFilter,
                );
                if (list.length === 0) {
                  return (
                    <p className="text-center text-[13px] py-16" style={{ color: COLORS.inkSoft }}>
                      Nenhuma movimentação encontrada.
                    </p>
                  );
                }
                return (
                  <ul className="divide-y" style={{ borderColor: COLORS.divider }}>
                    {list.map((t) => {
                      const isIn = t.type === "deposit";
                      const isBlocked = Boolean(t.blocked);
                      return (
                        <li
                          key={t.id}
                          className="flex items-center gap-3 py-3.5"
                          style={{ borderColor: COLORS.divider }}
                        >
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                            style={{
                              background: isBlocked ? COLORS.amberSoft : isIn ? COLORS.greenSoft : COLORS.dangerSoft,
                              color: isBlocked ? COLORS.amber : isIn ? COLORS.green : COLORS.red,
                            }}
                          >
                            {isIn ? (
                              <ArrowDownLeft className="w-4 h-4" />
                            ) : (
                              <ArrowUpRight className="w-4 h-4" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p
                              className="text-[13px] font-medium truncate"
                              style={{ color: COLORS.ink }}
                            >
                              {t.description ?? (isIn ? "Recebimento" : "Transferência")}
                            </p>
                            <p className="text-[11px]" style={{ color: COLORS.inkSoft }}>
                              {new Date(t.created_at).toLocaleString("pt-BR")}
                            </p>
                            {isBlocked && (
                              <span
                                className="mt-1 inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded"
                                style={{ background: COLORS.amberSoft, color: COLORS.amber }}
                              >
                                Em espera
                              </span>
                            )}
                          </div>
                          <p
                            className="text-[13px] font-medium tabular-nums"
                            style={{ color: isBlocked ? COLORS.amber : isIn ? COLORS.green : COLORS.ink }}
                          >
                            {isIn ? "+" : "-"}
                            {fmtBRL(t.value_centavos)}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                );
              })()}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ─── SALDO ──────────────────────────────────────────────── */

function SaldoView({
  balanceCentavos,
  blockedCentavos = 0,
  showBalance,
  onToggle,
  onSacar,
  onOpenExtrato,
}: {
  balanceCentavos: number;
  blockedCentavos?: number;
  showBalance: boolean;
  onToggle: () => void;
  onSacar: () => void;
  onOpenExtrato: () => void;
}) {
  const recebidoStr = showBalance ? fmtBRL(balanceCentavos) : "R$ ••••";
  const blockedStr = showBalance ? fmtBRL(blockedCentavos) : "R$ ••••";
  return (
    <div className="px-5 pt-6 pb-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className="text-[11px] uppercase tracking-[0.16em] mb-2"
            style={{ color: COLORS.inkSoft }}
          >
            Saldo disponível
          </p>
          <div className="flex items-center gap-2.5">
            <p
              className="text-[34px] font-semibold tracking-tight leading-none tabular-nums"
              style={{ color: COLORS.ink }}
            >
              {recebidoStr}
            </p>
            <button onClick={onToggle} aria-label="Mostrar/ocultar saldo" className="pb-0.5">
              {showBalance ? (
                <Eye className="w-4 h-4" style={{ color: COLORS.inkSoft }} />
              ) : (
                <EyeOff className="w-4 h-4" style={{ color: COLORS.inkSoft }} />
              )}
            </button>
          </div>
          <p className="text-[12px] mt-2" style={{ color: COLORS.inkSoft }}>
            Pronto para saque agora
          </p>
        </div>
        <button
          onClick={onOpenExtrato}
          className="flex items-center gap-1 text-[12px] font-medium shrink-0 mt-0.5"
          style={{ color: COLORS.inkSoft }}
        >
          Extrato
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {blockedCentavos > 0 && (
        <div
          className="mt-5 flex items-center justify-between rounded-xl px-4 py-3"
          style={{ background: COLORS.surface, border: `1px solid ${COLORS.divider}` }}
        >
          <p className="text-[12px]" style={{ color: COLORS.inkSoft }}>
            Aguardando finalização do corte
          </p>
          <p className="text-[13px] font-semibold tabular-nums" style={{ color: COLORS.amber }}>
            {blockedStr}
          </p>
        </div>
      )}

      <button
        onClick={onSacar}
        disabled={balanceCentavos <= 0}
        className="mt-6 w-full h-12 rounded-xl text-[14px] font-semibold tracking-tight transition-opacity active:opacity-80 disabled:opacity-40"
        style={{ background: COLORS.indigo, color: "hsl(var(--primary-foreground))" }}
      >
        Sacar
      </button>
    </div>
  );
}

function ConfigRow({
  icon,
  label,
  value,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl transition-colors hover:bg-muted/40"
      style={{ border: `1px solid ${COLORS.divider}`, background: COLORS.card }}
    >
      <div className="flex items-center gap-3 min-w-0">
        {icon}
        <div className="text-left min-w-0">
          <p className="text-[13.5px] font-medium" style={{ color: COLORS.ink }}>
            {label}
          </p>
          <p className="text-[11.5px] truncate mt-0.5" style={{ color: COLORS.inkSoft }}>
            {value}
          </p>
        </div>
      </div>
      <ArrowRight className="w-4 h-4 shrink-0" style={{ color: COLORS.inkSoft }} />
    </button>
  );
}

/* ─── EXTRATO PREVIEW ─────────────────────────────────────── */

function ExtratoPreview({
  loading,
  transactions,
}: {
  loading: boolean;
  transactions: WooviTransaction[];
  onOpen?: () => void;
}) {
  return (
    <div className="pt-5">
      <p
        className="text-[11px] uppercase tracking-[0.16em] mb-2"
        style={{ color: COLORS.inkSoft }}
      >
        Extrato
      </p>


      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: COLORS.inkSoft }} />
        </div>
      ) : transactions.length === 0 ? (
        <p className="text-[12px] py-2" style={{ color: COLORS.inkSoft }}>
          Sem movimentações.
        </p>
      ) : (
        <ul
          className="rounded-xl overflow-hidden"
          style={{ border: `1px solid ${COLORS.divider}`, background: COLORS.card }}
        >
          {transactions.map((t, i) => {
            const isIn = t.type === "deposit";
            return (
              <li
                key={t.id}
                className="flex items-center gap-3 px-4 py-3.5"
                style={{ borderTop: i === 0 ? "none" : `1px solid ${COLORS.divider}` }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    background: isIn ? COLORS.greenSoft : COLORS.dangerSoft,
                    color: isIn ? COLORS.green : COLORS.red,
                  }}
                >
                  {isIn ? (
                    <ArrowDownLeft className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[13px] font-medium truncate"
                    style={{ color: COLORS.ink }}
                  >
                    {t.description ?? (isIn ? "Recebimento" : "Transferência")}
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: COLORS.inkSoft }}>
                    {new Date(t.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <p
                  className="text-[13px] font-semibold tabular-nums"
                  style={{ color: isIn ? COLORS.green : COLORS.ink }}
                >
                  {isIn ? "+" : "-"}
                  {fmtBRL(t.value_centavos)}
                </p>
              </li>
            );
          })}
        </ul>
      )}

    </div>
  );
}



/* ─── MOVIMENTO ──────────────────────────────────────────── */

function MovimentoView({
  blockedCentavos = 0,
  showBalance,
  onToggle,
}: {
  blockedCentavos?: number;
  showBalance: boolean;
  onToggle: () => void;
}) {
  const blockedStr = showBalance ? fmtBRL(blockedCentavos) : "R$ ••••";
  const amber = COLORS.amber; // laranja/amarelo (igual ao antigo)

  return (
    <div className="px-5 pt-6 pb-6">
      <p
        className="text-[11px] uppercase tracking-[0.16em] mb-2"
        style={{ color: COLORS.inkSoft }}
      >
        Em espera
      </p>
      <div className="flex items-center gap-2.5">
        <p
          className="text-[34px] font-semibold tracking-tight leading-none tabular-nums"
          style={{ color: amber }}
        >
          {blockedStr}
        </p>
        <button
          onClick={onToggle}
          aria-label="Mostrar/ocultar saldo em espera"
          className="pb-0.5"
        >
          {showBalance ? (
            <Eye className="w-4 h-4" style={{ color: COLORS.inkSoft }} />
          ) : (
            <EyeOff className="w-4 h-4" style={{ color: COLORS.inkSoft }} />
          )}
        </button>
      </div>

      <p className="text-[12px] mt-3 leading-relaxed" style={{ color: COLORS.inkSoft }}>
        Liberado quando o corte for confirmado. Se o cliente cancelar, é estornado automaticamente.
      </p>
    </div>
  );
}



function MovimentoRow({ tx }: { tx: WooviTransaction }) {
  const isIn = tx.type === "deposit";
  const isBlocked = Boolean(tx.blocked);
  const isRefund = !isIn && /estorn|cancel/i.test(tx.description ?? "");
  const iconBg = isBlocked ? COLORS.amberSoft : isIn ? COLORS.greenSoft : COLORS.dangerSoft;
  const iconColor = isBlocked ? COLORS.amber : isIn ? COLORS.green : COLORS.red;
  const amountColor = isBlocked ? COLORS.amber : isIn ? COLORS.green : COLORS.red;

  return (
    <li className="flex items-center gap-3 py-3.5" style={{ borderColor: COLORS.divider }}>
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
        style={{ background: iconBg, color: iconColor }}
      >
        {isIn ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className="text-[13px] font-medium truncate"
          style={{ color: isBlocked ? COLORS.amber : COLORS.ink }}
        >
          {tx.description ?? (isIn ? "Entrada" : "Saída")}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <p className="text-[11px]" style={{ color: COLORS.inkSoft }}>
            {new Date(tx.created_at).toLocaleString("pt-BR")}
          </p>
          {isBlocked && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ background: COLORS.amberSoft, color: COLORS.amber }}
            >
              Em espera
            </span>
          )}
          {isRefund && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ background: COLORS.dangerSoft, color: COLORS.red }}
            >
              Reembolsado
            </span>
          )}
        </div>
      </div>
      <p className="text-[14px] font-bold tabular-nums" style={{ color: amountColor }}>
        {isIn ? "+" : "-"}
        {fmtBRL(tx.value_centavos)}
      </p>
    </li>
  );
}

/* ─── SUBCONTA ───────────────────────────────────────────── */

function SubcontaView({
  barber,
  fallbackName,
  hasSubaccount,
}: {
  barber: BarberRow | null;
  fallbackName?: string | null;
  hasSubaccount: boolean;
}) {
  const displayName =
    barber?.woovi_subaccount_name?.trim() ||
    fallbackName?.trim() ||
    "—";

  const keyTypeLabel = barber?.woovi_pix_key_type
    ? PIX_KEY_LABELS[barber.woovi_pix_key_type as PixKeyType] ?? "—"
    : "—";

  const statusLabel = hasSubaccount
    ? "Subconta ativa"
    : "Pendente de criação";

  const statusColor = hasSubaccount ? COLORS.green : COLORS.amber;

  return (
    <div className="px-5 pt-6 space-y-4">
      <h2 className="text-[16px] font-bold" style={{ color: COLORS.ink }}>
        Dados da subconta
      </h2>
      <div
        className="rounded-2xl p-4 space-y-2"
        style={{ background: COLORS.card, border: `1px solid ${COLORS.divider}` }}
      >
        <Row label="Nome" value={displayName} />
        <Row label="Tipo de chave" value={keyTypeLabel} />
        <Row label="Chave Pix" value={barber?.woovi_pix_key ?? "—"} mono />
        <div className="flex items-center justify-between gap-3 py-1">
          <span className="text-[12px]" style={{ color: COLORS.inkSoft }}>
            Status
          </span>
          <span
            className="text-[12px] font-semibold px-2 py-0.5 rounded-full"
            style={{
              color: statusColor,
              background: `${statusColor}1a`,
            }}
          >
            {statusLabel}
          </span>
        </div>
      </div>
      <p className="text-[11px]" style={{ color: COLORS.inkSoft }}>
        Os Pix recebidos dos seus agendamentos caem diretamente nessa chave.
      </p>
    </div>
  );
}


function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-[12px]" style={{ color: COLORS.inkSoft }}>
        {label}
      </span>
      <span
        className={`text-[13px] font-medium truncate max-w-[60%] text-right ${mono ? "tabular-nums" : ""}`}
        style={{ color: COLORS.ink }}
      >
        {value}
      </span>
    </div>
  );
}

/* ─── CRIAÇÃO ────────────────────────────────────────────── */

function CreationForm({
  formName,
  setFormName,
  formKeyType,
  setFormKeyType,
  formKey,
  setFormKey,
  creating,
  onCreate,
}: {
  formName: string;
  setFormName: (v: string) => void;
  formKeyType: PixKeyType;
  setFormKeyType: (v: PixKeyType) => void;
  formKey: string;
  setFormKey: (v: string) => void;
  creating: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Conteúdo rolável dentro do próprio card */}
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-5 space-y-6">
        <div className="space-y-1">
          <h2 className="text-[20px] font-bold tracking-tight" style={{ color: COLORS.ink }}>
            Criar carteira
          </h2>
          <p className="text-[12px] leading-relaxed" style={{ color: COLORS.inkSoft }}>
            Cadastre sua chave Pix para começar a receber os pagamentos dos seus agendamentos.
          </p>
        </div>

        {/* Campos diretos no card — sem caixa interna */}
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide" style={{ color: COLORS.inkSoft }}>
              Nome do titular
            </Label>
            <Input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Seu nome completo"
              className="h-11 border bg-transparent"
              style={{ borderColor: COLORS.divider, color: COLORS.ink }}
            />
          </div>

          <div style={{ height: 1, background: COLORS.divider }} />

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide" style={{ color: COLORS.inkSoft }}>
              Tipo de chave Pix
            </Label>
            <Select value={formKeyType} onValueChange={(v) => setFormKeyType(v as PixKeyType)}>
              <SelectTrigger
                className="h-11 border bg-transparent"
                style={{ borderColor: COLORS.divider, color: COLORS.ink }}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PIX_KEY_LABELS) as PixKeyType[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {PIX_KEY_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div style={{ height: 1, background: COLORS.divider }} />

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide" style={{ color: COLORS.inkSoft }}>
              Chave Pix
            </Label>
            <Input
              value={formKey}
              onChange={(e) => setFormKey(e.target.value)}
              placeholder={
                formKeyType === "email"
                  ? "voce@exemplo.com"
                  : formKeyType === "phone"
                  ? "11999999999"
                  : formKeyType === "random"
                  ? "chave-aleatoria-uuid"
                  : "Somente números"
              }
              className="h-11 border bg-transparent tabular-nums"
              style={{ borderColor: COLORS.divider, color: COLORS.ink }}
            />
          </div>
        </div>

        <div
          className="rounded-xl px-4 py-3 flex items-start gap-2"
          style={{ background: COLORS.surface, border: `1px solid ${COLORS.divider}` }}
        >
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" style={{ color: COLORS.indigo }} />
          <p className="text-[11px] leading-relaxed" style={{ color: COLORS.inkSoft }}>
            Seus pagamentos via Pix cairão direto nessa chave. Confira os dados — eles ficam vinculados à sua subconta.
          </p>
        </div>
      </div>

      {/* Botão fixo no rodapé do card */}
      <div
        className="px-5 py-4"
        style={{ borderTop: `1px solid ${COLORS.divider}`, background: COLORS.card }}
      >
        <Button
          onClick={onCreate}
          disabled={creating}
          className="w-full h-12 text-[14px] font-semibold rounded-md"
          style={{ background: COLORS.indigo, color: "hsl(var(--primary-foreground))" }}
        >
          {creating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Criando carteira...
            </>
          ) : (
            "Criar carteira"
          )}
        </Button>
      </div>
    </div>
  );
}
