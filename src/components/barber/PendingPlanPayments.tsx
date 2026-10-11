import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Loader2, CreditCard, CheckCircle2, Clock, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PendingSubscription {
  id: string;
  status: string;
  payment_method: string;
  next_billing_date: string | null;
  created_at: string;
  user_id: string;
  plano: {
    nome: string;
    preco_mensal: number;
  };
  cliente: {
    nome: string;
    telefone: string | null;
  } | null;
}

interface PendingPlanPaymentsProps {
  barbeiroId: string;
}

export function PendingPlanPayments({ barbeiroId }: PendingPlanPaymentsProps) {
  const [subscriptions, setSubscriptions] = useState<PendingSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState<PendingSubscription | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    loadPendingSubscriptions();

    const channel = supabase
      .channel(`pending-plan-payments-${barbeiroId}-${Math.random().toString(36).slice(2, 9)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "assinaturas", filter: `barbeiro_id=eq.${barbeiroId}` },
        () => loadPendingSubscriptions()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [barbeiroId]);

  const loadPendingSubscriptions = async () => {
    try {
      const { data, error } = await supabase
        .from("assinaturas")
        .select(`
          id, status, payment_method, next_billing_date, created_at, user_id,
          plano:planos(nome, preco_mensal)
        `)
        .eq("barbeiro_id", barbeiroId)
        .eq("payment_method", "cash")
        .or("status.in.(suspended,pending_cash),and(status.eq.active,cash_payment_confirmed.eq.false)")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Buscar nomes dos clientes
      const userIds = (data || []).map(s => s.user_id);
      let profilesMap: Record<string, { nome: string; telefone: string | null }> = {};

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, nome, telefone")
          .in("id", userIds);

        for (const p of (profiles || [])) {
          profilesMap[p.id] = { nome: p.nome || "Sem nome", telefone: p.telefone };
        }
      }

      const enriched: PendingSubscription[] = (data || []).map(s => ({
        ...s,
        plano: s.plano as any,
        cliente: profilesMap[s.user_id] || null,
      }));

      setSubscriptions(enriched);
    } catch (err) {
      console.error("Error loading pending subscriptions:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (!confirmDialog) return;
    setConfirming(true);

    try {
      const { data, error } = await supabase.functions.invoke("confirm-plan-payment", {
        body: { assinaturaId: confirmDialog.id },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Pagamento confirmado! Plano ativado.");
      setConfirmDialog(null);
      loadPendingSubscriptions();
    } catch (err: any) {
      console.error("Error confirming payment:", err);
      toast.error(err.message || "Erro ao confirmar pagamento");
    } finally {
      setConfirming(false);
    }
  };

  if (loading) return null;
  if (subscriptions.length === 0) return null;

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Crown className="w-4 h-4 text-amber-500" />
          <h3 className="text-[13px] font-semibold text-foreground">
            Planos Pendentes de Pagamento
          </h3>
          <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-amber-500/10 text-amber-500 border-amber-500/20">
            {subscriptions.length}
          </Badge>
        </div>

        <AnimatePresence>
          {subscriptions.map((sub, index) => (
            <motion.div
              key={sub.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ delay: index * 0.05 }}
              className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3"
            >
              {/* Client + Plan info */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-[14px] font-bold text-amber-500">
                      {sub.cliente?.nome?.charAt(0)?.toUpperCase() || "?"}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-foreground truncate">
                      {sub.cliente?.nome || "Cliente"}
                    </p>
                    <p className="text-[11px] text-muted-foreground/60">
                      {sub.plano?.nome || "Plano"}
                    </p>
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className="text-[10px] bg-amber-500/15 text-amber-600 border-amber-500/30 flex-shrink-0"
                >
                  <Clock className="w-3 h-3 mr-1" />
                  Pendente
                </Badge>
              </div>

              {/* Details */}
              <div className="flex items-center justify-between text-[12px]">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Pagar na Barbearia</span>
                </div>
                <span className="font-semibold text-amber-500">
                  R$ {Number(sub.plano?.preco_mensal || 0).toFixed(2).replace(".", ",")}
                </span>
              </div>

              {/* Confirm button */}
              <button
                onClick={() => setConfirmDialog(sub)}
                className="w-full flex items-center justify-center gap-2 h-10 rounded-lg bg-foreground text-background text-[13px] font-semibold hover:bg-foreground/90 active:scale-[0.98] transition-all"
              >
                <CheckCircle2 className="w-4 h-4" />
                Confirmar Pagamento
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Confirmation dialog */}
      <AlertDialog open={!!confirmDialog} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-[15px]">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              Confirmar Pagamento
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[12px] space-y-2">
              <p>
                Confirma que <span className="text-foreground font-medium">{confirmDialog?.cliente?.nome}</span> realizou o pagamento do plano <span className="text-foreground font-medium">{confirmDialog?.plano?.nome}</span>?
              </p>
              <p className="text-amber-500 font-semibold">
                Valor: R$ {Number(confirmDialog?.plano?.preco_mensal || 0).toFixed(2).replace(".", ",")}
              </p>
              <p className="text-muted-foreground text-[10px]">
                O plano do cliente será ativado por 30 dias após a confirmação.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirming} className="h-9 text-[12px]">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmPayment}
              disabled={confirming}
              className="h-9 text-[12px] bg-emerald-600 hover:bg-emerald-700"
            >
              {confirming ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Confirmando...</>
              ) : (
                "Confirmar Pagamento"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
