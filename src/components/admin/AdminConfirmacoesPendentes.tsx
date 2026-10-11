import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveOldestOwnedTenant } from "@/lib/tenantOwnership";
import { Inbox, Crown, CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AdminContext } from "@/pages/Admin";
import { motion, AnimatePresence } from "framer-motion";
import { useConfirmarPagamentoPlano } from "@/hooks/useAdminMutations";
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

interface AdminConfirmacoesPendentesProps {
  adminContext: AdminContext;
}

interface PendingAppointment {
  id: string;
  data: string;
  hora: string;
  status: string;
  preco: number;
  duracao: number;
  observacoes: string | null;
  cliente_confirmou: boolean;
  barbeiro_confirmou: boolean;
  barbeiro_id: string | null;
  payment_method: string | null;
  remarcado_de: string | null;
  tipo_agendamento: string | null;
  profile: { nome: string } | null;
  servico: { nome: string; duracao_minutos: number } | null;
  barbeiro: { apelido: string } | null;
  payment: { metodo: string; status: string } | null;
}

interface PendingPlanSub {
  id: string;
  status: string;
  payment_method: string;
  created_at: string;
  user_id: string;
  barbeiro_id: string | null;
  plano: { nome: string; preco_mensal: number } | null;
  cliente: { nome: string } | null;
  barbeiro: { apelido: string } | null;
}

type PaymentType = "cash" | "paid" | "plan" | "credit";

function resolvePayment(apt: PendingAppointment): { type: PaymentType; label: string; stripe: string; text: string } {
  const isPlano = apt.tipo_agendamento === "plano" || apt.payment_method === "plano";
  const isCredit = apt.payment_method === "credit";
  const isPrepaid = apt.payment?.status === "paid";

  if (isPlano) return { type: "plan", label: "Plano", stripe: "bg-blue-500", text: "text-blue-400" };
  if (isCredit) return { type: "credit", label: "Crédito", stripe: "bg-purple-500", text: "text-purple-400" };
  if (isPrepaid) return { type: "paid", label: "Pago no App", stripe: "bg-emerald-500", text: "text-emerald-400" };
  return { type: "cash", label: "Na barbearia", stripe: "bg-amber-500", text: "text-amber-400" };
}

function formatServiceDisplay(apt: PendingAppointment): string {
  if (apt.observacoes?.startsWith("Serviços:")) {
    return apt.observacoes.split(".")[0].replace("Serviços: ", "");
  }
  const name = apt.servico?.nome || "Serviço";
  const dur = apt.servico?.duracao_minutos || 0;
  if (dur > 0 && apt.duracao > dur) {
    const qty = Math.round(apt.duracao / dur);
    if (qty > 1) return `${qty}x ${name}`;
  }
  return name;
}

