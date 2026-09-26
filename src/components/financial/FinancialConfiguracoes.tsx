import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Trash2,
  CheckCircle2,
  Landmark,
  Key,
  Building2,
  User,
  Mail,
  Phone,
  Hash,
  ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { FinancialRole } from "./FinancialModule";
import { useFinancialConfiguracoes } from "@/hooks/useFinancialConfiguracoes";
import { useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { getBancoName, getBancoLogo } from "@/lib/bankLogos";

interface Props {
  role: FinancialRole;
  userId?: string;
  barbeiroId?: string | null;
  onBackConfigChange?: (config: { label: string; action: () => void } | null) => void;
}

const pixTipoOptions = [
  { value: "cpf", label: "CPF", placeholder: "000.000.000-00", icon: User, inputMode: "numeric" as const },
  { value: "cnpj", label: "CNPJ", placeholder: "00.000.000/0000-00", icon: Building2, inputMode: "numeric" as const },
  { value: "email", label: "E-mail", placeholder: "email@exemplo.com", icon: Mail, inputMode: "email" as const },
  { value: "telefone", label: "Telefone", placeholder: "+55 (11) 99999-9999", icon: Phone, inputMode: "tel" as const },
  { value: "aleatoria", label: "Aleatória", placeholder: "Cole sua chave aleatória", icon: Hash, inputMode: "text" as const },
] as const;

type PixTipo = (typeof pixTipoOptions)[number]["value"];
type Screen = "list" | "select" | "new";

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function formatCpf(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatCnpj(value: string) {
  const digits = onlyDigits(value).slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\/\d{4})(\d)/, "$1-$2");
}

