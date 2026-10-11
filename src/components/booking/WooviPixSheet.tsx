/**
 * WooviPixSheet — exibe QR Code Pix gerado pela Woovi e faz polling
 * de status até a cobrança ser confirmada (OPENPIX:CHARGE_COMPLETED via webhook).
 *
 * Uso:
 *   <WooviPixSheet
 *     open={open}
 *     onOpenChange={setOpen}
 *     agendamentoId={agendamentoId}
 *     onPaid={() => navigate('/cliente')}
 *   />
 */
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, Check, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agendamentoId: string;
  onPaid?: () => void;
}

interface ChargeData {
  correlation_id: string;
  charge_id: string;
  br_code: string;
  qr_code_image: string;
  value_centavos: number;
}

export function WooviPixSheet({ open, onOpenChange, agendamentoId, onPaid }: Props) {
  const [charge, setCharge] = useState<ChargeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [paid, setPaid] = useState(false);

  /* ─── Cria a cobrança ─── */
  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("woovi-create-charge", {
        body: { agendamento_id: agendamentoId },
      });
      if (error) throw error;
      if (data?.success) setCharge(data.data);
      else throw new Error(data?.error?.message ?? "Falha ao gerar cobrança");
    } catch (err) {
      toast.error((err as Error).message);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }, [agendamentoId, onOpenChange]);

  useEffect(() => {
    if (open && !charge) generate();
  }, [open, charge, generate]);

  /* ─── Realtime: monitora webhook que atualiza status para COMPLETED ─── */
  useEffect(() => {
    if (!charge?.correlation_id) return;
    const channelId = `woovi-${charge.correlation_id}-${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "woovi_charges",
          filter: `correlation_id=eq.${charge.correlation_id}`,
        },
        (payload) => {
          if ((payload.new as any)?.status === "COMPLETED") {
            setPaid(true);
            toast.success("Pagamento confirmado!");
            setTimeout(() => {
              onPaid?.();
              onOpenChange(false);
            }, 1500);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [charge?.correlation_id, onPaid, onOpenChange]);

  const handleCopy = async () => {
    if (!charge?.br_code) return;
    await navigator.clipboard.writeText(charge.br_code);
    setCopied(true);
    toast.success("Código Pix copiado");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="text-center">Pague com Pix</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col items-center gap-5 py-6">
          {loading && (
            <div className="flex flex-col items-center gap-3 py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Gerando cobrança…</p>
            </div>
          )}

          {!loading && charge && !paid && (
            <>
              <div className="rounded-2xl bg-white p-4">
                <img
                  src={charge.qr_code_image}
                  alt="QR Code Pix"
                  className="w-56 h-56 object-contain"
                />
              </div>

              <p className="text-3xl font-bold tabular-nums">
                R$ {(charge.value_centavos / 100).toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                })}
              </p>

              <p className="text-xs text-muted-foreground text-center max-w-[280px]">
                Escaneie o QR Code no app do seu banco ou copie o código Pix abaixo.
              </p>

              <Button onClick={handleCopy} variant="outline" className="w-full">
                {copied ? (
                  <>
                    <Check className="w-4 h-4 mr-2" /> Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" /> Copiar Pix Copia & Cola
                  </>
                )}
              </Button>

              <p className="text-[10px] text-muted-foreground/60">
                Aguardando confirmação automática…
              </p>
            </>
          )}

          {paid && (
            <div className="flex flex-col items-center gap-3 py-10">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Check className="w-7 h-7 text-emerald-500" />
              </div>
              <p className="text-base font-bold">Pagamento confirmado!</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
