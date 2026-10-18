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
} from "@/lib/barberCancellationFee";
import {
  Loader2,
  QrCode,
  Store,
  Info,
  Ban,
  Percent,
  DollarSign,
  Clock,
  ShieldAlert,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  // ── Formas de pagamento
  const [methods, setMethods] = useState<BarberPaymentMethods>({
    pix: true,
    barbearia: true,
  });
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<"pix" | "barbearia" | null>(null);

  // ── Taxa de cancelamento
  const [feeConfig, setFeeConfig] = useState<BarberCancellationFeeConfig>({
    habilitado: false,
    tipo: "porcentagem",
    valor: 20,
    horas_antecedencia: 0,
  });
  const [savingFee, setSavingFee] = useState(false);

  // Carrega configurações do banco de dados ao montar
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const [paymentData, feeData] = await Promise.all([
          fetchBarberPaymentMethods(barbeiroId, tenantId),
          fetchBarberCancellationFee(barbeiroId, tenantId),
        ]);

        if (mounted) {
          setMethods(paymentData);
          setFeeConfig(feeData);
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

  // Handler para alternar formas de pagamento
  const handleToggle = async (key: "pix" | "barbearia", nextVal: boolean) => {
    // Regra de segurança: pelo menos uma forma de pagamento deve permanecer ativa
    const otherKey = key === "pix" ? "barbearia" : "pix";
    if (!nextVal && !methods[otherKey]) {
      toast.warning("Mantenha ao menos uma forma de pagamento ativa para permitir agendamentos.");
      return;
    }

    const previous = { ...methods };
    const updated = { ...methods, [key]: nextVal };

    // Optimistic UI imediata
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

  // Salvar alterações na taxa de cancelamento
  const handleSaveCancellationFee = async (nextConfig?: BarberCancellationFeeConfig) => {
    const targetConfig = nextConfig || feeConfig;
    setSavingFee(true);

    try {
      await saveBarberCancellationFee({
        barbeiroId,
        tenantId,
        config: targetConfig,
      });
      setFeeConfig(targetConfig);
      toast.success(
        targetConfig.habilitado
          ? "Cobrança por cancelamento atualizada com sucesso!"
          : "Cobrança por cancelamento desativada!"
      );
    } catch (err: any) {
      console.error("Erro ao salvar taxa de cancelamento:", err);
      toast.error(err?.message || "Erro ao salvar taxa de cancelamento.");
    } finally {
      setSavingFee(false);
    }
  };

  // Alterna ativação da taxa de cancelamento
  const handleToggleFeeEnabled = (habilitado: boolean) => {
    const next = { ...feeConfig, habilitado };
    setFeeConfig(next);
    handleSaveCancellationFee(next);
  };

  return (
    <div className="min-h-[var(--app-height,100dvh)] bg-background text-foreground flex flex-col pb-12">
      <ScheduleHeader title="Formas de pagamentos" onBack={onBack} />

      <div className="flex-1 px-4 py-5 max-w-2xl mx-auto w-full space-y-6">
        {/* Card informativo de contexto */}
        <div className="p-4 rounded-2xl bg-secondary/35 border border-border/40 text-left">
          <p className="text-[13.5px] font-semibold text-foreground tracking-tight leading-snug">
            Configuração individual por profissional
          </p>
          <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
            Habilite ou desabilite as opções que estarão disponíveis para seus clientes no momento de agendar um serviço com você. Suas alterações afetam somente seus atendimentos e refletem no app do cliente em tempo real.
          </p>
        </div>

        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="text-[12.5px] text-muted-foreground">Carregando configurações...</span>
          </div>
        ) : (
          <div className="space-y-6">
            {/* ═══ SEÇÃO 1: FORMAS DE PAGAMENTO ═══ */}
            <div className="space-y-3">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80 px-1 block">
                Métodos de Recebimento
              </span>

              <div className="rounded-2xl border border-border/40 bg-card divide-y divide-border/20 shadow-xs overflow-hidden">
                {/* Opção 1: Pix */}
                <div className="p-4 flex items-center justify-between gap-4 transition-colors hover:bg-secondary/20">
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-secondary border border-border/50 flex items-center justify-center text-foreground shrink-0 mt-0.5">
                      <QrCode className="w-5 h-5 stroke-[1.8]" />
                    </div>
                    <div className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[14px] font-semibold text-foreground leading-tight">
                          Pix
                        </span>
                        <span className="text-[10px] font-medium uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          Online
                        </span>
                      </div>
                      <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
                        Cobrança instantânea gerada automaticamente no checkout via QR Code e código Copia e Cola.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {savingKey === "pix" && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                    )}
                    <Switch
                      checked={methods.pix}
                      onCheckedChange={(val) => handleToggle("pix", val)}
                      disabled={savingKey !== null}
                      aria-label="Habilitar Pix"
                    />
                  </div>
                </div>

                {/* Opção 2: Pagamento na barbearia */}
                <div className="p-4 flex items-center justify-between gap-4 transition-colors hover:bg-secondary/20">
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-secondary border border-border/50 flex items-center justify-center text-foreground shrink-0 mt-0.5">
                      <Store className="w-5 h-5 stroke-[1.8]" />
                    </div>
                    <div className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[14px] font-semibold text-foreground leading-tight">
                          Pagamento na barbearia
                        </span>
                        <span className="text-[10px] font-medium uppercase px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                          Presencial
                        </span>
                      </div>
                      <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
                        O cliente conclui o agendamento no app e realiza o acerto financeiro presencialmente no dia do atendimento.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {savingKey === "barbearia" && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                    )}
                    <Switch
                      checked={methods.barbearia}
                      onCheckedChange={(val) => handleToggle("barbearia", val)}
                      disabled={savingKey !== null}
                      aria-label="Habilitar Pagamento na barbearia"
                    />
                  </div>
                </div>
              </div>

              {/* Aviso de regra de negócio */}
              <div className="p-3.5 rounded-xl bg-secondary/20 border border-border/30 flex items-start gap-2.5 text-left">
                <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                  Pelo menos uma forma de pagamento deve permanecer ativada para garantir que seus clientes consigam agendar.
                </p>
              </div>
            </div>

            {/* ═══ SEÇÃO 2: COBRANÇA POR CANCELAMENTO ═══ */}
            <div className="space-y-3 pt-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80 px-1 block">
                Políticas de Cancelamento
              </span>

              <div className="rounded-2xl border border-border/40 bg-card p-4 space-y-4 shadow-xs text-left">
                {/* Cabeçalho do Card */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive shrink-0 mt-0.5">
                      <Ban className="w-5 h-5 stroke-[1.8]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[14px] font-semibold text-foreground leading-tight">
                          Cobrança por cancelamento
                        </span>
                        {feeConfig.habilitado ? (
                          <span className="text-[10px] font-medium uppercase px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20">
                            Ativado
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/40">
                            Desativado
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
                        Taxa cobrada do cliente quando cancelar um agendamento. O aplicativo do cliente fica automaticamente travado até que a taxa seja paga.
                      </p>
                    </div>
                  </div>

                  <Switch
                    checked={feeConfig.habilitado}
                    onCheckedChange={handleToggleFeeEnabled}
                    disabled={savingFee}
                    aria-label="Ativar cobrança por cancelamento"
                  />
                </div>

                {/* Bloco de configurações detalhadas (visível quando ativado) */}
                {feeConfig.habilitado && (
                  <div className="pt-3 border-t border-border/20 space-y-4">
                    {/* Seletor de Modalidade: Porcentagem ou Valor Fixo */}
                    <div>
                      <label className="text-[12px] font-medium text-foreground block mb-2">
                        Tipo de cobrança
                      </label>
                      <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-secondary/50 border border-border/40">
                        <button
                          type="button"
                          onClick={() => {
                            const next = {
                              ...feeConfig,
                              tipo: "porcentagem" as const,
                              valor: feeConfig.tipo === "porcentagem" ? feeConfig.valor : 20,
                            };
                            setFeeConfig(next);
                          }}
                          className={cn(
                            "h-9 rounded-lg text-[13px] font-medium transition-all flex items-center justify-center gap-1.5",
                            feeConfig.tipo === "porcentagem"
                              ? "bg-background text-foreground shadow-xs border border-border/50"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <Percent className="w-3.5 h-3.5" />
                          <span>Porcentagem (%)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const next = {
                              ...feeConfig,
                              tipo: "fixo" as const,
                              valor: feeConfig.tipo === "fixo" ? feeConfig.valor : 15,
                            };
                            setFeeConfig(next);
                          }}
                          className={cn(
                            "h-9 rounded-lg text-[13px] font-medium transition-all flex items-center justify-center gap-1.5",
                            feeConfig.tipo === "fixo"
                              ? "bg-background text-foreground shadow-xs border border-border/50"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <DollarSign className="w-3.5 h-3.5" />
                          <span>Valor fixo (R$)</span>
                        </button>
                      </div>
                    </div>

                    {/* Campo de Valor com Presets Rápidos */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[12px] font-medium text-foreground">
                          {feeConfig.tipo === "porcentagem"
                            ? "Porcentagem da taxa de cancelamento"
                            : "Valor fixo da taxa de cancelamento"}
                        </label>
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {feeConfig.tipo === "porcentagem"
                            ? `${feeConfig.valor}% do valor do serviço`
                            : `R$ ${feeConfig.valor.toFixed(2).replace(".", ",")}`}
                        </span>
                      </div>

                      <div className="relative">
                        <input
                          type="number"
                          min={feeConfig.tipo === "porcentagem" ? 1 : 1}
                          max={feeConfig.tipo === "porcentagem" ? 100 : 500}
                          step={feeConfig.tipo === "porcentagem" ? 5 : 1}
                          value={feeConfig.valor}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setFeeConfig({ ...feeConfig, valor: val });
                          }}
                          className="w-full h-11 px-3.5 rounded-xl bg-background border border-border/60 text-foreground text-[14px] font-semibold focus:outline-none focus:ring-2 focus:ring-foreground/20"
                        />
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] font-bold text-muted-foreground pointer-events-none">
                          {feeConfig.tipo === "porcentagem" ? "%" : "BRL"}
                        </span>
                      </div>

                      {/* Chips de atalho rápido */}
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {feeConfig.tipo === "porcentagem"
                          ? [10, 20, 30, 50].map((pct) => (
                              <button
                                key={pct}
                                type="button"
                                onClick={() => setFeeConfig({ ...feeConfig, valor: pct })}
                                className={cn(
                                  "px-2.5 py-1 rounded-lg text-[11.5px] font-medium border transition-all",
                                  feeConfig.valor === pct
                                    ? "bg-foreground text-background border-foreground font-semibold"
                                    : "bg-secondary/40 text-muted-foreground border-border/40 hover:bg-secondary"
                                )}
                              >
                                {pct}%
                              </button>
                            ))
                          : [10, 15, 20, 30].map((val) => (
                              <button
                                key={val}
                                type="button"
                                onClick={() => setFeeConfig({ ...feeConfig, valor: val })}
                                className={cn(
                                  "px-2.5 py-1 rounded-lg text-[11.5px] font-medium border transition-all",
                                  feeConfig.valor === val
                                    ? "bg-foreground text-background border-foreground font-semibold"
                                    : "bg-secondary/40 text-muted-foreground border-border/40 hover:bg-secondary"
                                )}
                              >
                                R$ {val}
                              </button>
                            ))}
                      </div>

                      <p className="text-[11px] text-muted-foreground/75 mt-1.5 leading-relaxed">
                        {feeConfig.tipo === "porcentagem"
                          ? "O valor da taxa é calculado automaticamente em cima do preço do serviço agendado (ex: corte de R$ 50 com taxa de 20% = R$ 10)."
                          : "O valor fixo é cobrado independentemente do tipo ou da quantidade de serviços que foram agendados."}
                      </p>
                    </div>

                    {/* Regra de Antecedência */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                        <label className="text-[12px] font-medium text-foreground">
                          Aplicar taxa quando cancelado com:
                        </label>
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {[
                          { hours: 0, label: "Sempre" },
                          { hours: 2, label: "< 2 horas" },
                          { hours: 4, label: "< 4 horas" },
                          { hours: 24, label: "< 24 horas" },
                        ].map((rule) => (
                          <button
                            key={rule.hours}
                            type="button"
                            onClick={() => setFeeConfig({ ...feeConfig, horas_antecedencia: rule.hours })}
                            className={cn(
                              "h-9 rounded-xl text-[12px] font-medium border transition-all flex items-center justify-center",
                              feeConfig.horas_antecedencia === rule.hours
                                ? "bg-foreground text-background border-foreground font-semibold"
                                : "bg-secondary/30 text-muted-foreground border-border/40 hover:bg-secondary/60"
                            )}
                          >
                            {rule.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Card de Regra de Travamento */}
                    <div className="p-3.5 rounded-xl bg-destructive/5 border border-destructive/20 flex items-start gap-2.5">
                      <ShieldAlert className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                      <div className="text-[11.5px] text-muted-foreground leading-relaxed">
                        <p className="font-semibold text-foreground">
                          Bloqueio automático do aplicativo do cliente
                        </p>
                        <p className="mt-0.5">
                          Assim que o agendamento for cancelado, o aplicativo do cliente fica completamente travado para novos agendamentos até que o cliente pague a taxa via Pix.
                        </p>
                      </div>
                    </div>

                    {/* Botão de Salvar Alterações */}
                    <button
                      type="button"
                      onClick={() => handleSaveCancellationFee()}
                      disabled={savingFee}
                      className="w-full h-11 rounded-xl bg-foreground text-background font-semibold text-[13px] flex items-center justify-center gap-2 active:scale-[0.99] transition-all shadow-xs disabled:opacity-50"
                    >
                      {savingFee ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      <span>Salvar regras de cancelamento</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
