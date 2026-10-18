import { useState, useEffect } from "react";
import { ScheduleHeader } from "@/components/shared/ScheduleHeader";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  fetchBarberPaymentMethods,
  saveBarberPaymentMethods,
  BarberPaymentMethods,
} from "@/lib/barberPaymentMethods";
import { Loader2, QrCode, Store, Info, ShieldCheck } from "lucide-react";
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
  const [methods, setMethods] = useState<BarberPaymentMethods>({
    pix: true,
    barbearia: true,
  });
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<"pix" | "barbearia" | null>(null);

  // Carrega configurações do banco de dados ao montar
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const data = await fetchBarberPaymentMethods(barbeiroId, tenantId);
        if (mounted) {
          setMethods(data);
        }
      } catch (err) {
        console.error("Erro ao carregar formas de pagamento:", err);
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
      // Rollback se falhar
      setMethods(previous);
      toast.error(err?.message || "Erro ao salvar no banco de dados. Tente novamente.");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="min-h-[var(--app-height,100dvh)] bg-background text-foreground flex flex-col">
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
          <div className="space-y-4">
            {/* Bloco de Opções */}
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
                Pelo menos uma forma de pagamento deve permanecer ativada para garantir que seus clientes consigam agendar. Caso você desative o Pix, os clientes agendarão com pagamento presencial e vice-versa.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
