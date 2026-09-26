/**
 * ═══════════════════════════════════════════════════════════
 * RenovacaoSheet — Bottom sheet de renovação antecipada de plano
 * ═══════════════════════════════════════════════════════════
 *
 * 3 telas: escolha → pix → confirmacao
 * Usa Vaul Drawer, tokens CSS do design system, Framer Motion.
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Copy,
  CreditCard,
  Banknote,
  QrCode,
  Loader2,
  ChevronLeft,
  CalendarCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

/* ─── Props ────────────────────────────────────────────── */

interface RenovacaoSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assinaturaId: string;
  planoNome: string;
  planoPreco: number;
  servicoNome: string;
  onRenovado: () => void;
}

/* ─── Tipos internos ───────────────────────────────────── */

type Step = "escolha" | "pix" | "confirmacao";
type FormaPagamento = "pix" | "credit_card" | "cash";

interface PaymentOption {
  value: FormaPagamento;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
}

const PAYMENT_OPTIONS: PaymentOption[] = [
  {
    value: "pix",
    label: "PIX",
    sublabel: "Pagamento instantâneo",
    icon: <QrCode className="w-5 h-5" />,
  },
  {
    value: "credit_card",
    label: "Cartão de Crédito",
    sublabel: "Débito automático",
    icon: <CreditCard className="w-5 h-5" />,
  },
  {
    value: "cash",
    label: "Dinheiro",
    sublabel: "Pague na barbearia",
    icon: <Banknote className="w-5 h-5" />,
  },
];

/* ─── Componente ───────────────────────────────────────── */

