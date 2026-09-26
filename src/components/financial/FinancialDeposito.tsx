import { useState } from "react";
import {
  QrCode,
  Copy,
  CheckCircle2,
  Info,
  Loader2,
} from "lucide-react";
import { motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { FinancialRole } from "./FinancialModule";

interface Props {
  role: FinancialRole;
  userId?: string;
  barbeiroId?: string | null;
}

interface PixChargeData {
  txid: string;
  br_code: string;
  valor: number;
  expires_at: string;
  charge_id: string;
}

/**
 * Sistema de Recebimento via PIX
 * Gera uma cobrança PIX real usando a chave PIX cadastrada do barbeiro.
 */
export function FinancialDeposito({ role, userId, barbeiroId }: Props) {
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [step, setStep] = useState<"form" | "qr">("form");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [charge, setCharge] = useState<PixChargeData | null>(null);

  const handleGenerate = async () => {
    const valorNum = parseFloat(valor.replace(",", "."));
    if (isNaN(valorNum) || valorNum <= 0) {
      toast.error("Informe um valor válido");
      return;
    }
    if (valorNum < 1) {
      toast.error("Valor mínimo: R$ 1,00");
      return;
    }
    if (!barbeiroId) {
      toast.error("Barbeiro não identificado");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("efi-create-pix-charge", {
        body: {
          barbeiro_id: barbeiroId,
          valor: valorNum,
          descricao: descricao.trim() || undefined,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro ao gerar cobrança");

      setCharge(data.data);
      setStep("qr");
    } catch (err: any) {
      console.error("Erro ao gerar PIX:", err);
      toast.error(err.message || "Não foi possível gerar a cobrança PIX");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!charge) return;
    navigator.clipboard.writeText(charge.br_code);
    setCopied(true);
    toast.success("Código PIX copiado");
    setTimeout(() => setCopied(false), 3000);
  };

  const handleReset = () => {
    setStep("form");
    setValor("");
    setDescricao("");
    setCharge(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold">Receber via PIX</h3>
        <p className="text-xs text-muted-foreground">
          Gere um QR Code para receber pagamentos
        </p>
      </div>

      {step === "form" ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-5"
        >
          {/* Valor */}
          <div className="rounded-2xl p-5 border border-border/30 bg-card/30 space-y-3">
            <label className="text-[11px] text-muted-foreground uppercase tracking-widest font-medium">
              Valor a receber
            </label>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-muted-foreground/50">R$</span>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={valor}
                onChange={(e) => setValor(e.target.value.replace(/[^0-9,.]/g, ""))}
                className="text-3xl font-bold bg-transparent border-0 p-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/20"
                disabled={loading}
              />
            </div>
          </div>

          {/* Descrição (opcional) */}
          <div className="rounded-2xl p-5 border border-border/30 bg-card/30 space-y-3">
            <label className="text-[11px] text-muted-foreground uppercase tracking-widest font-medium">
              Descrição (opcional)
            </label>
            <Input
              type="text"
              placeholder="Ex: Corte + Barba"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value.slice(0, 50))}
              className="bg-transparent border-0 p-0 h-auto focus-visible:ring-0 text-sm"
              disabled={loading}
              maxLength={50}
            />
          </div>

          {/* Info */}
          <div className="flex items-start gap-3 rounded-xl p-4 bg-secondary/20 border border-border/10">
            <Info className="w-4 h-4 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-muted-foreground leading-relaxed space-y-1">
              <p>Valor mínimo: <span className="font-semibold text-foreground">R$ 1,00</span></p>
              <p>O QR Code expira em 30 minutos.</p>
              <p>O pagamento será creditado direto na sua chave PIX cadastrada.</p>
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!valor || loading}
            className="w-full h-12 rounded-xl text-sm font-semibold"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <QrCode className="w-4 h-4 mr-2" />
                Gerar QR Code PIX
              </>
            )}
          </Button>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-5"
        >
          {/* QR Code Area */}
          <div className="rounded-2xl p-6 border border-border/30 bg-card/30 text-center space-y-4">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
              Escaneie o QR Code
            </h4>

            {/* QR Code real */}
            <div className="w-56 h-56 mx-auto rounded-2xl bg-white p-4 flex items-center justify-center">
              {charge && (
                <QRCodeSVG
                  value={charge.br_code}
                  size={208}
                  level="M"
                  includeMargin={false}
                />
              )}
            </div>

            <div className="text-3xl font-bold tabular-nums">
              R$ {charge?.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>

            {charge?.expires_at && (
              <p className="text-[11px] text-muted-foreground">
                Expira em {new Date(charge.expires_at).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
          </div>

          {/* Copy paste */}
          <div className="rounded-2xl p-4 border border-border/30 bg-card/30 space-y-3">
            <label className="text-[11px] text-muted-foreground uppercase tracking-widest font-medium">
              Ou copie o código PIX
            </label>
            <div className="flex gap-2">
              <div className="flex-1 px-3 py-2 rounded-lg bg-secondary/30 border border-border/20 text-xs font-mono truncate">
                {charge?.br_code.substring(0, 50)}...
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="flex-shrink-0 rounded-lg"
              >
                {copied ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={handleReset}
            className="w-full h-10 rounded-xl"
          >
            Gerar novo QR Code
          </Button>
        </motion.div>
      )}
    </div>
  );
}
