import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowUpFromLine,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Zap,
  ChevronRight,
  AlertCircle,
  Lock,
  Landmark,
  User,
  Building2,
  Mail,
  Phone,
  Hash,
  Eye,
  EyeOff,
  Settings2,
} from "lucide-react";
import pixLogo from "@/assets/pix-logo.png";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { FinancialRole } from "./FinancialModule";
import { useFinancialSaqueData, type PixKey, type Saque } from "@/hooks/useFinancialSaqueData";
import { useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/queryKeys";

interface Props {
  role: FinancialRole;
  userId?: string;
  barbeiroId?: string | null;
  onNavigate?: (section: string) => void;
  onBackConfigChange?: (config: { label: string; action: () => void } | null) => void;
}

/** Rótulo legível para tipo de chave PIX */
const pixTypeLabel: Record<string, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  email: "E-mail",
  telefone: "Telefone",
  aleatoria: "Aleatória",
};

/** Ícone por tipo de chave PIX */
const pixTypeIcon: Record<string, typeof User> = {
  cpf: User,
  cnpj: Building2,
  email: Mail,
  telefone: Phone,
  aleatoria: Hash,
};

import { getBancoName, getBancoLogo } from "@/lib/bankLogos";

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pendente: { label: "Pendente", color: "text-amber-500", icon: Clock },
  processando: { label: "Processando", color: "text-blue-400", icon: Clock },
  concluido: { label: "Concluído", color: "text-emerald-500", icon: CheckCircle2 },
  cancelado: { label: "Cancelado", color: "text-muted-foreground", icon: AlertTriangle },
  falhou: { label: "Falhou", color: "text-destructive", icon: AlertTriangle },
};

type WithdrawStep = "overview" | "amount" | "confirm" | "pin" | "success";

/**
 * FinancialSaque — Fluxo premium de saque bancário
 * Migrado para TanStack Query via useFinancialSaqueData.
 */