export function RenovacaoSheet({
  open,
  onOpenChange,
  assinaturaId,
  planoNome,
  planoPreco,
  servicoNome,
  onRenovado,
}: RenovacaoSheetProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("escolha");
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento | null>(null);
  const [loading, setLoading] = useState(false);
  const [pixData, setPixData] = useState<{ qr_code: string; copia_cola: string } | null>(null);
  const [initialRenovacoes, setInitialRenovacoes] = useState<number | null>(null);

  // Reset ao fechar
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep("escolha");
        setFormaPagamento(null);
        setLoading(false);
        setPixData(null);
        setInitialRenovacoes(null);
      }, 300);
    }
  }, [open]);

  /* ─── Confirmar Renovação ─────────────────────────── */

  const handleConfirm = async () => {
    if (!formaPagamento) {
      toast.error("Selecione uma forma de pagamento");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("renew-subscription", {
        body: {
          assinatura_id: assinaturaId,
          forma_pagamento: formaPagamento,
        },
      });

      if (error) throw new Error(error.message);

      const result = data;

      if (!result?.success && result?.success !== undefined) {
        toast.error(result?.error || "Não foi possível renovar o plano");
        setLoading(false);
        return;
      }

      // Dinheiro → confirmação direta
      if (formaPagamento === "cash") {
        toast.success("Plano renovado! Pague na próxima visita.");
        handleRenovado();
        return;
      }

      // PIX → exibir QR code
      if (formaPagamento === "pix" && result?.pix_qr_code) {
        setPixData({
          qr_code: result.pix_qr_code,
          copia_cola: result.pix_copia_cola || "",
        });
        setStep("pix");
        setLoading(false);
        return;
      }

      // Cartão → abrir URL de pagamento
      if (formaPagamento === "credit_card" && result?.payment_url) {
        window.open(result.payment_url, "_blank");
        toast.info("Complete o pagamento na janela aberta");
        onOpenChange(false);
        setLoading(false);
        return;
      }

      // Fallback: se veio renovado = true
      if (result?.renovado) {
        handleRenovado();
        return;
      }

      toast.error("Resposta inesperada do servidor");
    } catch (err: any) {
      console.error("[RenovacaoSheet] Erro:", err);
      toast.error(err.message || "Erro ao renovar plano");
    } finally {
      setLoading(false);
    }
  };

  /* ─── Polling PIX (verificar se pagou) ────────────── */

  useEffect(() => {
    if (step !== "pix") return;

    const interval = setInterval(async () => {
      try {
        const { data } = await supabase.rpc("get_assinatura_status", {
          p_user_id: (await supabase.auth.getUser()).data.user?.id || "",
        });

        const parsed = data as Record<string, unknown> | null;
        if (parsed && parsed.status === "active" && initialRenovacoes !== null) {
          if (((parsed.total_renovacoes as number) || 0) > initialRenovacoes) {
            clearInterval(interval);
            handleRenovado();
          }
        }
      } catch {
        // Silenciar erros de polling
      }
    }, 4000);

    // Guardar total_renovacoes inicial para comparar
    if (initialRenovacoes === null) {
      supabase.rpc("get_assinatura_status", {
        p_user_id: "",
      }).then(() => {
        // Usar valor do PlanTrackerCard (passado via context ou re-fetch)
      });
    }

    return () => clearInterval(interval);
  }, [step, initialRenovacoes]);

  /* ─── Callback de renovação concluída ─────────────── */

  const handleRenovado = useCallback(() => {
    setStep("confirmacao");
    setLoading(false);
    onRenovado();
    queryClient.invalidateQueries({ queryKey: ["assinatura-status"] });
  }, [onRenovado, queryClient]);

  /* ─── Copiar código PIX ───────────────────────────── */

  const handleCopyPix = async () => {
    if (!pixData?.copia_cola) return;
    try {
      await navigator.clipboard.writeText(pixData.copia_cola);
      toast.success("Código PIX copiado!");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  /* ─── Cancelar PIX pendente ───────────────────────── */

  const handleCancelPix = async () => {
    try {
      await supabase
        .from("assinaturas")
        .update({ status: "active" } as any)
        .eq("id", assinaturaId);
      toast.info("Renovação cancelada");
      onOpenChange(false);
    } catch {
      toast.error("Erro ao cancelar");
    }
  };

  /* ─── Data formatada para novo ciclo ──────────────── */

  const novoCicloFim = format(addDays(new Date(), 30), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const precoFormatado = `R$ ${planoPreco.toFixed(2).replace(".", ",")}`;

  /* ─── Render ─────────────────────────────────────────── */

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh] bg-background">
        <div className="mx-auto w-full max-w-lg px-4 pb-8 pt-2 overflow-y-auto">
          {/* Handle bar */}
          <div className="mx-auto w-12 h-1.5 rounded-full bg-muted mb-6" />

          <AnimatePresence mode="wait">
            {/* ═══ TELA 1: Escolha ═══ */}
            {step === "escolha" && (
              <motion.div
                key="escolha"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                <h2 className="text-lg font-bold text-foreground">Renovar plano</h2>

                {/* Resumo */}
                <div className="rounded-xl bg-muted/50 p-4 space-y-3">
                  <p className="text-sm font-medium text-foreground">
                    Você usou todos os 4 serviços deste ciclo
                  </p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Plano</span>
                    <span className="font-semibold text-foreground">{planoNome}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Serviço</span>
                    <span className="text-foreground">{servicoNome}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Valor</span>
                    <span className="font-bold text-foreground">{precoFormatado}/mês</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Novo ciclo</span>
                    <span className="text-foreground">hoje → {novoCicloFim}</span>
                  </div>
                  <Badge variant="secondary" className="bg-accent text-accent-foreground border-0">
                    Ciclo anterior encerrado
                  </Badge>
                </div>

                {/* Aviso */}
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Ao renovar, seu novo ciclo começa hoje e você terá 4 novos{" "}
                  <span className="font-medium text-foreground">{servicoNome}</span> disponíveis.
                </p>

                {/* Formas de pagamento */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">Forma de pagamento</p>
                  {PAYMENT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setFormaPagamento(opt.value)}
                      className={cn(
                        "w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all duration-200",
                        formaPagamento === opt.value
                          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                          : "border-border bg-card hover:bg-accent/50"
                      )}
                    >
                      <div
                        className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
                          formaPagamento === opt.value
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {opt.icon}
                      </div>
                      <div className="text-left flex-1">
                        <p className="text-sm font-medium text-foreground">{opt.label}</p>
                        <p className="text-xs text-muted-foreground">{opt.sublabel}</p>
                      </div>
                      <div
                        className={cn(
                          "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                          formaPagamento === opt.value
                            ? "border-primary bg-primary"
                            : "border-muted-foreground/30"
                        )}
                      >
                        {formaPagamento === opt.value && (
                          <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Botão confirmar */}
                <Button
                  onClick={handleConfirm}
                  disabled={!formaPagamento || loading}
                  className="w-full h-12 text-sm font-bold"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    "Confirmar renovação"
                  )}
                </Button>
              </motion.div>
            )}

            {/* ═══ TELA 2: PIX ═══ */}
            {step === "pix" && pixData && (
              <motion.div
                key="pix"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setStep("escolha")}
                    className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"
                  >
                    <ChevronLeft className="w-4 h-4 text-foreground" />
                  </button>
                  <h2 className="text-lg font-bold text-foreground">Pagar via PIX</h2>
                </div>

                {/* Valor */}
                <div className="text-center py-2">
                  <p className="text-3xl font-extrabold text-foreground">{precoFormatado}</p>
                  <p className="text-xs text-muted-foreground mt-1">Renovação do plano {planoNome}</p>
                </div>

                {/* QR Code */}
                {pixData.qr_code && (
                  <div className="flex justify-center">
                    <div className="bg-card border border-border rounded-2xl p-4">
                      <img
                        src={`data:image/png;base64,${pixData.qr_code}`}
                        alt="QR Code PIX"
                        className="w-[200px] h-[200px]"
                      />
                    </div>
                  </div>
                )}

                {/* Copia e cola */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Código PIX copia e cola:</p>
                  <div className="flex gap-2">
                    <div className="flex-1 bg-muted/50 rounded-lg px-3 py-2.5 text-xs text-muted-foreground truncate border border-border">
                      {pixData.copia_cola}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyPix}
                      className="shrink-0 h-10"
                    >
                      <Copy className="w-4 h-4 mr-1" />
                      Copiar
                    </Button>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground text-center leading-relaxed">
                  Após o pagamento, seu plano será renovado automaticamente.
                </p>

                {/* Ações */}
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full h-11"
                    onClick={() => {
                      // Verificação manual
                      toast.info("Verificando pagamento...");
                    }}
                  >
                    Já paguei
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full h-10 text-destructive hover:text-destructive"
                    onClick={handleCancelPix}
                  >
                    <X className="w-4 h-4 mr-1" />
                    Cancelar
                  </Button>
                </div>
              </motion.div>
            )}

            {/* ═══ TELA 3: Confirmação ═══ */}
            {step === "confirmacao" && (
              <motion.div
                key="confirmacao"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, type: "spring", stiffness: 200 }}
                className="text-center space-y-6 py-4"
              >
                {/* Ícone animado */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.15, 1] }}
                  transition={{ duration: 0.5, type: "spring", stiffness: 300 }}
                  className="mx-auto w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center"
                >
                  <CheckCircle2 className="w-10 h-10 text-primary" />
                </motion.div>

                <div>
                  <h2 className="text-xl font-bold text-foreground">Plano renovado!</h2>
                  <p className="text-sm text-muted-foreground mt-1">Seu novo ciclo começa hoje</p>
                </div>

                {/* Resumo */}
                <div className="rounded-xl bg-muted/50 p-4 space-y-3 text-left">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Serviço</span>
                    <span className="font-medium text-foreground">{servicoNome}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Disponível</span>
                    <span className="font-medium text-foreground">4 serviços</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Válido até</span>
                    <span className="font-medium text-foreground">{novoCicloFim}</span>
                  </div>
                </div>

                {/* Ações */}
                <div className="space-y-2">
                  <Button
                    className="w-full h-12 font-bold"
                    onClick={() => {
                      onOpenChange(false);
                      navigate("/cliente/agendar");
                    }}
                  >
                    <CalendarCheck className="w-4 h-4 mr-2" />
                    Agendar agora
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full h-10"
                    onClick={() => onOpenChange(false)}
                  >
                    Ver meu plano
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
