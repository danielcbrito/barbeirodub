import { useState, useEffect } from "react";
import { ScheduleHeader } from "@/components/shared/ScheduleHeader";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  fetchBarberPaymentMethods,
  saveBarberPaymentMethods,
  BarberPaymentMethods,
} from "@/lib/barberPaymentMethods";
import {
  fetchBarberCancellationFee,
  saveBarberCancellationFee,
  BarberCancellationFeeConfig,
  fetchBarberPendingCancellationDebts,
  ClienteDebitoCancelamento,
} from "@/lib/barberCancellationFee";
import {
  Loader2,
  Store,
  ChevronRight,
  Percent,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  Users,
  ShieldCheck,
  Info,
} from "lucide-react";
import pixLogo from "@/assets/pix-logo.png";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { BarberDebitosPendentesModal } from "./BarberDebitosPendentesModal";

interface BarberFormasPagamentoProps {
  barbeiroId: string;
  userId?: string | null;
  tenantId?: string | null;
  onBack: () => void;
}

export function BarberFormasPagamento({
  barbeiroId,
  userId,
  tenantId,
  onBack,
}: BarberFormasPagamentoProps) {
  // Visão atual: "main" (lista) ou "cancellation-fee" (sub-tela de taxa)
  const [view, setView] = useState<"main" | "cancellation-fee">("main");

  // ── Formas de pagamento
  const [methods, setMethods] = useState<BarberPaymentMethods>({
    pix: true,
    barbearia: true,
  });
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<"pix" | "barbearia" | null>(null);

  // ── Taxa de cancelamento salva no banco
  const [feeConfig, setFeeConfig] = useState<BarberCancellationFeeConfig>({
    habilitado: false,
    tipo: "porcentagem",
    valor: 20,
    horas_antecedencia: 2,
  });

  // ── Rascunho editável da taxa na sub-tela
  const [draftFeeConfig, setDraftFeeConfig] = useState<BarberCancellationFeeConfig>({
    habilitado: false,
    tipo: "porcentagem",
    valor: 20,
    horas_antecedencia: 2,
  });

  // Valor digitado no campo de texto
  const [inputValue, setInputValue] = useState<string>("20");
  const [savingFee, setSavingFee] = useState(false);

  // Modal com o aviso estratégico explicando a regra de cancelamento
  const [showExplainModal, setShowExplainModal] = useState(false);

  // Modal de gerenciamento de taxas pendentes de clientes
  const [showDebtsModal, setShowDebtsModal] = useState(false);
  const [pendingDebtsCount, setPendingDebtsCount] = useState<number>(0);

  // Carrega configurações do banco de dados ao montar
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const [paymentData, feeData, debtsData] = await Promise.all([
          fetchBarberPaymentMethods(barbeiroId, tenantId),
          fetchBarberCancellationFee(barbeiroId, tenantId),
          fetchBarberPendingCancellationDebts(barbeiroId, tenantId),
        ]);

        if (mounted) {
          setMethods(paymentData);
          setFeeConfig(feeData);
          setDraftFeeConfig(feeData);
          setInputValue(String(feeData.valor ?? (feeData.tipo === "porcentagem" ? 20 : 15)));
          setPendingDebtsCount(debtsData.length);
        }
      } catch (err) {
        console.error("Erro ao carregar configurações de pagamento:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [barbeiroId, tenantId]);

  // Sincroniza rascunho toda vez que entra na sub-tela
  const handleOpenCancellationFeeView = () => {
    setDraftFeeConfig(feeConfig);
    setInputValue(String(feeConfig.valor ?? (feeConfig.tipo === "porcentagem" ? 20 : 15)));
    setView("cancellation-fee");
  };

  // Handler para alternar formas de pagamento na tela principal
  const handleTogglePaymentMethod = async (key: "pix" | "barbearia", nextVal: boolean) => {
    const otherKey = key === "pix" ? "barbearia" : "pix";
    if (!nextVal && !methods[otherKey]) {
      toast.warning("Mantenha ao menos uma forma de pagamento ativa para permitir agendamentos.");
      return;
    }

    const previous = { ...methods };
    const updated = { ...methods, [key]: nextVal };

    setMethods(updated);
    setSavingKey(key);

    try {
      await saveBarberPaymentMethods({
        barbeiroId,
        userId,
        tenantId,
        pix: updated.pix,
        barbearia: updated.barbearia,
      });
      toast.success(
        nextVal
          ? `${key === "pix" ? "Pix" : "Pagamento na barbearia"} ativado!`
          : `${key === "pix" ? "Pix" : "Pagamento na barbearia"} desativado!`
      );
    } catch (err: any) {
      setMethods(previous);
      toast.error(err?.message || "Erro ao salvar no banco de dados. Tente novamente.");
    } finally {
      setSavingKey(null);
    }
  };

  // Alternar entre Porcentagem (%) e Valor fixo (R$) no rascunho
  const handleSwitchDraftTipo = (novoTipo: "porcentagem" | "fixo") => {
    if (novoTipo === draftFeeConfig.tipo) return;
    const defaultVal = novoTipo === "porcentagem" ? 20 : 15;
    setDraftFeeConfig((prev) => ({ ...prev, tipo: novoTipo }));
    setInputValue(String(defaultVal));
  };

  // Detecta se há alterações pendentes no formulário
  const parsedInputVal = parseFloat(inputValue.replace(",", "."));
  const isValDirty =
    !isNaN(parsedInputVal) &&
    parsedInputVal > 0 &&
    parsedInputVal !== feeConfig.valor;
  const isHabilitadoDirty = draftFeeConfig.habilitado !== feeConfig.habilitado;
  const isTipoDirty = draftFeeConfig.tipo !== feeConfig.tipo;
  const hasChanges = isHabilitadoDirty || isTipoDirty || isValDirty;

  // Salvar rascunho no banco de dados e exibir a notificação explicativa
  const handleSaveFee = async () => {
    const num = parseFloat(inputValue.replace(",", "."));
    const cleanVal =
      isNaN(num) || num <= 0
        ? draftFeeConfig.tipo === "porcentagem"
          ? 20
          : 15
        : draftFeeConfig.tipo === "porcentagem"
        ? Math.min(100, Math.max(1, Math.round(num)))
        : Math.round(num * 100) / 100;

    const nextConfig: BarberCancellationFeeConfig = {
      ...draftFeeConfig,
      valor: cleanVal,
      horas_antecedencia: 2, // Regra fixa do sistema: gratuito até 2h antes
    };

    setSavingFee(true);

    try {
      await saveBarberCancellationFee({
        barbeiroId,
        tenantId,
        config: nextConfig,
      });

      setFeeConfig(nextConfig);
      setDraftFeeConfig(nextConfig);
      setInputValue(String(cleanVal));

      toast.success("Configurações de taxa salvas com sucesso!");
      setShowExplainModal(true);
    } catch (err: any) {
      console.error("Erro ao salvar taxa de cancelamento:", err);
      toast.error(err?.message || "Erro ao salvar taxa de cancelamento.");
    } finally {
      setSavingFee(false);
    }
  };

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* ═══ SUB-PÁGINA DEDICADA: CONFIGURAÇÃO DE TAXA DE CANCELAMENTO E FALTA ═══ */
  /* ═══════════════════════════════════════════════════════════════════════ */
  if (view === "cancellation-fee") {
    return (
      <div className="pb-16 min-h-app bg-background text-foreground">
        <ScheduleHeader
          title="Taxa de cancelamento e falta"
          onBack={() => setView("main")}
        />

        <div className="px-4 pt-2 max-w-md mx-auto space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="space-y-6"
          >
            {/* Card explicativo obrigatório da Regra do Sistema */}
            <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-primary shrink-0" />
                <h4 className="text-[13px] font-semibold text-foreground tracking-tight">
                  Regra do Sistema
                </h4>
              </div>
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                O cliente tem direito a <strong>cancelamento gratuito até 2 horas antes</strong> do horário marcado. Se o cliente cancelar faltando menos de 2 horas ou não comparecer (falta), a sua taxa será cobrada automaticamente.
              </p>
            </div>

            {/* Linha Principal: Ativar / Desativar a cobrança */}
            <div className="py-4 flex items-center justify-between gap-4 border-b border-border/25">
              <div className="min-w-0 pr-2">
                <p className="text-[13.5px] font-medium text-foreground leading-snug">
                  Cobrar taxa de cancelamento e falta
                </p>
                <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
                  Aplica taxa configurada caso o cliente desmarque tardiamente ou não compareça.
                </p>
              </div>
              <Switch
                checked={draftFeeConfig.habilitado}
                onCheckedChange={(val) =>
                  setDraftFeeConfig((prev) => ({ ...prev, habilitado: val }))
                }
                disabled={savingFee}
                className="data-[state=checked]:bg-black dark:data-[state=checked]:bg-white shrink-0"
                aria-label="Cobrar taxa de cancelamento e falta"
              />
            </div>

            {/* Configurações ativas (quando habilitado) */}
            <AnimatePresence>
              {draftFeeConfig.habilitado && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="space-y-5 overflow-hidden pt-1"
                >
                  {/* 1. Tipo de cobrança: Porcentagem ou Valor Fixo */}
                  <div className="space-y-2">
                    <label className="text-[13px] font-medium text-foreground block">
                      Tipo de cobrança
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleSwitchDraftTipo("porcentagem")}
                        className={cn(
                          "h-11 rounded-xl text-[12.5px] font-medium transition-all flex items-center justify-center gap-1.5 border",
                          draftFeeConfig.tipo === "porcentagem"
                            ? "bg-black text-white dark:bg-white dark:text-black border-transparent font-semibold shadow-xs"
                            : "bg-card text-muted-foreground border-border/40 hover:text-foreground"
                        )}
                      >
                        <Percent className="w-3.5 h-3.5" />
                        <span>Porcentagem (%)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSwitchDraftTipo("fixo")}
                        className={cn(
                          "h-11 rounded-xl text-[12.5px] font-medium transition-all flex items-center justify-center gap-1.5 border",
                          draftFeeConfig.tipo === "fixo"
                            ? "bg-black text-white dark:bg-white dark:text-black border-transparent font-semibold shadow-xs"
                            : "bg-card text-muted-foreground border-border/40 hover:text-foreground"
                        )}
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>Valor fixo (R$)</span>
                      </button>
                    </div>
                  </div>

                  {/* 2. Campo de digitação de valor */}
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-medium text-foreground block">
                      {draftFeeConfig.tipo === "porcentagem"
                        ? "Porcentagem da taxa (%)"
                        : "Valor fixo da taxa (R$)"}
                    </label>

                    <div className="relative w-full">
                      {draftFeeConfig.tipo === "fixo" && (
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[15px] font-medium text-muted-foreground pointer-events-none">
                          R$
                        </span>
                      )}
                      <input
                        type="number"
                        inputMode="decimal"
                        min="1"
                        max={draftFeeConfig.tipo === "porcentagem" ? "100" : "500"}
                        step={draftFeeConfig.tipo === "porcentagem" ? "1" : "0.5"}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder={draftFeeConfig.tipo === "porcentagem" ? "20" : "15"}
                        className={cn(
                          "w-full h-12 rounded-xl bg-card border border-border/60 text-[16px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-foreground transition-all tabular-nums",
                          draftFeeConfig.tipo === "fixo" ? "pl-11 pr-4" : "pl-4 pr-10"
                        )}
                      />
                      {draftFeeConfig.tipo === "porcentagem" && (
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[15px] font-medium text-muted-foreground pointer-events-none">
                          %
                        </span>
                      )}
                    </div>

                    <p className="text-[11.5px] text-muted-foreground pt-0.5 leading-relaxed">
                      {draftFeeConfig.tipo === "porcentagem"
                        ? "Calculada automaticamente sobre o valor original do serviço agendado (ex: 20%)."
                        : "Valor fixo cobrado por cancelamento com menos de 2h ou falta (ex: R$ 15,00)."}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Botão de Salvar — surge quando houver alterações */}
            <AnimatePresence>
              {hasChanges && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.16 }}
                  className="pt-3"
                >
                  <button
                    type="button"
                    onClick={handleSaveFee}
                    disabled={savingFee}
                    className="w-full h-12 rounded-xl bg-black text-white dark:bg-white dark:text-black font-semibold text-[13.5px] flex items-center justify-center gap-2 shadow-xs active:scale-[0.99] transition-all disabled:opacity-50"
                  >
                    {savingFee ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <span>Salvar alterações</span>
                    )}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Modal explicativo das regras */}
        <AnimatePresence>
          {showExplainModal && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
              <div
                className="absolute inset-0"
                onClick={() => {
                  setShowExplainModal(false);
                  setView("main");
                }}
              />
              <motion.div
                initial={{ y: "100%", opacity: 0.5 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "100%", opacity: 0 }}
                transition={{ type: "spring", damping: 28, stiffness: 320 }}
                className="relative w-full sm:max-w-md rounded-t-[28px] sm:rounded-2xl border border-border/70 bg-card p-6 pb-8 sm:pb-6 shadow-2xl space-y-4 text-left"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                    <CheckCircle2 className="w-4 h-4 stroke-[2]" />
                  </div>
                  <div>
                    <h3 className="text-[15.5px] font-bold text-foreground tracking-tight">
                      Configuração Atualizada!
                    </h3>
                    <p className="text-[11.5px] text-muted-foreground">
                      Como a regra funciona para os clientes
                    </p>
                  </div>
                </div>

                <div className="divide-y divide-border/25 text-[12px] pt-1">
                  <div className="py-2.5 flex items-start gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                    <p className="text-foreground leading-relaxed">
                      <strong>Cancelamento gratuito:</strong> o cliente pode desmarcar gratuitamente até <strong>2 horas antes</strong> do horário marcado.
                    </p>
                  </div>

                  <div className="py-2.5 flex items-start gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                    <p className="text-foreground leading-relaxed">
                      <strong>Menos de 2 horas ou falta (no-show):</strong> é aplicada a sua taxa de{" "}
                      <strong>
                        {feeConfig.tipo === "porcentagem"
                          ? `${feeConfig.valor}% do valor do serviço`
                          : `R$ ${feeConfig.valor},00 fixo`}
                      </strong>.
                    </p>
                  </div>

                  <div className="py-2.5 flex items-start gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                    <p className="text-foreground leading-relaxed">
                      <strong>Pagamento via Pix:</strong> o sistema retém o valor da taxa e estorna o restante.
                    </p>
                  </div>

                  <div className="py-2.5 flex items-start gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-foreground/60 mt-1.5 shrink-0" />
                    <p className="text-foreground leading-relaxed">
                      <strong>Pagamento na barbearia:</strong> a taxa é lançada como pendência na conta do cliente e somada automaticamente no próximo agendamento dele.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowExplainModal(false);
                    setView("main");
                  }}
                  className="w-full h-11 rounded-xl bg-black text-white dark:bg-white dark:text-black font-semibold text-[13px] active:scale-[0.99] transition-all mt-2"
                >
                  Entendido
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* ═══ VISÃO PRINCIPAL: MÉTODOS DE RECEBIMENTO E POLÍTICAS DE TAXAS ═══ */
  /* ═══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="pb-12 min-h-app bg-background text-foreground">
      <ScheduleHeader title="Pagamentos e Taxas" onBack={onBack} />

      <div className="px-4 pt-3 max-w-md mx-auto space-y-4">
        {/* Descrição minimalista */}
        <p className="text-[12px] text-muted-foreground leading-relaxed px-1 font-light">
          Configure as formas de pagamento aceitas e as regras de cancelamento e falta. Suas preferências refletem no app do cliente em tempo real.
        </p>

        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="text-[12.5px] text-muted-foreground">Carregando opções...</span>
          </div>
        ) : (
          <div className="divide-y divide-border/25 pt-1">
            {/* Opção 1: Receber via Pix */}
            <div className="py-4 flex items-center justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0 pr-2">
                <img
                  src={pixLogo}
                  alt="Pix"
                  className="w-5 h-5 object-contain shrink-0 mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium text-foreground leading-snug">
                    Receber via Pix
                  </p>
                  <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
                    Ativa pagamentos antecipados via Pix no checkout do app do cliente (QR Code e Copia e Cola).
                  </p>
                </div>
              </div>
              <Switch
                checked={methods.pix}
                onCheckedChange={(val) => handleTogglePaymentMethod("pix", val)}
                disabled={savingKey !== null}
                className="data-[state=checked]:bg-black dark:data-[state=checked]:bg-white shrink-0"
                aria-label="Receber via Pix"
              />
            </div>

            {/* Opção 2: Pagamento na barbearia */}
            <div className="py-4 flex items-center justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0 pr-2">
                <Store className="w-5 h-5 stroke-[1.8] text-foreground shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium text-foreground leading-snug">
                    Pagamento na barbearia
                  </p>
                  <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
                    Permite que o cliente agende no app e realize o acerto presencialmente no balcão no dia do atendimento.
                  </p>
                </div>
              </div>
              <Switch
                checked={methods.barbearia}
                onCheckedChange={(val) => handleTogglePaymentMethod("barbearia", val)}
                disabled={savingKey !== null}
                className="data-[state=checked]:bg-black dark:data-[state=checked]:bg-white shrink-0"
                aria-label="Pagamento na barbearia"
              />
            </div>

            {/* Opção 3: Taxa de cancelamento e falta */}
            <button
              type="button"
              onClick={handleOpenCancellationFeeView}
              className="w-full py-4 flex items-center justify-between gap-4 text-left hover:opacity-80 active:opacity-60 transition-opacity group"
            >
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-2">
                  <p className="text-[13.5px] font-medium text-foreground leading-snug">
                    Taxa de cancelamento e falta
                  </p>
                  <span className="text-[11.5px] text-muted-foreground font-normal">
                    · {feeConfig.habilitado
                      ? feeConfig.tipo === "porcentagem"
                        ? `${feeConfig.valor}%`
                        : `R$ ${feeConfig.valor}`
                      : "Desativada"}
                  </span>
                </div>
                <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
                  Taxa cobrada caso o cliente cancele com menos de 2h ou falte ao atendimento marcado.
                </p>
              </div>
              <ChevronRight
                className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground transition-colors shrink-0"
                strokeWidth={1.8}
              />
            </button>

            {/* Opção 4: Gestão de Dívidas e Taxas Pendentes */}
            <button
              type="button"
              onClick={() => setShowDebtsModal(true)}
              className="w-full py-4 flex items-center justify-between gap-4 text-left hover:opacity-80 active:opacity-60 transition-opacity group"
            >
              <div className="flex items-start gap-3 min-w-0 pr-2">
                <Users className="w-5 h-5 text-foreground shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[13.5px] font-medium text-foreground leading-snug">
                      Clientes com taxas pendentes
                    </p>
                    {pendingDebtsCount > 0 ? (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[10.5px] font-semibold tabular-nums">
                        {pendingDebtsCount} {pendingDebtsCount === 1 ? "cliente" : "clientes"}
                      </span>
                    ) : (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                        Em dia
                      </span>
                    )}
                  </div>
                  <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
                    Visualize débitos pendentes de faltas/cancelamentos e libere clientes manualmente por cortesia.
                  </p>
                </div>
              </div>
              <ChevronRight
                className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground transition-colors shrink-0"
                strokeWidth={1.8}
              />
            </button>
          </div>
        )}

        {/* Rodapé com aviso da regra obrigatória */}
        <div className="p-3.5 rounded-xl border border-border/40 bg-secondary/20 space-y-1 text-left">
          <p className="text-[11.5px] font-medium text-foreground flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-foreground/70" />
            Regra garantida pelo sistema
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            O cancelamento gratuito até 2 horas de antecedência é garantido pelo sistema. Pelo menos um método de pagamento deve permanecer ativo para permitir novos agendamentos.
          </p>
        </div>
      </div>

      {/* Modal de Gestão de Débitos Pendentes */}
      <BarberDebitosPendentesModal
        open={showDebtsModal}
        onOpenChange={setShowDebtsModal}
        barbeiroId={barbeiroId}
        tenantId={tenantId}
        onDebtUpdated={() => {
          fetchBarberPendingCancellationDebts(barbeiroId, tenantId).then((debts) => {
            setPendingDebtsCount(debts.length);
          });
        }}
      />
    </div>
  );
}