function formatTelefone(value: string) {
  const digits = onlyDigits(value).slice(0, 13);
  if (!digits) return "";
  if (digits.length <= 2) return `+${digits}`;
  if (digits.length <= 4) return `+${digits.slice(0, 2)} (${digits.slice(2)}`;
  if (digits.length <= 9) return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4)}`;
  return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
}

function formatPixKeyInput(tipo: PixTipo, value: string) {
  switch (tipo) {
    case "cpf":
      return formatCpf(value);
    case "cnpj":
      return formatCnpj(value);
    case "telefone":
      return formatTelefone(value);
    case "email":
      return value.replace(/\s+/g, "").toLowerCase();
    case "aleatoria":
    default:
      return value.trim();
  }
}

function normalizePixKey(tipo: PixTipo, value: string) {
  switch (tipo) {
    case "cpf":
    case "cnpj":
      return onlyDigits(value);
    case "telefone": {
      const digits = onlyDigits(value);
      return digits ? `+${digits}` : "";
    }
    case "email":
      return value.trim().toLowerCase();
    case "aleatoria":
    default:
      return value.trim();
  }
}

function isPixKeyComplete(tipo: PixTipo, value: string) {
  const normalized = normalizePixKey(tipo, value);
  switch (tipo) {
    case "cpf":
      return normalized.length === 11;
    case "cnpj":
      return normalized.length === 14;
    case "telefone":
      return normalized.length >= 12 && normalized.length <= 14;
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
    case "aleatoria":
      return normalized.length >= 8;
    default:
      return false;
  }
}

function detectPixTipo(value: string): PixTipo {
  const trimmed = value.trim();
  if (!trimmed) return "cpf";
  if (trimmed.includes("@")) return "email";
  // UUID v4 format → chave aleatória
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(trimmed)) {
    return "aleatoria";
  }
  // Se contém letras (fora de hífen/dígitos), é aleatória
  if (/[a-zA-Z]/.test(trimmed)) return "aleatoria";
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "aleatoria";
  // Telefone: começa com + ou tem 12-13 dígitos (DDI+DDD+número)
  if (trimmed.startsWith("+") || digits.length >= 12) return "telefone";
  if (digits.length <= 11) return "cpf";
  return "cnpj";
}

function getPixValidationMessage(tipo: PixTipo) {
  switch (tipo) {
    case "cpf":
      return "Informe um CPF válido";
    case "cnpj":
      return "Informe um CNPJ válido";
    case "telefone":
      return "Informe um telefone PIX válido com DDI";
    case "email":
      return "Informe um e-mail válido";
    case "aleatoria":
      return "Informe a chave aleatória completa";
    default:
      return "Informe uma chave PIX válida";
  }
}

export function FinancialConfiguracoes({ role, userId, barbeiroId, onBackConfigChange }: Props) {
  const queryClient = useQueryClient();
  const { data, isLoading: loading } = useFinancialConfiguracoes(role, userId, barbeiroId);

  const pixKeys = data?.pixKeys ?? [];
  const hasPendingData = data?.hasPendingData ?? false;

  const [screen, setScreen] = useState<Screen>("list");
  const [submitting, setSubmitting] = useState(false);
  const [formTipo, setFormTipo] = useState<PixTipo>("cpf");
  const [formChave, setFormChave] = useState("");

  const selectedTipo = pixTipoOptions.find((item) => item.value === formTipo) ?? pixTipoOptions[0];
  const normalizedChave = normalizePixKey(formTipo, formChave);
  const canSubmit = isPixKeyComplete(formTipo, formChave);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.financeiro.configuracoes(userId ?? "") });
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.financeiro.overview(userId ?? "") });
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.financeiro.saque(userId ?? "") });
  };

  useEffect(() => {
    if (!loading && pixKeys.length === 0 && screen === "list") {
      setScreen("select");
    }
  }, [loading, pixKeys.length, screen]);

  useEffect(() => {
    if (screen === "select" && pixKeys.length > 0) {
      onBackConfigChange?.({
        label: "Banco",
        action: () => {
          setScreen("list");
          setFormTipo("cpf");
          setFormChave("");
        },
      });
    } else if (screen === "new") {
      onBackConfigChange?.({
        label: "Voltar",
        action: () => {
          setScreen("select");
          setFormChave("");
        },
      });
    } else {
      onBackConfigChange?.(null);
    }

    return () => onBackConfigChange?.(null);
  }, [screen, onBackConfigChange, pixKeys.length]);

  const handleAddPixKey = async () => {
    if (!userId) return;
    if (!canSubmit) {
      toast.error(getPixValidationMessage(formTipo));
      return;
    }

    setSubmitting(true);
    try {
      const isFirst = pixKeys.length === 0;
      const { data: response, error } = await supabase.functions.invoke("encrypt-pix-key", {
        body: {
          tipo: formTipo,
          chave: normalizedChave,
          apelido: null,
          is_default: isFirst,
          barbeiro_id: barbeiroId || null,
        },
      });

      if (error) throw error;
      if (response?.error) throw new Error(response.error);

      toast.success("Chave PIX cadastrada com sucesso");
      setScreen("list");
      setFormTipo("cpf");
      setFormChave("");
      invalidate();
    } catch (err: any) {
      toast.error(err.message || "Erro ao cadastrar chave PIX");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("chaves_pix").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao remover chave PIX");
    } else {
      toast.success("Chave PIX removida");
      invalidate();
    }
  };

  const handleSetDefault = async (id: string) => {
    await supabase.from("chaves_pix").update({ is_default: false }).eq("user_id", userId!);
    await supabase.from("chaves_pix").update({ is_default: true }).eq("id", id);
    toast.success("Chave padrão atualizada");
    invalidate();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-7 h-7 border-2 border-foreground/10 border-t-foreground/60 rounded-full animate-spin" />
      </div>
    );
  }

  if (screen === "select") {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="select-pix-tipo"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.2 }}
          className="space-y-8"
        >
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground/50 mb-3 px-1">
              Tipo de chave
            </p>
              <p className="text-[14px] text-muted-foreground/70 mb-8 px-1 leading-relaxed">
                Escolha a chave PIX que será usada como destino dos seus saques.
              </p>

            <div className="divide-y divide-border/15">
              {pixTipoOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    onClick={() => {
                      setFormTipo(option.value);
                      setFormChave("");
                      setScreen("new");
                    }}
                    className="w-full flex items-center gap-5 px-1 py-6 text-left hover:bg-secondary/20 active:bg-secondary/30 transition-all"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-secondary/50 flex items-center justify-center shrink-0">
                      <Icon className="w-7 h-7 text-foreground/80" strokeWidth={1.7} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-foreground leading-tight">
                        {option.label}
                      </p>
                      <p className="text-[12px] text-muted-foreground/60 mt-1 leading-snug truncate">
                        {option.placeholder}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground/40 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  if (screen === "new") {
    const SelectedIcon = selectedTipo.icon;
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="new-pix-key"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.2 }}
          className="space-y-4 pb-24"
        >
          <p className="text-xs font-extralight text-muted-foreground">
            Digite sua chave {selectedTipo.label} para receber seus saques via PIX.
          </p>

          <div className="relative">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center text-muted-foreground/60 pointer-events-none">
              <SelectedIcon className="w-4 h-4" />
            </div>
            <Input
              value={formChave}
              onChange={(e) => {
                setFormChave(formatPixKeyInput(formTipo, e.target.value));
              }}
              placeholder={selectedTipo.placeholder}
              inputMode={selectedTipo.inputMode}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              className="h-12 pl-10 pr-4 rounded-xl border-border/30 bg-background focus:border-border/60"
            />
          </div>

          <div
            className="fixed left-0 right-0 px-4 z-50"
            style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
          >
            <div className="max-w-md mx-auto">
              <Button
                onClick={handleAddPixKey}
                disabled={submitting || !canSubmit}
                className="w-full h-12 rounded-xl bg-foreground text-background hover:bg-foreground/90 font-semibold text-sm shadow-lg transition-colors"
              >
                {submitting ? "Salvando..." : "Finalizar cadastro"}
              </Button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <div className="space-y-6 px-1">
      <p className="text-xs font-extralight text-muted-foreground">
        Suas chaves PIX disponíveis para saque e transferência do saldo.
      </p>

      <div className="border-t border-border/20" />

      {role === "barber" && hasPendingData && (
        <div className="rounded-xl p-4 border border-amber-500/20 bg-amber-500/5 space-y-1.5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-500/10">
              <Landmark className="w-4 h-4 text-amber-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Dados pessoais incompletos</p>
              <p className="text-[11px] text-muted-foreground">
                Complete CPF e email em "Meus Dados" para ativar a conta financeira.
              </p>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setScreen("select")}
        className="w-full py-3.5 rounded-xl border border-dashed border-border/40 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-border/60 transition-colors"
      >
        + Nova chave PIX
      </button>

      {pixKeys.length > 0 ? (
        <div className="space-y-3">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest">
            Chaves cadastradas ({pixKeys.length})
          </p>
          <div className="space-y-2">
            {pixKeys.map((pk) => {
              const tipoInfo = pixTipoOptions.find((t) => t.value === pk.tipo);
              const TipoIcon = tipoInfo?.icon || Hash;
              const title = pk.apelido || (pk.instituicao ? getBancoName(pk.instituicao) : `Chave PIX ${tipoInfo?.label ?? ""}`.trim());

              return (
                <div
                  key={pk.id}
                  className="group rounded-xl border border-border/20 bg-secondary/5 hover:bg-secondary/10 transition-colors overflow-hidden"
                >
                  <div className="flex items-center gap-3.5 px-4 py-3.5">
                    <div className="w-11 h-11 rounded-[14px] bg-foreground/[0.04] border border-border/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {pk.instituicao && getBancoLogo(pk.instituicao) ? (
                        <img src={getBancoLogo(pk.instituicao)} alt={getBancoName(pk.instituicao)} className="w-7 h-7 object-contain" />
                      ) : (
                        <TipoIcon className="w-[18px] h-[18px] text-foreground/40" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground truncate">{title}</p>
                        {pk.is_default && (
                          <span className="text-[9px] bg-foreground text-background px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider flex-shrink-0">
                            Padrão
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <TipoIcon className="w-3 h-3 text-muted-foreground/40" />
                        <p className="text-[10px] text-muted-foreground/50 truncate font-mono tracking-wide">
                          {pk.chave}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!pk.is_default && (
                        <button
                          onClick={() => handleSetDefault(pk.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 hover:bg-foreground/10 transition-all"
                          title="Definir como padrão"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-foreground/60" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(pk.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-all"
                        title="Remover"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive/50" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center py-12">
          <Key className="w-10 h-10 mx-auto text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">Nenhuma chave PIX cadastrada</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Cadastre sua chave para receber os pagamentos automaticamente
          </p>
        </div>
      )}
    </div>
  );
}
