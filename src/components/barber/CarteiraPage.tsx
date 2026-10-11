import { useCallback, useEffect, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useViewportHeight } from "@/hooks/useViewportHeight";
import { toast } from "sonner";
import {
  Loader2,
  ArrowDownLeft,
  ArrowUpRight,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Calendar,
  Lock,
  AlertCircle,
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
import pixLogo from "@/assets/pix-logo.png";

function PixLogoImage({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <img
      src={pixLogo}
      alt="Pix"
      className={`${className} object-contain shrink-0`}
      loading="eager"
      decoding="sync"
    />
  );
}

/* ─── Types ───────────────────────────────────────────────── */

interface CarteiraPageProps {
  barbeiroId: string;
  barbeiroNome: string;
  basePath?: string;
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

const PIX_KEY_LABELS: Record<PixKeyType, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  email: "E-mail",
  phone: "Telefone",
  random: "Aleatória",
};

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

const maskPixKey = (key?: string | null, type?: string | null) => {
  if (!key) return "Não cadastrada";
  const trimmed = key.trim();
  if (type === "cpf" && trimmed.length === 11) {
    return `${trimmed.slice(0, 3)}.•••.•••-${trimmed.slice(-2)}`;
  }
  if (type === "cnpj" && trimmed.length === 14) {
    return `${trimmed.slice(0, 2)}.•••.•••/••••-${trimmed.slice(-2)}`;
  }
  if (type === "phone") {
    return trimmed.length > 6 ? `${trimmed.slice(0, 4)} •••••-${trimmed.slice(-2)}` : trimmed;
  }
  if (type === "email") {
    const parts = trimmed.split("@");
    if (parts.length === 2) {
      const name = parts[0];
      return `${name.slice(0, 2)}•••@${parts[1]}`;
    }
  }
  if (trimmed.length > 8) {
    return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
  }
  return trimmed;
};

const formatTransactionDate = (dateStr: string) => {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (isToday) return `Hoje às ${time}`;
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return `Ontem às ${time}`;
    return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} · ${time}`;
  } catch {
    return dateStr;
  }
};

const emptyPin = ["", "", "", ""];

const PAID_WOOVI_STATUSES = ["PAID", "paid", "COMPLETED", "ACTIVE_PAID"];
const REFUNDED_WOOVI_STATUSES = ["REFUNDED", "refunded"];
const VISIBLE_WOOVI_STATUSES = [...PAID_WOOVI_STATUSES, ...REFUNDED_WOOVI_STATUSES];

const PIX_FEE_CENTAVOS = 40;
const netCentavos = (value: unknown) => Math.max(0, Number(value ?? 0) - PIX_FEE_CENTAVOS);

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

const mapWooviChargeToTransaction = (charge: LocalWooviCharge): WooviTransaction[] => {
  const status = charge.status ?? "";
  const isRefunded = REFUNDED_WOOVI_STATUSES.includes(status);
  const isPaid = PAID_WOOVI_STATUSES.includes(status);

  if (!isPaid && !isRefunded) return [];

  const created_at = charge.refunded_at ?? charge.paid_at ?? charge.created_at ?? new Date().toISOString();
  const bruto = Number(charge.value_centavos ?? 0);

  if (isRefunded) {
    return [
      {
        id: `c-${charge.id}`,
        type: "withdraw",
        value_centavos: bruto,
        status: "Estornado",
        created_at,
        description: "Cancelamento — estornado ao cliente",
      },
    ];
  }

  const blocked = !charge.released_at;
  const feeCreatedAt = new Date(new Date(created_at).getTime() + 1000).toISOString();
  return [
    {
      id: `fee-${charge.id}`,
      type: "withdraw",
      value_centavos: PIX_FEE_CENTAVOS,
      status: blocked ? "Aguardando finalização do corte" : "Cobrada",
      created_at: feeCreatedAt,
      description: "Taxa bancária · Pix recebido",
      blocked,
    },
    {
      id: `c-${charge.id}`,
      type: "deposit",
      value_centavos: bruto,
      status: blocked ? "Aguardando finalização do corte" : "Disponível",
      created_at,
      description: blocked ? "Pix recebido · aguardando corte" : "Pagamento recebido (Pix)",
      blocked,
    },
  ];
};

type StoreApiAction = "woovi_get_balance" | "woovi_history" | "woovi_withdraw";
type StoreApiPayload = { action: StoreApiAction; [key: string]: unknown };
type StoreApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
};

async function invokeStoreApi<T>(payload: StoreApiPayload): Promise<StoreApiResponse<T>> {
  const { data, error } = await supabase.functions.invoke("woovi-wallet", { body: payload });

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

/* Cache em memória */
type WalletCacheEntry = {
  barber: BarberRow | null;
  balanceCentavos: number;
  blockedCentavos: number;
  transactions: WooviTransaction[];
  avatarUrl: string | null;
  hasPin: boolean;
};
const walletCache = new Map<string, WalletCacheEntry>();

export function CarteiraPage({
  barbeiroId,
  barbeiroNome,
}: CarteiraPageProps) {
  const cached = walletCache.get(barbeiroId);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [barber, setBarber] = useState<BarberRow | null>(cached?.barber ?? null);
  const [balanceCentavos, setBalanceCentavos] = useState<number>(cached?.balanceCentavos ?? 0);
  const [blockedCentavos, setBlockedCentavos] = useState<number>(cached?.blockedCentavos ?? 0);
  const availableCentavos = Math.max(0, balanceCentavos - blockedCentavos);
  const [showBalance, setShowBalance] = useState(true);

  const [creating, setCreating] = useState(false);
  const [formName, setFormName] = useState(barbeiroNome ?? "");
  const [formKeyType, setFormKeyType] = useState<PixKeyType>("cpf");
  const [formKey, setFormKey] = useState("");

  const { height: viewportHeight, keyboardOpen } = useViewportHeight();
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

  const [changePinOpen, setChangePinOpen] = useState(false);
  const [changeCurrentDigits, setChangeCurrentDigits] = useState<string[]>(emptyPin);
  const [changeNewDigits, setChangeNewDigits] = useState<string[]>(emptyPin);
  const [changeConfirmDigits, setChangeConfirmDigits] = useState<string[]>(emptyPin);
  const [changePinError, setChangePinError] = useState<string | null>(null);
  const [savingChangePin, setSavingChangePin] = useState(false);

  const [savingSettings, setSavingSettings] = useState(false);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoConfigOpen, setAutoConfigOpen] = useState(false);
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

  const firstName = (barbeiroNome ?? "").split(" ")[0] || "Barbeiro";
  const hasSubaccount = Boolean(barber?.woovi_pix_key);

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
      return isBlockedPaid ? sum + netCentavos(charge.value_centavos) : sum;
    }, 0);
    const released = localCharges.reduce((sum, charge) => {
      const isReleasedPaid = PAID_WOOVI_STATUSES.includes(charge.status ?? "") && Boolean(charge.released_at);
      return isReleasedPaid ? sum + netCentavos(charge.value_centavos) : sum;
    }, 0);

    const mappedCharges = localCharges.flatMap(mapWooviChargeToTransaction);

    const mappedSaques = (saques ?? []).map((s) => ({
      id: `s-${s.id}`,
      type: "withdraw" as const,
      value_centavos: Math.round(Number(s.valor ?? 0) * 100),
      status: s.status ?? "processando",
      created_at: s.created_at,
      description: "Saque via Pix",
    }));

    const localTransactions = [...mappedCharges, ...mappedSaques].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );

    if (syncBalance) {
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

  const syncProviderBalance = useCallback(async () => {
    try {
      const res = await invokeStoreApi<{
        balance_centavos?: number;
        blocked_centavos?: number;
        source?: string;
        configured?: boolean;
      }>({ action: "woovi_get_balance" });

      if (!res.success || !res.data || res.data.source !== "woovi" || res.data.configured === false) {
        return false;
      }

      const balance = Math.max(0, Number(res.data.balance_centavos ?? 0));
      const blocked = Math.min(Math.max(0, Number(res.data.blocked_centavos ?? 0)), balance);
      setBalanceCentavos(balance);
      setBlockedCentavos(blocked);
      return true;
    } catch (err) {
      console.error("[woovi] saldo do provedor:", err);
      return false;
    }
  }, []);

  const loadBalance = useCallback(async () => {
    try {
      await loadLocalWalletData({ syncBalance: true });
    } catch (fallbackErr) {
      console.error("[woovi] saldo local:", fallbackErr);
      setBalanceCentavos(0);
      setBlockedCentavos(0);
    }
    await syncProviderBalance();
  }, [loadLocalWalletData, syncProviderBalance]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const localTransactions = await loadLocalWalletData();
      setTransactions(localTransactions);
    } catch (fallbackErr) {
      console.error("[woovi] histórico local:", fallbackErr);
    } finally {
      setHistoryLoading(false);
    }
  }, [loadLocalWalletData]);

  const handleRefreshAll = async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadBarber(), loadBalance(), loadHistory()]);
      toast.success("Dados atualizados");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let alive = true;
    setFormName(barbeiroNome ?? "");
    setAvatarFailed(false);

    const entry = walletCache.get(barbeiroId);
    if (entry) {
      setBarber(entry.barber);
      setAutoEnabled(Boolean(entry.barber?.woovi_auto_withdraw_enabled));
      setBalanceCentavos(entry.balanceCentavos);
      setBlockedCentavos(entry.blockedCentavos);
      setTransactions(entry.transactions);
      setAvatarUrl(entry.avatarUrl);
      setHasPin(entry.hasPin);
      setLoading(false);
    } else {
      setLoading(true);
    }

    (async () => {
      const [barberRes, pinRes, walletRes, authRes] = await Promise.all([
        loadBarber().catch(() => null),
        loadPinStatus().catch(() => false),
        loadLocalWalletData({ syncBalance: true }).catch((err) => {
          console.error("[woovi] carteira local:", err);
          return [] as WooviTransaction[];
        }),
        supabase.auth.getUser().catch(() => null),
      ]);

      let avatar: string | null = null;
      const uid = authRes?.data?.user?.id;
      if (uid) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("avatar_url")
          .eq("id", uid)
          .maybeSingle();
        avatar = prof?.avatar_url ?? null;
      }

      if (!alive) return;
      setTransactions(walletRes);
      setAvatarUrl(avatar);
      setLoading(false);

      walletCache.set(barbeiroId, {
        barber: barberRes,
        balanceCentavos: 0,
        blockedCentavos: 0,
        transactions: walletRes,
        avatarUrl: avatar,
        hasPin: Boolean(pinRes),
      });

      if (alive) await syncProviderBalance();
    })();

    return () => {
      alive = false;
    };
  }, [barbeiroId, barbeiroNome, loadBarber, loadLocalWalletData, loadPinStatus, syncProviderBalance]);

  useEffect(() => {
    const entry = walletCache.get(barbeiroId);
    if (entry) {
      entry.balanceCentavos = balanceCentavos;
      entry.blockedCentavos = blockedCentavos;
    }
  }, [barbeiroId, balanceCentavos, blockedCentavos]);

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

  const handleCreate = async () => {
    if (!formName.trim()) return toast.error("Informe o nome do titular.");
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

      toast.success("Chave Pix cadastrada!");
      await loadBarber();
      await loadBalance();
    } catch (err) {
      toast.error((err as Error).message || "Erro ao configurar carteira");
    } finally {
      setCreating(false);
    }
  };

  const handleWithdraw = async (pinAlreadyValidated = false) => {
    const valueReais = parseFloat(withdrawValue.replace(",", "."));
    if (!valueReais || valueReais <= 0) return toast.error("Informe um valor válido");
    const cents = Math.round(valueReais * 100);
    if (cents > availableCentavos) {
      return toast.error(
        blockedCentavos > 0
          ? `Disponível ${fmtBRL(availableCentavos)} — ${fmtBRL(blockedCentavos)} aguardando finalização`
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
      toast.success("Saque solicitado via Pix!");
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
          ? "Saque automático semanal ativado"
          : "Saque automático desativado",
      );
    } catch (err) {
      setAutoEnabled(!next);
      toast.error((err as Error).message || "Erro ao salvar preferência");
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="min-h-app bg-background text-foreground pb-32">
      {/* HEADER: Saudação e status */}
      <div
        className="sticky top-0 px-5 pb-3 flex items-center justify-between gap-3 z-20 bg-background/95 dark:bg-[#0c0c0e]/95 backdrop-blur-md"
        style={{ paddingTop: "max(16px, calc(env(safe-area-inset-top, 0px) + 8px))" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center shrink-0 border border-border/80 bg-card">
            {avatarUrl && !avatarFailed ? (
              <img
                src={avatarUrl}
                alt={barbeiroNome || "Avatar"}
                className="w-full h-full object-cover"
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              <span className="text-[13px] font-bold text-foreground">
                {(barbeiroNome || "B")
                  .trim()
                  .split(/\s+/)
                  .map((p) => p[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-[16px] font-bold leading-tight truncate tracking-tight text-foreground">
              Olá, {firstName}
            </h1>
            <p className="text-[12px] font-normal text-muted-foreground leading-none mt-0.5">
              Carteira Digital
            </p>
          </div>
        </div>

        <button
          onClick={handleRefreshAll}
          disabled={refreshing}
          className="w-9 h-9 rounded-full border border-border/80 bg-card flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-95 transition-all"
          title="Atualizar dados"
          aria-label="Atualizar dados"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-foreground" : ""}`} />
        </button>
      </div>

      {/* CONTEÚDO PRINCIPAL */}
      <div className="relative z-10 px-5 pt-2">
        <div className="mx-auto w-full max-w-md space-y-6">
          {loading ? (
            <div className="w-full rounded-2xl min-h-[200px] flex items-center justify-center border border-border/80 bg-card">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !hasSubaccount ? (
            /* Formulário de ativação / cadastro Pix */
            <div className="w-full rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
              <div className="space-y-1 mb-5">
                <PixLogoImage className="w-9 h-9 mb-3" />
                <h2 className="text-[18px] font-bold tracking-tight text-foreground">
                  Cadastrar Chave Pix
                </h2>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Cadastre sua chave Pix para receber os repasses dos agendamentos diretamente na sua conta.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-[12px] font-medium text-muted-foreground">
                    Nome do titular
                  </Label>
                  <Input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Nome completo"
                    className="h-11 rounded-xl bg-background border-border/80 text-[14px]"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[12px] font-medium text-muted-foreground">
                    Tipo de chave
                  </Label>
                  <Select value={formKeyType} onValueChange={(v) => setFormKeyType(v as PixKeyType)}>
                    <SelectTrigger className="h-11 rounded-xl bg-background border-border/80 text-[14px]">
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

                <div className="space-y-1.5">
                  <Label className="text-[12px] font-medium text-muted-foreground">
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
                    className="h-11 rounded-xl bg-background border-border/80 text-[14px] tabular-nums"
                  />
                </div>

                <Button
                  onClick={handleCreate}
                  disabled={creating}
                  className="w-full h-11 rounded-full bg-foreground text-background font-medium text-[14px] hover:opacity-90 transition-all mt-2"
                >
                  {creating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...
                    </>
                  ) : (
                    "Cadastrar chave Pix"
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* 1. CARD PRINCIPAL DE SALDO (Padrão exato elogiado pelo usuário) */}
              <div className="w-full rounded-2xl border border-border/60 bg-muted/30 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Saldo disponível
                  </p>
                  <button
                    onClick={() => setShowBalance((v) => !v)}
                    aria-label="Mostrar ou ocultar saldo"
                    className="text-muted-foreground hover:text-foreground transition-colors p-1"
                  >
                    {showBalance ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </div>

                <p className="text-[32px] sm:text-[36px] font-bold tracking-tight text-foreground tabular-nums leading-tight">
                  {showBalance ? fmtBRL(availableCentavos) : "R$ ••••••"}
                </p>

                {blockedCentavos > 0 && (
                  <p className="text-[12px] text-muted-foreground mt-1">
                    {showBalance ? fmtBRL(blockedCentavos) : "R$ ••••"} aguardando finalização
                  </p>
                )}

                {/* Botão de Saque (Padrão Add Money NeoBank) */}
                <button
                  onClick={() => setWithdrawOpen(true)}
                  disabled={availableCentavos <= 0}
                  className="w-full h-11 rounded-full bg-foreground text-background font-medium text-[14px] flex items-center justify-center hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-40 disabled:pointer-events-none mt-4 shadow-sm"
                >
                  Sacar via Pix
                </button>
              </div>

              {/* 2. CHAVE PIX CADASTRADA (Banner Minimalista e Sério) */}
              <div className="w-full rounded-2xl p-4 sm:p-5 bg-zinc-900 text-white border border-zinc-800 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <PixLogoImage className="w-5 h-5" />
                    <span className="text-[12px] font-medium text-zinc-300 truncate">
                      Chave Pix cadastrada
                    </span>
                  </div>
                  <span className="text-[11px] text-zinc-400 shrink-0">
                    {barber?.woovi_pix_key_type ? PIX_KEY_LABELS[barber.woovi_pix_key_type as PixKeyType] : "Pix"}
                  </span>
                </div>

                <div className="mt-2.5 mb-3">
                  <p className="text-[18px] sm:text-[19px] font-mono font-medium tracking-wider text-zinc-100 tabular-nums">
                    {maskPixKey(barber?.woovi_pix_key, barber?.woovi_pix_key_type)}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2.5 border-t border-zinc-800/80">
                  <p className="text-[12px] text-zinc-400 truncate">
                    {barber?.woovi_subaccount_name || barbeiroNome}
                  </p>

                  <button
                    onClick={() => {
                      setPixKeyDraft(barber?.woovi_pix_key ?? "");
                      setPixKeyTypeDraft(((barber?.woovi_pix_key_type as PixKeyType) ?? "cpf"));
                      setPixKeyOpen(true);
                    }}
                    className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-[12px] font-medium text-white transition-all shrink-0"
                  >
                    Configurar
                  </button>
                </div>
              </div>

              {/* 3. AÇÕES RÁPIDAS (Ícones diretos na linha, sem caixas/blocos por trás) */}
              <div className="rounded-2xl border border-border/80 bg-card overflow-hidden divide-y divide-border/60">
                {/* Linha: Saque Automático (Abre tela cheia) */}
                <div
                  onClick={() => setAutoConfigOpen(true)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-muted/30 active:scale-[0.99] transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <Calendar className="w-5 h-5 text-muted-foreground shrink-0" />
                    <div className="text-left min-w-0">
                      <p className="text-[14px] font-medium text-foreground">Saque automático</p>
                      <p className="text-[12px] text-muted-foreground truncate">
                        {autoEnabled ? "Ativado · Semanalmente" : "Desativado"}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>

                {/* Linha: PIN Financeiro (Abre tela cheia) */}
                <div
                  onClick={openChangePin}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-muted/30 active:scale-[0.99] transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <Lock className="w-5 h-5 text-muted-foreground shrink-0" />
                    <div className="text-left min-w-0">
                      <p className="text-[14px] font-medium text-foreground">PIN de segurança</p>
                      <p className="text-[12px] text-muted-foreground truncate">
                        {hasPin ? "PIN de 4 dígitos ativo" : "Criar PIN de segurança"}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>
              </div>

              {/* 4. TRANSAÇÕES RECENTES (SOLTAS na página, sem quadrado/container externo) */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-[14px] font-semibold tracking-tight text-foreground">
                    Transações recentes
                  </h2>
                  {transactions.length > 0 && (
                    <button
                      onClick={() => setExtratoOpen(true)}
                      className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Ver todas
                    </button>
                  )}
                </div>

                {historyLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : transactions.length === 0 ? (
                  <div className="py-6 text-center">
                    <p className="text-[13px] text-muted-foreground">
                      Nenhuma transação recente.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/40">
                    {transactions.slice(0, 5).map((t) => {
                      const isIn = t.type === "deposit";
                      const isBlocked = Boolean(t.blocked);
                      return (
                        <div key={t.id} className="flex items-center justify-between gap-3 py-3 px-1">
                          <div className="flex items-center gap-3 min-w-0">
                            {isIn ? (
                              <ArrowDownLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            ) : (
                              <ArrowUpRight className="w-4 h-4 text-muted-foreground shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="text-[13.5px] font-medium text-foreground truncate">
                                {t.description ?? (isIn ? "Recebimento Pix" : "Saque via Pix")}
                              </p>
                              <p className="text-[11.5px] text-muted-foreground">
                                {formatTransactionDate(t.created_at)}
                                {isBlocked && " · Em espera"}
                              </p>
                            </div>
                          </div>

                          <p
                            className={`text-[13.5px] font-semibold tabular-nums shrink-0 ${
                              isBlocked
                                ? "text-muted-foreground"
                                : isIn
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-foreground"
                            }`}
                          >
                            {isIn ? "+" : "-"}
                            {fmtBRL(t.value_centavos)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── TELAS INTEIRAS (100% sem gaveta) ────────────────────────── */}

      {/* TELA INTEIRA: SACAR VIA PIX */}
      {withdrawOpen && (
        <div
          className="fixed inset-0 z-[120] flex flex-col bg-background text-foreground overflow-hidden"
          style={{ minHeight: viewportHeight }}
        >
          {/* Header com ChevronLeft limpo (sem caixa cinza) */}
          <div
            className="flex-shrink-0 mx-auto w-full max-w-md px-5"
            style={{ paddingTop: "calc(var(--app-safe-top, env(safe-area-inset-top, 0px)) + 14px)" }}
          >
            <div className="flex items-center gap-2 min-h-[52px]">
              <button
                onClick={() => !withdrawing && setWithdrawOpen(false)}
                disabled={withdrawing}
                className="w-10 h-10 flex items-center justify-center text-foreground hover:opacity-70 active:scale-95 transition-all -ml-2 shrink-0"
                aria-label="Voltar"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h2 className="text-[17px] font-bold tracking-tight flex-1 truncate text-foreground">
                Sacar via Pix
              </h2>
            </div>
          </div>

          {/* Conteúdo */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            <div className="mx-auto w-full max-w-md px-5 pt-3 pb-8 space-y-6">
              {/* Saldo disponível (Idêntico ao padrão que o usuário elogiou) */}
              <div className="rounded-2xl p-4 bg-muted/30 border border-border/60">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Saldo disponível
                </p>
                <p className="text-[26px] font-bold text-foreground mt-0.5 tabular-nums">
                  {fmtBRL(availableCentavos)}
                </p>
                {blockedCentavos > 0 && (
                  <p className="text-[12px] mt-1 text-muted-foreground">
                    {fmtBRL(blockedCentavos)} aguardando finalização
                  </p>
                )}
              </div>

              {/* Valor a transferir: DIRETO NA TELA, sem bolha/caixa de input */}
              <div className="flex flex-col items-center justify-center py-6">
                <p className="text-[13px] font-medium text-muted-foreground mb-3">
                  Quanto deseja transferir?
                </p>
                <div className="flex items-baseline justify-center gap-1.5 w-full">
                  <span className="text-[28px] sm:text-[34px] font-bold text-muted-foreground select-none">
                    R$
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoFocus
                    placeholder="0,00"
                    value={withdrawValue}
                    onChange={(e) => setWithdrawValue(e.target.value)}
                    className="bg-transparent text-[38px] sm:text-[44px] font-bold text-foreground text-center focus:outline-none w-[240px] tabular-nums border-none shadow-none p-0"
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setWithdrawValue((availableCentavos / 100).toFixed(2).replace(".", ","))
                  }
                  className="mt-4 text-[13px] font-medium text-muted-foreground hover:text-foreground underline transition-colors"
                >
                  Sacar valor total ({fmtBRL(availableCentavos)})
                </button>
              </div>
            </div>
          </div>

          {/* Footer CTA */}
          <div
            className="flex-shrink-0 mx-auto w-full max-w-md px-5 pt-3 bg-background border-t border-border/60"
            style={{
              paddingBottom: keyboardOpen
                ? 12
                : "calc(var(--app-safe-bottom, env(safe-area-inset-bottom, 0px)) + 16px)",
            }}
          >
            <Button
              onClick={() => handleWithdraw()}
              disabled={withdrawing || availableCentavos <= 0}
              className="w-full h-11 rounded-full bg-foreground text-background font-medium text-[14px] hover:opacity-90 transition-all shadow-sm"
            >
              {withdrawing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Transferindo...
                </>
              ) : (
                "Confirmar saque Pix"
              )}
            </Button>
          </div>
        </div>
      )}

      {/* TELA INTEIRA: CONFIGURAR CHAVE PIX */}
      {pixKeyOpen && (
        <div
          className="fixed inset-0 z-[120] flex flex-col bg-background text-foreground overflow-hidden"
          style={{ minHeight: viewportHeight }}
        >
          {/* Header com ChevronLeft limpo */}
          <div
            className="flex-shrink-0 mx-auto w-full max-w-md px-5"
            style={{ paddingTop: "calc(var(--app-safe-top, env(safe-area-inset-top, 0px)) + 14px)" }}
          >
            <div className="flex items-center gap-2 min-h-[52px]">
              <button
                onClick={() => !savingPixKey && setPixKeyOpen(false)}
                disabled={savingPixKey}
                className="w-10 h-10 flex items-center justify-center text-foreground hover:opacity-70 active:scale-95 transition-all -ml-2 shrink-0"
                aria-label="Voltar"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h2 className="text-[17px] font-bold tracking-tight flex-1 truncate text-foreground">
                Configurar Chave Pix
              </h2>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain">
            <div className="mx-auto w-full max-w-md px-5 pt-3 pb-8 space-y-5">
              <div className="rounded-2xl p-4 bg-muted/30 border border-border/60">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Chave atual
                </p>
                <p className="text-[13.5px] font-mono font-medium mt-1 text-foreground break-all">
                  {barber?.woovi_pix_key ?? "Nenhuma cadastrada"}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-muted-foreground">
                  Tipo da chave
                </Label>
                <Select
                  value={pixKeyTypeDraft}
                  onValueChange={(v) => setPixKeyTypeDraft(v as PixKeyType)}
                >
                  <SelectTrigger className="h-11 rounded-xl bg-background border-border/80 text-[14px]">
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

              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-muted-foreground">
                  Nova chave Pix
                </Label>
                <Input
                  value={pixKeyDraft}
                  onChange={(e) => setPixKeyDraft(e.target.value)}
                  placeholder="Digite a chave Pix"
                  className="h-11 rounded-xl bg-background border-border/80 text-[14px] tabular-nums"
                />
              </div>
            </div>
          </div>

          <div
            className="flex-shrink-0 mx-auto w-full max-w-md px-5 pt-3 bg-background border-t border-border/60"
            style={{
              paddingBottom: keyboardOpen
                ? 12
                : "calc(var(--app-safe-bottom, env(safe-area-inset-bottom, 0px)) + 16px)",
            }}
          >
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
                  if (!data) throw new Error("Não foi possível atualizar");
                  toast.success("Chave Pix atualizada!");
                  await loadBarber();
                  setPixKeyOpen(false);
                } catch (err) {
                  toast.error((err as Error).message || "Erro ao salvar chave");
                } finally {
                  setSavingPixKey(false);
                }
              }}
              disabled={savingPixKey}
              className="w-full h-11 rounded-full bg-foreground text-background font-medium text-[14px] hover:opacity-90 transition-all shadow-sm"
            >
              {savingPixKey ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar chave"}
            </Button>
          </div>
        </div>
      )}

      {/* TELA INTEIRA: SAQUE AUTOMÁTICO */}
      {autoConfigOpen && (
        <div
          className="fixed inset-0 z-[120] flex flex-col bg-background text-foreground overflow-hidden"
          style={{ minHeight: viewportHeight }}
        >
          {/* Header com ChevronLeft limpo */}
          <div
            className="flex-shrink-0 mx-auto w-full max-w-md px-5"
            style={{ paddingTop: "calc(var(--app-safe-top, env(safe-area-inset-top, 0px)) + 14px)" }}
          >
            <div className="flex items-center gap-2 min-h-[52px]">
              <button
                onClick={() => setAutoConfigOpen(false)}
                className="w-10 h-10 flex items-center justify-center text-foreground hover:opacity-70 active:scale-95 transition-all -ml-2 shrink-0"
                aria-label="Voltar"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h2 className="text-[17px] font-bold tracking-tight flex-1 truncate text-foreground">
                Saque Automático
              </h2>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain">
            <div className="mx-auto w-full max-w-md px-5 pt-3 pb-8 space-y-4">
              <div className="rounded-2xl p-4 bg-muted/30 border border-border/60 flex items-center justify-between">
                <div className="pr-4">
                  <p className="text-[14px] font-medium text-foreground">
                    Repasse semanal automático
                  </p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    O saldo liberado é transferido toda semana para sua chave Pix.
                  </p>
                </div>
                <Switch
                  checked={autoEnabled}
                  onCheckedChange={handleSaveSettings}
                  disabled={savingSettings}
                />
              </div>

              <p className="text-[12px] leading-relaxed text-muted-foreground px-1">
                Você pode desativar quando quiser. Valores de agendamentos pendentes continuam em espera até a finalização do corte.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TELA INTEIRA: ALTERAR PIN FINANCEIRO */}
      {changePinOpen && (
        <div
          className="fixed inset-0 z-[120] flex flex-col bg-background text-foreground overflow-hidden"
          style={{ minHeight: viewportHeight }}
        >
          {/* Header com ChevronLeft limpo */}
          <div
            className="flex-shrink-0 mx-auto w-full max-w-md px-5"
            style={{ paddingTop: "calc(var(--app-safe-top, env(safe-area-inset-top, 0px)) + 14px)" }}
          >
            <div className="flex items-center gap-2 min-h-[52px]">
              <button
                onClick={() => !savingChangePin && setChangePinOpen(false)}
                disabled={savingChangePin}
                className="w-10 h-10 flex items-center justify-center text-foreground hover:opacity-70 active:scale-95 transition-all -ml-2 shrink-0"
                aria-label="Voltar"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h2 className="text-[17px] font-bold tracking-tight flex-1 truncate text-foreground">
                PIN de Segurança
              </h2>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain">
            <div className="mx-auto w-full max-w-md px-5 pt-3 pb-8 space-y-6">
              <p className="text-[13px] text-muted-foreground">
                Defina seu código de 4 dígitos para autorizar transferências e saques
              </p>

              {[
                { label: "PIN atual", digits: changeCurrentDigits, setter: setChangeCurrentDigits, prefix: "cur" },
                { label: "Novo PIN (4 dígitos)", digits: changeNewDigits, setter: setChangeNewDigits, prefix: "new" },
                { label: "Confirmar novo PIN", digits: changeConfirmDigits, setter: setChangeConfirmDigits, prefix: "cnf" },
              ].map((field) => (
                <div key={field.prefix} className="space-y-2">
                  <Label className="text-[12px] font-medium text-muted-foreground">
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
                        className="w-12 h-13 text-center text-xl font-bold rounded-xl bg-background border-border/80 text-foreground"
                      />
                    ))}
                  </div>
                </div>
              ))}

              {changePinError && (
                <div className="flex items-center justify-center gap-2 text-[12px] text-destructive font-medium">
                  <AlertCircle className="w-4 h-4" />
                  <span>{changePinError}</span>
                </div>
              )}
            </div>
          </div>

          <div
            className="flex-shrink-0 mx-auto w-full max-w-md px-5 pt-3 bg-background border-t border-border/60"
            style={{
              paddingBottom: keyboardOpen
                ? 12
                : "calc(var(--app-safe-bottom, env(safe-area-inset-bottom, 0px)) + 16px)",
            }}
          >
            <Button
              onClick={submitChangePin}
              disabled={savingChangePin}
              className="w-full h-11 rounded-full bg-foreground text-background font-medium text-[14px] hover:opacity-90 transition-all shadow-sm"
            >
              {savingChangePin ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar novo PIN"}
            </Button>
          </div>
        </div>
      )}

      {/* TELA INTEIRA: AUTORIZAÇÃO DE PIN (SAQUE) */}
      {pinOpen && (
        <div
          className="fixed inset-0 z-[140] flex flex-col bg-background text-foreground overflow-hidden"
          style={{ minHeight: viewportHeight }}
        >
          {/* Header limpo com ChevronLeft */}
          <div
            className="flex-shrink-0 mx-auto w-full max-w-md px-5"
            style={{ paddingTop: "calc(var(--app-safe-top, env(safe-area-inset-top, 0px)) + 14px)" }}
          >
            <div className="flex items-center gap-2 min-h-[52px]">
              <button
                onClick={() => !savingPinSession && setPinOpen(false)}
                disabled={savingPinSession}
                className="w-10 h-10 flex items-center justify-center text-foreground hover:opacity-70 active:scale-95 transition-all -ml-2 shrink-0"
                aria-label="Voltar"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h2 className="text-[17px] font-bold tracking-tight flex-1 truncate text-foreground">
                {pinMode === "create" ? "Criar PIN de segurança" : "Autorizar saque"}
              </h2>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain">
            <div className="mx-auto w-full max-w-md px-5 pt-3 pb-8 space-y-6">
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                {pinMode === "create"
                  ? "Defina um PIN de 4 dígitos para autorizar saques."
                  : "Digite seu PIN de 4 dígitos para autorizar o saque via Pix."}
              </p>

              <div className="space-y-2">
                <Label className="text-[12px] font-medium text-muted-foreground">
                  PIN
                </Label>
                <div className="flex items-center justify-center gap-3">
                  {[0, 1, 2, 3].map((index) => (
                    <Input
                      key={`pin-${index}`}
                      id={`fin-pin-${index}`}
                      autoFocus={index === 0}
                      type="password"
                      inputMode="numeric"
                      maxLength={1}
                      value={pinDigits[index]}
                      onChange={(event) => {
                        const value = event.target.value.replace(/\D/g, "").slice(-1);
                        const arr = [...pinDigits];
                        arr[index] = value;
                        setPinDigits(arr);
                        setPinError(null);
                        if (value && index < 3) {
                          document.getElementById(`fin-pin-${index + 1}`)?.focus();
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Backspace" && !pinDigits[index] && index > 0) {
                          document.getElementById(`fin-pin-${index - 1}`)?.focus();
                        }
                      }}
                      className="w-13 h-14 text-center text-2xl font-bold rounded-xl bg-card border-border/80 text-foreground shadow-sm"
                    />
                  ))}
                </div>
              </div>

              {pinMode === "create" && (
                <div className="space-y-2">
                  <Label className="text-[12px] font-medium text-muted-foreground">
                    Confirmar PIN
                  </Label>
                  <div className="flex items-center justify-center gap-3">
                    {[0, 1, 2, 3].map((index) => (
                      <Input
                        key={`pin-confirm-${index}`}
                        id={`fin-pin-c-${index}`}
                        type="password"
                        inputMode="numeric"
                        maxLength={1}
                        value={pinConfirmDigits[index]}
                        onChange={(event) => {
                          const value = event.target.value.replace(/\D/g, "").slice(-1);
                          const arr = [...pinConfirmDigits];
                          arr[index] = value;
                          setPinConfirmDigits(arr);
                          setPinError(null);
                          if (value && index < 3) {
                            document.getElementById(`fin-pin-c-${index + 1}`)?.focus();
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Backspace" && !pinConfirmDigits[index] && index > 0) {
                            document.getElementById(`fin-pin-c-${index - 1}`)?.focus();
                          }
                        }}
                        className="w-13 h-14 text-center text-2xl font-bold rounded-xl bg-card border-border/80 text-foreground shadow-sm"
                      />
                    ))}
                  </div>
                </div>
              )}

              {pinError && (
                <div className="flex items-center justify-center gap-2 text-[12px] text-destructive font-medium">
                  <AlertCircle className="w-4 h-4" />
                  <span>{pinError}</span>
                </div>
              )}
            </div>
          </div>

          <div
            className="flex-shrink-0 mx-auto w-full max-w-md px-5 pt-3 bg-background border-t border-border/60"
            style={{
              paddingBottom: keyboardOpen
                ? 12
                : "calc(var(--app-safe-bottom, env(safe-area-inset-bottom, 0px)) + 16px)",
            }}
          >
            <Button
              onClick={authorizePinAndWithdraw}
              disabled={savingPinSession}
              className="w-full h-11 rounded-full bg-foreground text-background font-medium text-[14px] hover:opacity-90 transition-all shadow-sm"
            >
              {savingPinSession ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : pinMode === "create" ? (
                "Criar PIN e autorizar saque"
              ) : (
                "Confirmar PIN e sacar"
              )}
            </Button>
          </div>
        </div>
      )}

      {/* TELA INTEIRA: EXTRATO COMPLETO */}
      {extratoOpen && (
        <div className="fixed inset-0 z-[120] flex flex-col bg-background text-foreground overflow-hidden">
          <div
            className="flex items-center gap-2 px-5 py-4 border-b border-border/80 shrink-0"
            style={{ paddingTop: "calc(var(--app-safe-top, env(safe-area-inset-top, 0px)) + 12px)" }}
          >
            <button
              onClick={() => setExtratoOpen(false)}
              className="w-10 h-10 flex items-center justify-center text-foreground hover:opacity-70 active:scale-95 transition-all -ml-2 shrink-0"
              aria-label="Voltar"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <h2 className="text-[17px] font-bold tracking-tight text-foreground flex-1">
              Extrato
            </h2>
          </div>

          {/* Filtros em Pílulas */}
          <div className="flex gap-2 px-5 py-3 border-b border-border/60 bg-muted/10 shrink-0">
            {[
              { id: "all", label: "Todas" },
              { id: "deposit", label: "Entradas" },
              { id: "withdraw", label: "Saídas" },
            ].map((f) => {
              const active = extratoFilter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setExtratoFilter(f.id as typeof extratoFilter)}
                  className={`px-3.5 py-1 rounded-full text-[13px] font-medium transition-all ${
                    active
                      ? "bg-foreground text-background"
                      : "bg-card border border-border/80 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* Lista de Transações SOLTA com divisores */}
          <div className="flex-1 overflow-y-auto px-5 divide-y divide-border/40 pb-20">
            {historyLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (() => {
              const list = transactions.filter((t) =>
                extratoFilter === "all" ? true : t.type === extratoFilter,
              );
              if (list.length === 0) {
                return (
                  <div className="text-center py-20 text-muted-foreground">
                    <p className="text-[13px]">Nenhuma movimentação encontrada.</p>
                  </div>
                );
              }
              return (
                <div>
                  {list.map((t) => {
                    const isIn = t.type === "deposit";
                    const isBlocked = Boolean(t.blocked);
                    return (
                      <div key={t.id} className="flex items-center justify-between gap-3 py-3.5">
                        <div className="flex items-center gap-3 min-w-0">
                          {isIn ? (
                            <ArrowDownLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4 text-muted-foreground shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-[13.5px] font-medium text-foreground truncate">
                              {t.description ?? (isIn ? "Recebimento Pix" : "Saque via Pix")}
                            </p>
                            <p className="text-[11.5px] text-muted-foreground">
                              {formatTransactionDate(t.created_at)}
                              {isBlocked && " · Em espera"}
                            </p>
                          </div>
                        </div>

                        <p
                          className={`text-[13.5px] font-semibold tabular-nums shrink-0 ${
                            isBlocked
                              ? "text-muted-foreground"
                              : isIn
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-foreground"
                          }`}
                        >
                          {isIn ? "+" : "-"}
                          {fmtBRL(t.value_centavos)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