export function AdminConfirmacoesPendentes({ adminContext }: AdminConfirmacoesPendentesProps) {
  const [pendingPlans, setPendingPlans] = useState<PendingPlanSub[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmPlanDialog, setConfirmPlanDialog] = useState<PendingPlanSub | null>(null);
  const confirmarPlano = useConfirmarPagamentoPlano();

  const totalPending = pendingPlans.length;
  const isFirstLoad = totalPending === 0 && loading;

  /** Carrega planos pendentes de pagamento em dinheiro */
  const loadPendingPlans = useCallback(async () => {
    try {
      let allowedBarberIds: string[] | null = null;

      // Admin global mantém comportamento atual (filtrar pelo próprio barbeiro, quando houver)
      if (adminContext.isAdmin) {
        allowedBarberIds = adminContext.barbeiroId ? [adminContext.barbeiroId] : null;
      } else {
        // Tenant admin deve ver pendências de TODOS os barbeiros da sua barbearia
        const { data: tenant } = await resolveOldestOwnedTenant<{ id: string }>(
          adminContext.userId,
          "id"
        );

        if (!tenant?.id) {
          allowedBarberIds = adminContext.barbeiroId ? [adminContext.barbeiroId] : [];
        } else {
          const { data: tenantBarbers } = await supabase
            .from("barbeiros")
            .select("id")
            .eq("tenant_id", tenant.id)
            .eq("ativo", true)
            .is("deleted_at", null);

          allowedBarberIds = (tenantBarbers || []).map((b) => b.id);
        }
      }

      if (allowedBarberIds && allowedBarberIds.length === 0) {
        setPendingPlans([]);
        return;
      }

      let query = supabase
        .from("assinaturas")
        .select(`
          id, status, payment_method, created_at, user_id, barbeiro_id,
          plano:planos(nome, preco_mensal)
        `)
        .eq("payment_method", "cash")
        .or("status.in.(suspended,pending_cash),and(status.eq.active,cash_payment_confirmed.eq.false)")
        .order("created_at", { ascending: false });

      if (allowedBarberIds) query = query.in("barbeiro_id", allowedBarberIds);

      const { data, error } = await query;
      if (error) throw error;

      // Buscar nomes dos clientes e barbeiros
      const userIds = [...new Set((data || []).map(s => s.user_id))];
      const barberIds = [...new Set((data || []).map(s => s.barbeiro_id).filter(Boolean))];

      let profilesMap: Record<string, { nome: string }> = {};
      let barbersMap: Record<string, { apelido: string }> = {};

      if (userIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("id, nome").in("id", userIds);
        for (const p of (profiles || [])) profilesMap[p.id] = { nome: p.nome || "Sem nome" };
      }
      if (barberIds.length > 0) {
        const { data: barbers } = await supabase.from("barbeiros").select("id, apelido").in("id", barberIds as string[]);
        for (const b of (barbers || [])) barbersMap[b.id] = { apelido: b.apelido };
      }

      const enriched: PendingPlanSub[] = (data || []).map(s => ({
        ...s,
        plano: s.plano as any,
        cliente: profilesMap[s.user_id] || null,
        barbeiro: s.barbeiro_id ? barbersMap[s.barbeiro_id] || null : null,
      }));

      setPendingPlans(enriched);
    } catch (error) {
      console.error("Error loading pending plans:", error);
    }
  }, [adminContext.barbeiroId, adminContext.isAdmin, adminContext.userId]);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    await loadPendingPlans();
    if (!silent) setLoading(false);
  }, [loadPendingPlans]);

  useEffect(() => {
    loadAll();

    const ch2 = supabase.channel(`admin-confirmacoes-planos-${adminContext.barbeiroId || 'global'}-${Math.random().toString(36).slice(2, 9)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "assinaturas", ...(adminContext.barbeiroId ? { filter: `barbeiro_id=eq.${adminContext.barbeiroId}` } : {}) }, () => loadPendingPlans()).subscribe();

    const poll = setInterval(() => loadAll(true), 20000);

    return () => {
      supabase.removeChannel(ch2);
      clearInterval(poll);
    };
  }, [adminContext.barbeiroId, loadAll, loadPendingPlans]);

  // === Handler de confirmação de plano ===
  const handleConfirmPlan = () => {
    if (!confirmPlanDialog) return;

    const planId = confirmPlanDialog.id;
    confirmarPlano.mutate(
      {
        assinaturaId: confirmPlanDialog.id,
        userId: confirmPlanDialog.user_id,
        planoNome: confirmPlanDialog.plano?.nome || "assinatura",
      },
      {
        onSuccess: () => {
          setConfirmPlanDialog(null);
          setPendingPlans((prev) => prev.filter((p) => p.id !== planId));
        },
      }
    );
  };

  return (
    <>
      <div className="space-y-5 pt-4">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold text-foreground">Confirmações de Planos</h1>
          {!loading && totalPending > 0 && (
            <span className="text-[11px] text-muted-foreground/70">{totalPending}</span>
          )}
        </div>

        {isFirstLoad ? (
          <div className="space-y-2">
            {[1, 2].map(i => <div key={i} className="h-[60px] rounded-lg bg-muted/15 animate-pulse" />)}
          </div>
        ) : totalPending === 0 ? (
          <div className="flex flex-col items-center py-20">
            <Inbox className="w-8 h-8 text-muted-foreground/25 mb-2" strokeWidth={1.5} />
            <p className="text-xs text-muted-foreground/50">Nenhuma pendência</p>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {/* === Planos pendentes === */}
              {pendingPlans.map((plan) => (
                <motion.div
                  key={`plan-${plan.id}`}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.15 }}
                >
                  <div className="relative overflow-hidden rounded-lg border border-amber-500/20 bg-amber-500/5 p-3.5 pl-5 transition-opacity duration-150">
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg bg-amber-500" />
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-[13px] font-medium text-foreground truncate max-w-[140px]">
                            {plan.cliente?.nome || "Cliente"}
                          </p>
                          <span className="text-[10px] font-semibold shrink-0 whitespace-nowrap text-amber-400 flex items-center gap-1">
                            <Crown className="w-3 h-3" />
                            Plano
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {plan.plano?.nome || "Assinatura"} · R$ {Number(plan.plano?.preco_mensal || 0).toFixed(2).replace(".", ",")}
                          {plan.barbeiro && <span> · {plan.barbeiro.apelido}</span>}
                          {" · Dinheiro"}
                        </p>
                      </div>
                      <button
                        onClick={() => setConfirmPlanDialog(plan)}
                        className="h-8 px-3 rounded-lg flex items-center gap-1.5 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors duration-150 text-[11px] font-semibold shrink-0"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        Confirmar
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Dialog de confirmação de pagamento de plano */}
      <AlertDialog open={!!confirmPlanDialog} onOpenChange={(open) => !open && setConfirmPlanDialog(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-[15px]">
              <Crown className="w-5 h-5 text-amber-500" />
              Confirmar Pagamento do Plano
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[12px] space-y-2">
              <p>
                Confirma que <span className="text-foreground font-medium">{confirmPlanDialog?.cliente?.nome}</span> realizou
                o pagamento do plano <span className="text-foreground font-medium">{confirmPlanDialog?.plano?.nome}</span>?
              </p>
              <p className="text-amber-500 font-semibold">
                Valor: R$ {Number(confirmPlanDialog?.plano?.preco_mensal || 0).toFixed(2).replace(".", ",")}
              </p>
              <p className="text-muted-foreground text-[10px]">
                O plano será ativado por 30 dias e os cortes serão liberados para o cliente.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmarPlano.isPending} className="h-9 text-[12px]">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmPlan}
              disabled={confirmarPlano.isPending}
              className="h-9 text-[12px] bg-amber-600 hover:bg-amber-700"
            >
              {confirmarPlano.isPending ? (
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
