import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Loader2, Ticket, CheckCircle2, AlertCircle } from "lucide-react";

/**
 * Cupom já aplicado no agendamento (resumo).
 * Tem prioridade sobre o formulário de aplicação.
 */
export interface AppliedCupomInfo {
  codigo: string;
  tipo_desconto: "percentual" | "fixo" | string;
  valor_desconto: number;
  descricao?: string | null;
  desconto_aplicado: number; // valor em R$ realmente descontado
  preco_original: number;
  preco_final: number;
}

interface CupomSectionProps {
  /** Tenant do agendamento — usado nos RPCs validate/apply */
  tenantId: string | null | undefined;
  /** ID do agendamento — necessário para apply e gravação dos campos */
  agendamentoId: string;
  /** ID do cliente do agendamento (NUNCA usar auth.uid() do barbeiro) */
  clienteUserId: string;
  /** Preço base (preco do agendamento) */
  precoBase: number;
  /** Cupom já aplicado, se houver. Quando presente, esconde o formulário. */
  applied?: AppliedCupomInfo | null;
  /** Callback chamado após apply_cupom retornar ok */
  onApplied?: () => void;
}

interface ValidateResult {
  valido: boolean;
  motivo?: string;
  valor_descontado?: number;
  valor_final?: number;
  codigo?: string;
}

/**
 * Seção de cupom para o barbeiro: exibe cupom aplicado ou permite
 * aplicar manualmente um código no caixa (atendimento presencial).
 *
 * O barbeiro nunca cria/edita cupons — apenas valida e aplica via RPC.
 */
export function CupomSection({
  tenantId,
  agendamentoId,
  clienteUserId,
  precoBase,
  applied,
  onApplied,
}: CupomSectionProps) {
  const [codigo, setCodigo] = useState("");
  const [validating, setValidating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [validation, setValidation] = useState<ValidateResult | null>(null);

  // Reset ao trocar agendamento
  useEffect(() => {
    setCodigo("");
    setValidation(null);
  }, [agendamentoId]);

  /* ── Cupom já aplicado: mostra resumo, sem formulário ── */
  if (applied) {
    return (
      <div className="rounded-xl bg-card border border-border px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <Ticket className="w-4 h-4 text-primary" />
          <p className="text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground">
            Cupom aplicado
          </p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground font-mono tracking-wider truncate">
              {applied.codigo}
            </p>
            {applied.descricao && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {applied.descricao}
              </p>
            )}
          </div>
          <Badge variant="outline" className="border-primary/30 text-primary bg-primary/10 font-mono">
            {applied.tipo_desconto === "percentual"
              ? `-${Number(applied.valor_desconto).toFixed(0)}%`
              : `-R$ ${Number(applied.valor_desconto).toFixed(2).replace(".", ",")}`}
          </Badge>
        </div>

        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Total com desconto</span>
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-muted-foreground line-through tabular-nums">
              R$ {applied.preco_original.toFixed(2).replace(".", ",")}
            </span>
            <span className="text-base font-bold text-foreground tabular-nums">
              R$ {applied.preco_final.toFixed(2).replace(".", ",")}
            </span>
          </div>
        </div>
      </div>
    );
  }

  /* ── Sem cupom aplicado: formulário de validação + apply ── */
  const canValidate = !!tenantId && codigo.trim().length > 0 && !validating;
  const canApply =
    !!tenantId && !!validation?.valido && !applying;

  const handleValidate = async () => {
    if (!tenantId || !codigo.trim()) return;
    setValidating(true);
    setValidation(null);
    try {
      const { data, error } = await (supabase.rpc as any)("validate_cupom", {
        p_tenant_id: tenantId,
        p_codigo: codigo.trim().toUpperCase(),
        p_user_id: clienteUserId,
        p_valor_base: precoBase,
      });
      if (error) throw error;
      const result: ValidateResult = Array.isArray(data) ? data[0] : data;
      setValidation(result || { valido: false, motivo: "Resposta inválida" });
      if (!result?.valido) {
        toast.error(result?.motivo || "Cupom inválido");
      }
    } catch (err: any) {
      console.error("validate_cupom error:", err);
      const motivo = err?.message || "Erro ao validar cupom";
      setValidation({ valido: false, motivo });
      toast.error(motivo);
    } finally {
      setValidating(false);
    }
  };

  const handleApply = async () => {
    if (!tenantId || !validation?.valido) return;
    setApplying(true);
    try {
      const { data, error } = await (supabase.rpc as any)("apply_cupom", {
        p_tenant_id: tenantId,
        p_codigo: codigo.trim().toUpperCase(),
        p_user_id: clienteUserId,
        p_agendamento_id: agendamentoId,
        p_valor_base: precoBase,
      });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      if (!result?.ok) {
        toast.error(result?.motivo || "Não foi possível aplicar o cupom");
        return;
      }

      toast.success("Cupom aplicado com sucesso");
      onApplied?.();
      setCodigo("");
      setValidation(null);
    } catch (err: any) {
      console.error("apply_cupom error:", err);
      toast.error(err?.message || "Erro ao aplicar cupom");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="rounded-xl bg-card border border-border px-5 py-4">
      <div className="flex items-center gap-2 mb-3">
        <Ticket className="w-4 h-4 text-muted-foreground" />
        <p className="text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground">
          Aplicar cupom
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          value={codigo}
          onChange={(e) => {
            setCodigo(e.target.value.toUpperCase());
            if (validation) setValidation(null);
          }}
          placeholder="CÓDIGO"
          className="font-mono uppercase tracking-widest"
          disabled={validating || applying}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canValidate) handleValidate();
          }}
        />
        <button
          type="button"
          onClick={handleValidate}
          disabled={!canValidate}
          className={cn(
            "px-4 h-10 rounded-md text-xs font-bold tracking-wide whitespace-nowrap",
            "bg-foreground/[0.06] text-foreground hover:bg-foreground/[0.1]",
            "disabled:opacity-40 disabled:pointer-events-none transition-colors"
          )}
        >
          {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Validar"}
        </button>
      </div>

      {/* Resultado da validação */}
      {validation && (
        <div
          className={cn(
            "mt-3 px-4 py-3 rounded-lg border text-xs flex items-start gap-2",
            validation.valido
              ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-500"
              : "bg-destructive/10 border-destructive/25 text-destructive"
          )}
        >
          {validation.valido ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            {validation.valido ? (
              <>
                <p className="font-semibold">Cupom válido</p>
                <p className="opacity-90 mt-0.5">
                  Desconto de R${" "}
                  {Number(validation.valor_descontado || 0)
                    .toFixed(2)
                    .replace(".", ",")}{" "}
                  · Total R${" "}
                  {Number(validation.valor_final ?? precoBase)
                    .toFixed(2)
                    .replace(".", ",")}
                </p>
              </>
            ) : (
              <p>{validation.motivo || "Cupom inválido"}</p>
            )}
          </div>
        </div>
      )}

      {/* Botão Aplicar (só aparece após validação positiva) */}
      {validation?.valido && (
        <button
          type="button"
          onClick={handleApply}
          disabled={!canApply}
          className={cn(
            "mt-3 w-full h-11 rounded-xl text-sm font-bold tracking-wide flex items-center justify-center gap-2",
            "bg-foreground text-background hover:bg-foreground/90 active:scale-[0.98]",
            "disabled:opacity-40 disabled:pointer-events-none transition-all duration-150"
          )}
        >
          {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : "Aplicar cupom"}
        </button>
      )}
    </div>
  );
}