export function FinancialSaque({ role, userId, barbeiroId, onNavigate, onBackConfigChange }: Props) {
  const queryClient = useQueryClient();
  const { data, isLoading: loading } = useFinancialSaqueData(userId, barbeiroId);

  const pixKeys = data?.pixKeys ?? [];
  const saques = data?.saques ?? [];
  const hasPin = data?.hasPin ?? false;
  const saldoDisponivel = data?.saldoDisponivel ?? 0;

  const [step, setStep] = useState<WithdrawStep>("overview");
  const [valor, setValor] = useState("");
  const [showBalance, setShowBalance] = useState(false);
  const [selectedPixKey, setSelectedPixKey] = useState<PixKey | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // PIN
  const [pinDigits, setPinDigits] = useState<string[]>(["", "", "", ""]);
  const [pinError, setPinError] = useState(false);
  const [pinShake, setPinShake] = useState(false);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

  /** Sincroniza conta selecionada quando dados carregam */
  useEffect(() => {
    if (pixKeys.length > 0 && !selectedPixKey) {
      setSelectedPixKey(pixKeys.find((k) => k.is_default) || pixKeys[0]);
    }
  }, [pixKeys, selectedPixKey]);

  /** Invalida cache após saque */
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.financeiro.saque(userId ?? "") });
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.financeiro.overview(userId ?? "") });
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.financeiro.extrato(userId ?? "") });
  };

  /** Sincroniza o botão de voltar do header do FinancialModule */
  useEffect(() => {
    const config = (() => {
      switch (step) {
        case "overview":
          return { label: "Voltar ao banco", action: () => onNavigate?.("overview") };
        case "amount":
          return { label: "Voltar", action: () => setStep("overview") };
        case "confirm":
          return { label: "Voltar para valor", action: () => setStep("amount") };
        case "pin":
          return { label: "Voltar", action: () => setStep("confirm") };
        case "success":
          return null;
        default:
          return null;
      }
    })();
    onBackConfigChange?.(config);
    return () => onBackConfigChange?.(null);
  }, [step, onBackConfigChange, onNavigate]);




  /* ═══ PIN ═══ */
  const executeWithdrawRef = useRef<() => Promise<void>>(async () => {});

  const handlePinDigit = useCallback(
    (index: number, value: string) => {
      if (!/^\d?$/.test(value)) return;
      const newPin = [...pinDigits];
      newPin[index] = value;
      setPinDigits(newPin);
      setPinError(false);

      if (value && index < 3) {
        pinRefs.current[index + 1]?.focus();
      }

      if (value && index === 3) {
        const full = newPin.join("");
        if (full.length === 4) {
          void (async () => {
            const { data: ok, error } = await supabase.rpc("verify_financial_pin", {
              p_pin: full,
            });
            if (!error && ok === true) {
              executeWithdrawRef.current();
            } else {
              setPinError(true);
              setPinShake(true);
              setTimeout(() => {
                setPinShake(false);
                setPinDigits(["", "", "", ""]);
                pinRefs.current[0]?.focus();
              }, 600);
            }
          })();
        }
      }
    },
    [pinDigits]
  );

  const handlePinKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent) => {
      if (e.key === "Backspace" && !pinDigits[index] && index > 0) {
        pinRefs.current[index - 1]?.focus();
        const newPin = [...pinDigits];
        newPin[index - 1] = "";
        setPinDigits(newPin);
      }
    },
    [pinDigits]
  );

  /* ═══ Executar saque ═══ */
  const executeWithdraw = async () => {
    if (!userId || !selectedPixKey) return;
    const valorNum = parseInt(valor || "0", 10) / 100;

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Sessão expirada. Faça login novamente.");
        return;
      }

      const response = await supabase.functions.invoke("efi-send-pix", {
        body: {
          valor: valorNum,
          barbeiro_id: barbeiroId || null,
          chave_pix_id: selectedPixKey.id,
          tipo: "saque_manual",
        },
      });

      if (response.error) throw new Error(response.error.message || "Erro ao processar saque");
      const result = response.data;
      if (result?.error) {
        toast.error(result.error);
        setStep("confirm");
        return;
      }

      toast.success(result?.message || "Saque processado!");
      setStep("success");
      invalidate();
    } catch (err: any) {
      toast.error(err.message || "Erro ao solicitar saque");
      setStep("confirm");
    } finally {
      setSubmitting(false);
    }
  };

  executeWithdrawRef.current = executeWithdraw;

  const handleContinueToConfirm = () => {
    const num = parseInt(valor || "0", 10) / 100;
    if (isNaN(num) || num <= 0) {
      toast.error("Informe um valor válido");
      return;
    }
    if (num < 1) {
      toast.error("Valor mínimo para saque é R$ 1,00");
      return;
    }
    if (num > saldoDisponivel) {
      toast.error("Saldo insuficiente");
      return;
    }
    setStep("confirm");
  };

  const handleConfirmClick = () => {
    if (hasPin) {
      setPinDigits(["", "", "", ""]);
      setPinError(false);
      setStep("pin");
      setTimeout(() => pinRefs.current[0]?.focus(), 300);
    } else {
      executeWithdraw();
    }
  };

  const formatCurrency = (cents: string): string => {
    const num = parseInt(cents || "0", 10);
    const reais = Math.floor(num / 100);
    const centavos = num % 100;
    const reaisStr = reais.toLocaleString("pt-BR");
    return `${reaisStr},${centavos.toString().padStart(2, "0")}`;
  };

  const valorNum = parseInt(valor || "0", 10) / 100;

  

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-7 h-7 border-2 border-foreground/10 border-t-foreground/60 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <AnimatePresence mode="wait">
        {/* ═══════════════════════════════════
           STEP 1 — Visão geral com conta cadastrada
        ═══════════════════════════════════ */}
        {step === "overview" && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Guard: sem conta cadastrada */}
            {pixKeys.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center py-10 space-y-5"
              >
                <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <Landmark className="w-7 h-7 text-amber-500" />
                </div>
                <div className="text-center space-y-1.5">
                  <h3 className="text-base font-bold text-foreground">
                    Configure sua conta primeiro
                  </h3>
                  <p className="text-xs text-muted-foreground/60 max-w-[260px] mx-auto leading-relaxed">
                    Para realizar saques, cadastre sua conta bancária com dados de PIX nas configurações.
                  </p>
                </div>
                <button
                  onClick={() => onNavigate?.("configuracoes")}
                  className={cn(
                    "flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all",
                    "bg-foreground text-background hover:opacity-90"
                  )}
                >
                  <Settings2 className="w-4 h-4" />
                  Ir para Configurações
                </button>
              </motion.div>
            ) : (
              <>
                {/* Conta bancária selecionada */}
                <div className="space-y-3">
                  <p className="text-[11px] text-muted-foreground/40 font-medium tracking-wide">
                    Conta de destino
                  </p>

                  {selectedPixKey && (
                    <div className="rounded-2xl border border-border/20 bg-foreground/[0.02] p-5 space-y-3">
                      <div className="flex items-center gap-3.5">
                        {/* Ícone do banco */}
                         <div className="w-12 h-12 rounded-[16px] bg-foreground/[0.04] border border-border/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                           {selectedPixKey.instituicao && getBancoLogo(selectedPixKey.instituicao) ? (
                             <img src={getBancoLogo(selectedPixKey.instituicao)} alt="" className="w-8 h-8 object-contain" />
                           ) : (
                             <Landmark className="w-5 h-5 text-foreground/40" />
                           )}
                         </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] font-bold text-foreground truncate">
                            {selectedPixKey.instituicao
                              ? getBancoName(selectedPixKey.instituicao)
                              : (selectedPixKey.apelido || "Conta PIX")}
                          </p>
                          {selectedPixKey.nome_titular && (
                            <p className="text-[12px] text-muted-foreground/50 truncate mt-0.5">
                              {selectedPixKey.nome_titular}
                            </p>
                          )}
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] text-muted-foreground/30">
                              {pixTypeLabel[selectedPixKey.tipo] || selectedPixKey.tipo}
                            </span>
                            <span className="text-[10px] text-muted-foreground/20">·</span>
                            <span className="text-[10px] text-muted-foreground/30 font-mono truncate">
                              {selectedPixKey.chave}
                            </span>
                          </div>
                        </div>

                        <div className="flex-shrink-0">
                          <span className="text-[9px] bg-emerald-500/10 text-emerald-500 px-2 py-1 rounded-md font-semibold uppercase tracking-wider">
                            Verificada
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Trocar conta se tiver mais de uma */}
                  {pixKeys.length > 1 && (
                    <div className="space-y-1">
                      {pixKeys.filter(k => k.id !== selectedPixKey?.id).map((pk) => (
                        <button
                          key={pk.id}
                          onClick={() => setSelectedPixKey(pk)}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-foreground/[0.03] transition-all"
                        >
                           <div className="w-9 h-9 rounded-xl bg-foreground/[0.03] border border-border/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                             {pk.instituicao && getBancoLogo(pk.instituicao) ? (
                               <img src={getBancoLogo(pk.instituicao)} alt="" className="w-6 h-6 object-contain" />
                             ) : (
                               <Landmark className="w-4 h-4 text-foreground/25" />
                             )}
                           </div>
                          <div className="flex-1 text-left min-w-0">
                            <p className="text-[13px] font-medium text-foreground/70 truncate">
                              {pk.instituicao ? getBancoName(pk.instituicao) : (pk.apelido || "Conta PIX")}
                            </p>
                            <p className="text-[10px] text-muted-foreground/30 truncate font-mono">
                              {pk.chave}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground/15" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Botão Sacar */}
                <div className="pt-2">
                  <button
                    onClick={() => setStep("amount")}
                    className={cn(
                      "w-full h-12 rounded-2xl text-sm font-bold transition-all duration-200",
                      "bg-foreground text-background hover:opacity-90"
                    )}
                  >
                    Sacar
                  </button>
                </div>

                {/* Histórico resumido */}
                {saques.length > 0 && (
                  <div className="space-y-3 pt-4">
                    <p className="text-[11px] text-muted-foreground/40 font-medium tracking-wide">
                      Últimos saques
                    </p>
                    <div className="space-y-0.5">
                      {saques.slice(0, 5).map((s) => {
                        const cfg = statusConfig[s.status] || statusConfig.pendente;
                        const StatusIcon = cfg.icon;
                        return (
                          <div
                            key={s.id}
                            className="flex items-center justify-between py-3 px-1"
                          >
                            <div className="flex items-center gap-3">
                              <StatusIcon className={cn("w-4 h-4", cfg.color)} />
                              <div>
                                <p className="text-sm font-semibold text-foreground tabular-nums">
                                  R$ {s.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                </p>
                                <p className="text-[10px] text-muted-foreground/40">
                                  {format(new Date(s.created_at), "dd MMM · HH:mm", { locale: ptBR })}
                                </p>
                              </div>
                            </div>
                            <span className={cn("text-[10px] font-semibold uppercase tracking-wider", cfg.color)}>
                              {cfg.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}

        {/* ═══════════════════════════════════
           STEP 2 — Valor do saque
        ═══════════════════════════════════ */}
        {step === "amount" && (
          <motion.div
            key="amount"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col min-h-[420px]"
          >
            {/* Saldo pill */}
            <div className="flex justify-end pt-4 mb-4">
              <button
                onClick={() => setShowBalance(!showBalance)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-foreground/[0.04] border border-border/10 hover:bg-foreground/[0.07] transition-all group"
              >
                <span className="text-[10px] text-muted-foreground/40 font-medium">Saldo</span>
                <span className="text-[11px] font-semibold text-muted-foreground/50 tabular-nums">
                  {showBalance
                    ? `R$ ${saldoDisponivel.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                    : "••••••"}
                </span>
                <div className="w-5 h-5 rounded-full bg-foreground/[0.06] flex items-center justify-center">
                  {showBalance ? (
                    <EyeOff className="w-2.5 h-2.5 text-muted-foreground/30 group-hover:text-muted-foreground/50 transition-colors" />
                  ) : (
                    <Eye className="w-2.5 h-2.5 text-muted-foreground/30 group-hover:text-muted-foreground/50 transition-colors" />
                  )}
                </div>
              </button>
            </div>

            {/* Input escondido */}
            <input
              id="saque-valor-input"
              ref={(el) => { if (el) setTimeout(() => el.focus(), 100); }}
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              autoFocus
              value={valor}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                setValor(digits.slice(0, 10));
              }}
              style={{ position: "fixed", left: "-9999px", top: "-9999px", opacity: 0 }}
              aria-hidden="true"
            />

            {/* Display formatado */}
            <div
              className="flex-1 flex items-center justify-center cursor-text"
              onClick={() => {
                const inp = document.getElementById("saque-valor-input") as HTMLInputElement | null;
                if (inp) { inp.focus(); inp.click(); }
              }}
              onTouchStart={() => {
                const inp = document.getElementById("saque-valor-input") as HTMLInputElement | null;
                if (inp) { inp.focus(); }
              }}
            >
              <p
                className="font-extrabold tabular-nums tracking-tight select-none text-center pointer-events-none"
                style={{ fontSize: "clamp(42px, 13vw, 68px)", lineHeight: 1 }}
              >
                <span className="text-foreground/20">R$ </span>
                <span className={valorNum > 0 ? "text-foreground" : "text-foreground/20"}>
                  {formatCurrency(valor)}
                </span>
              </p>
            </div>

            {/* Erro de saldo */}
            {valorNum > 0 && valorNum > saldoDisponivel && (
              <div className="flex justify-center mb-2">
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Saldo insuficiente
                </p>
              </div>
            )}

            {/* Botão Continuar */}
            <div className="w-full mt-auto pt-6 pb-2">
              <button
                onClick={handleContinueToConfirm}
                disabled={valorNum <= 0 || valorNum > saldoDisponivel}
                className={cn(
                  "w-full h-12 rounded-2xl text-sm font-bold transition-all duration-300",
                  valorNum > 0 && valorNum <= saldoDisponivel
                    ? "bg-foreground text-background hover:opacity-90"
                    : "bg-foreground/[0.06] text-muted-foreground/20 cursor-default"
                )}
              >
                Continuar
              </button>
            </div>
          </motion.div>
        )}

        {/* ═══════════════════════════════════
           STEP 3 — Confirmação detalhada
        ═══════════════════════════════════ */}
        {step === "confirm" && selectedPixKey && (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col min-h-[420px]"
          >
            {/* Valor principal */}
            <div className="text-center pt-8 pb-6">
              <p className="text-4xl font-extrabold text-foreground tabular-nums">
                R$ {valorNum.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            </div>

            {/* Dados clean */}
            <div className="space-y-4 px-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground/40">Método</span>
                <span className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5">
                  <img src={pixLogo} alt="PIX" className="w-3.5 h-3.5" />
                  PIX
                </span>
              </div>

              <div className="w-full h-px bg-border/5" />

              {selectedPixKey.instituicao && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground/40">Banco</span>
                    <span className="text-xs font-semibold text-foreground/80">
                      {getBancoName(selectedPixKey.instituicao)}
                    </span>
                  </div>
                  <div className="w-full h-px bg-border/5" />
                </>
              )}

              {selectedPixKey.nome_titular && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground/40">Titular</span>
                    <span className="text-xs font-semibold text-foreground/80">
                      {selectedPixKey.nome_titular}
                    </span>
                  </div>
                  <div className="w-full h-px bg-border/5" />
                </>
              )}

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground/40">Tipo</span>
                <span className="text-xs font-semibold text-foreground/80">
                  {pixTypeLabel[selectedPixKey.tipo] || selectedPixKey.tipo}
                </span>
              </div>

              <div className="w-full h-px bg-border/5" />

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground/40">Destino</span>
                <span className="text-xs font-semibold text-foreground/80 max-w-[60%] truncate text-right font-mono">
                  {selectedPixKey.chave}
                </span>
              </div>

              <div className="w-full h-px bg-border/5" />

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground/40">Tempo</span>
                <span className="text-xs font-semibold text-emerald-500">Instantâneo</span>
              </div>
            </div>

            {/* Botão confirmar */}
            <div className="mt-auto pt-10 pb-2">
              <button
                onClick={handleConfirmClick}
                disabled={submitting}
                className={cn(
                  "w-full h-12 rounded-2xl text-sm font-bold transition-all duration-200",
                  "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                )}
              >
                {submitting ? (
                  <div className="w-5 h-5 border-2 border-primary-foreground/20 border-t-primary-foreground rounded-full animate-spin mx-auto" />
                ) : (
                  "Confirmar"
                )}
              </button>
            </div>
          </motion.div>
        )}

        {/* ═══════════════════════════════════
           STEP 4 — PIN de segurança
        ═══════════════════════════════════ */}
        {step === "pin" && (
          <motion.div
            key="pin"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col items-center py-8 space-y-6"
          >
            <div className="w-16 h-16 rounded-2xl bg-foreground/[0.03] border border-border/20 flex items-center justify-center">
              <Lock className="w-7 h-7 text-muted-foreground/40" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-foreground">Confirme seu PIN</h3>
              <p className="text-xs text-muted-foreground/50">
                Digite o PIN financeiro para autorizar
              </p>
            </div>

            {/* Campos PIN */}
            <motion.div
              animate={{
                x: pinShake ? [0, -12, 12, -8, 8, -4, 4, 0] : 0,
              }}
              transition={{ x: { duration: 0.5, ease: "easeOut" } }}
              className="flex items-center gap-3"
            >
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="relative">
                  <input
                    ref={(el) => { pinRefs.current[i] = el; }}
                    type="password"
                    inputMode="numeric"
                    maxLength={1}
                    value={pinDigits[i]}
                    onChange={(e) => handlePinDigit(i, e.target.value)}
                    onKeyDown={(e) => handlePinKeyDown(i, e)}
                    className={cn(
                      "w-14 h-16 text-center text-2xl font-bold rounded-2xl outline-none transition-all duration-200 caret-transparent",
                      "bg-foreground/[0.03] border-2",
                      "focus:border-foreground/30 focus:bg-foreground/[0.06]",
                      pinError
                        ? "border-destructive/50 bg-destructive/5"
                        : pinDigits[i]
                        ? "border-foreground/20 bg-foreground/[0.05]"
                        : "border-border/20"
                    )}
                  />
                  {pinDigits[i] && !pinError && (
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

            <AnimatePresence>
              {pinError && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="flex items-center gap-2 text-destructive"
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">PIN incorreto</span>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              onClick={() => setStep("confirm")}
              className="text-xs text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            >
              Voltar
            </button>
          </motion.div>
        )}

        {/* ═══════════════════════════════════
           STEP 5 — Sucesso
        ═══════════════════════════════════ */}
        {step === "success" && (
          <motion.div
            key="success"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="flex flex-col min-h-[480px]"
          >
            <div className="text-center pt-10 pb-2">
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.15 }}
                className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-5"
              >
                <CheckCircle2 className="w-7 h-7 text-emerald-500" />
              </motion.div>
              <p className="text-[11px] font-semibold tracking-widest uppercase text-emerald-500/80 mb-1">
                Transferência enviada
              </p>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.3 }}
              className="text-center pb-8"
            >
              <p
                className="font-extrabold tabular-nums tracking-tight text-foreground"
                style={{ fontSize: "clamp(36px, 11vw, 56px)", lineHeight: 1 }}
              >
                R$ {valorNum.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            </motion.div>

            {/* Detalhes da transferência */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.3 }}
              className="mx-1 rounded-2xl border border-border/10 bg-foreground/[0.02] overflow-hidden"
            >
              <div className="px-5 py-4 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground/45 font-medium">Método</span>
                <span className="text-[11px] font-semibold text-foreground/75 flex items-center gap-1.5">
                  <img src={pixLogo} alt="PIX" className="w-3.5 h-3.5" />
                  PIX
                </span>
              </div>
              {selectedPixKey?.instituicao && (
                <>
                  <div className="w-full h-px bg-border/5" />
                  <div className="px-5 py-4 flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground/45 font-medium">Banco</span>
                    <span className="text-[11px] font-semibold text-foreground/75">
                      {getBancoName(selectedPixKey.instituicao)}
                    </span>
                  </div>
                </>
              )}
              {selectedPixKey?.nome_titular && (
                <>
                  <div className="w-full h-px bg-border/5" />
                  <div className="px-5 py-4 flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground/45 font-medium">Titular</span>
                    <span className="text-[11px] font-semibold text-foreground/75">
                      {selectedPixKey.nome_titular}
                    </span>
                  </div>
                </>
              )}
              <div className="w-full h-px bg-border/5" />
              <div className="px-5 py-4 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground/45 font-medium">Destino</span>
                <span className="text-[11px] font-semibold text-foreground/75 max-w-[55%] truncate text-right font-mono tracking-wide">
                  {selectedPixKey?.chave}
                </span>
              </div>
              <div className="w-full h-px bg-border/5" />
              <div className="px-5 py-4 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground/45 font-medium">Status</span>
                <span className="text-[11px] font-semibold text-emerald-500 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Processando
                </span>
              </div>
            </motion.div>

            {/* Botão concluir */}
            <div className="mt-auto pt-8 pb-2">
              <button
                onClick={() => {
                  setStep("overview");
                  setValor("");
                  setPinDigits(["", "", "", ""]);
                }}
                className="w-full h-12 rounded-2xl text-sm font-bold bg-foreground text-background hover:opacity-90 transition-all duration-200"
              >
                Concluir
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
