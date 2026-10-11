import { useRef } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { STALE_TIMES } from "@/lib/queryConstants";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { AdminRescheduleModal } from "./AdminRescheduleModal";
import { 
  Clock, 
  CreditCard, 
  Scissors,
  History,
  Star,
  CheckCircle2,
  Check,
  XCircle,
  Wallet,
  UserX,
  Banknote,
  QrCode,
  CalendarCheck,
  Plus,
  Crown,
  Loader2,
  ChevronLeft,
  Award,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { usePlanPaymentInfo } from "@/hooks/usePlanPaymentInfo";
import { motion, AnimatePresence } from "framer-motion";
import { useCompleteAppointment, useCancelAppointment, useNoShowAppointment } from "@/hooks/useAgendaMutations";
import { useConfirmarPagamentoPlano } from "@/hooks/useAdminMutations";
import { CupomSection, type AppliedCupomInfo } from "@/components/shared/CupomSection";
import { Button } from "@/components/ui/button";
import { ClientPlanConversionScreen } from "@/components/shared/ClientPlanConversionScreen";
import type { TimelineAppointment } from "@/hooks/useBarberAgenda";
import { isWhatsAppAppointment } from "@/lib/walkInName";
import { WhatsAppBadge } from "@/components/shared/WhatsAppBadge";

function CurvedBackArrow({ className }: { className?: string }) {
  return (
    <svg
      width="26" height="26" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      className={className}
    >
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a4 4 0 0 1 4 4v1" />
    </svg>
  );
}

interface AppointmentDetailsViewProps {
  appointment: TimelineAppointment;
  /** Controle do Sheet (modo drawer). No modo página é ignorado. */
  open?: boolean;
  /** Quando falso (default), renderiza dentro de um Sheet lateral. Quando true, como tela cheia. */
  renderAsPage?: boolean;
  /** Fecha o Sheet / volta à tela anterior */
  onClose: () => void;
  /** Dispara refresh dos dados da agenda */
  onUpdate: () => void;
  /** Quando fornecido, usa a query key do prefetch para histórico instantâneo */
  barbeiroId?: string | null;
  /** Título opcional do header no modo página */
  pageTitle?: string;
}

export function AppointmentDetailsView({
  appointment,
  open = false,
  renderAsPage = false,
  onClose,
  onUpdate,
  barbeiroId,
  pageTitle = "Detalhes do agendamento",
}: AppointmentDetailsViewProps) {
  /* ── Mutation hooks (chamados antes de qualquer early return) ── */
  const completeMutation = useCompleteAppointment();
  const cancelMutation = useCancelAppointment();
  const noShowMutation = useNoShowAppointment();
  const confirmarPlanoMutation = useConfirmarPagamentoPlano();

  const [loading, setLoading] = useState(false);
  const [clientPoints, setClientPoints] = useState<number>(0);
  const [requiredPoints, setRequiredPoints] = useState<number>(8);
  const [planUsageCount, setPlanUsageCount] = useState<number>(0);
  const [planLimit, setPlanLimit] = useState<number>(4);
  const [hasPlan, setHasPlan] = useState(false);
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);
  const [paymentJustConfirmed, setPaymentJustConfirmed] = useState(false);

  const isPlanAppointment = appointment?.tipo_agendamento === 'plano' || appointment?.payment_method === 'plano';
  const planInfo = usePlanPaymentInfo(appointment?.user_id || '', isPlanAppointment && !!appointment);
  const resolvedBarbeiroId = appointment?.barbeiro_id ?? barbeiroId ?? null;

  /* ── Busca dados de cupom + tenant_id para o agendamento ── */
  const { data: cupomData, refetch: refetchCupom, isLoading: isLoadingCupom } = useQuery({
    queryKey: ["appointment-details", "cupom-agendamento", appointment?.id ?? ""],
    queryFn: async () => {
      if (!appointment) return null;
      // 1) Campos de desconto + cupom no agendamento
      const { data: ag, error: agErr } = await supabase
        .from("agendamentos")
        .select(
          "cupom_id, desconto_aplicado, preco_final, cupom:cupons(id, codigo, tipo_desconto, valor_desconto, descricao)"
        )
        .eq("id", appointment.id)
        .maybeSingle();
      if (agErr) throw agErr;

      // 2) tenant_id via barbeiro do agendamento
      let tenantId: string | null = null;
      if (resolvedBarbeiroId) {
        const { data: b } = await supabase
          .from("barbeiros")
          .select("tenant_id")
          .eq("id", resolvedBarbeiroId)
          .maybeSingle();
        tenantId = b?.tenant_id || null;
      }

      return { ag, tenantId };
    },
    enabled: !!appointment?.id && (renderAsPage ? true : false /* legado: usava `open` */),
    staleTime: 10_000,
  });

  const resolvedTenantId = cupomData?.tenantId || null;


  const appliedCupom: AppliedCupomInfo | null = (() => {
    const ag: any = cupomData?.ag;
    if (!ag?.cupom_id || !ag?.cupom) return null;
    const precoOriginal = Number(appointment?.preco || 0);
    const desconto = Number(ag.desconto_aplicado || 0);
    const precoFinal =
      ag.preco_final != null ? Number(ag.preco_final) : Math.max(0, precoOriginal - desconto);
    return {
      codigo: ag.cupom.codigo,
      tipo_desconto: ag.cupom.tipo_desconto,
      valor_desconto: Number(ag.cupom.valor_desconto || 0),
      descricao: ag.cupom.descricao,
      desconto_aplicado: desconto,
      preco_original: precoOriginal,
      preco_final: precoFinal,
    };
  })();

  /* ── Histórico do cliente via useQuery (consome cache do prefetch) ── */
  const { data: history = [] } = useQuery({
    queryKey: barbeiroId
      ? QUERY_KEYS.barbeiro.clienteHistorico(appointment?.user_id ?? "", barbeiroId)
      : ["appointment-details", "history", appointment?.user_id ?? ""],
    queryFn: async () => {
      if (!appointment) return [];
      const query = supabase
        .from("agendamentos")
        .select("id, data, hora, status, preco, servico:servicos(nome)");

      query.eq("user_id", appointment.user_id);

      if (barbeiroId) {
        query.eq("barbeiro_id", barbeiroId);
        query.in("status", ["completed", "cancelled_by_user", "no_show"]);
      } else {
        query.neq("id", appointment.id);
      }

      const { data, error } = await query
        .order("data", { ascending: false })
        .limit(10);

      if (error) throw error;
      return data ?? [];
    },
    staleTime: STALE_TIMES.CLIENTES,
    enabled: !!appointment?.user_id,
  });

  // Ref para proteção contra unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (appointment) {
      setPaymentJustConfirmed(false);
      loadClientPoints();
      loadPlanUsage();
      loadRequiredPoints();
    }
  }, [appointment?.id]);


  const loadClientPoints = async () => {
    if (!appointment?.user_id) return;
    try {
      // RPC SECURITY DEFINER: funciona para barbeiro, admin, tenant_admin e TI
      const { data, error } = await (supabase as any).rpc(
        "get_client_loyalty_for_barber_view",
        { p_user_id: appointment.user_id, p_barbeiro_id: resolvedBarbeiroId }
      );
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      if (!mountedRef.current) return;
      setClientPoints(Math.max(0, Number(row?.client_points || 0)));
      const req = Number(row?.required_points || 8);
      setRequiredPoints(req >= 2 ? req : 8);
    } catch (error) {
      console.error("Error loading client loyalty:", error);
      // Fallback: tenta ler diretamente (caso o cliente esteja vendo os próprios dados)
      try {
        const { data } = await supabase
          .from("pontos")
          .select("pontos")
          .eq("user_id", appointment.user_id)
          .maybeSingle();
        if (!mountedRef.current) return;
        setClientPoints(data?.pontos || 0);
      } catch {
        /* mantém valor atual */
      }
    }
  };

  /** requiredPoints já vem da RPC acima; mantido como no-op para compatibilidade */
  const loadRequiredPoints = async () => { /* handled by loadClientPoints */ };

  const loadPlanUsage = async () => {
    if (!appointment?.user_id || !resolvedBarbeiroId) {
      if (!mountedRef.current) return;
      setHasPlan(false);
      setPlanLimit(4);
      setPlanUsageCount(0);
      return;
    }

    try {
      // Usa RPC SECURITY DEFINER para evitar bloqueio de RLS no contexto do barbeiro
      const { data, error } = await (supabase as any).rpc("get_plan_usage_for_barber_view", {
        p_user_id: appointment.user_id,
        p_barbeiro_id: resolvedBarbeiroId,
      });

      if (error) throw error;

      const usage = Array.isArray(data) ? data[0] : null;

      if (!mountedRef.current) return;
      setHasPlan(Boolean(usage?.has_plan));
      setPlanLimit(Math.max(1, Number(usage?.plan_limit || 4)));
      setPlanUsageCount(Math.max(0, Number(usage?.used_count || 0)));
    } catch (error) {
      console.error("Error loading plan usage:", error);
      setHasPlan(false);
      setPlanLimit(4);
      setPlanUsageCount(0);
    }
  };

  // Fallback de sincronização: mantém card atualizado mesmo se perder evento realtime
  useEffect(() => {
    if (!appointment?.id) return;

    const intervalId = setInterval(() => {
      loadPlanUsage();
    }, 8000);

    return () => clearInterval(intervalId);
  }, [appointment?.id]);

  const handleMarkAsCompleted = () => {
    if (!appointment) return;
    const payment = appointment.pagamentos?.[0];
    const paymentMethod = payment?.metodo || appointment.payment_method || 'cash';
    const isPrepaid = payment?.status === 'paid';

    completeMutation.mutate(
      {
        appointmentId: appointment.id,
        barbeiroId: resolvedBarbeiroId || "",
        date: new Date(`${appointment.data}T12:00:00`),
        userId: appointment.user_id,
        serviceName: appointment.servico?.nome || "serviço",
        preco: appointment.preco,
        paymentMethod,
        isPrepaid,
      },
      {
        onSuccess: () => {
          toast.success("Atendimento finalizado");
          onUpdate();
          onClose();
        },
      }
    );
  };

  const handleCancel = () => {
    if (!appointment) return;
    cancelMutation.mutate(
      {
        appointmentId: appointment.id,
        barbeiroId: resolvedBarbeiroId || "",
        date: new Date(`${appointment.data}T12:00:00`),
      },
      {
        onSuccess: () => {
          toast.success("Agendamento cancelado");
          onUpdate();
          onClose();
        },
      }
    );
  };

  const handleNoShow = () => {
    if (!appointment) return;
    noShowMutation.mutate(
      {
        appointmentId: appointment.id,
        barbeiroId: resolvedBarbeiroId || "",
        date: new Date(`${appointment.data}T12:00:00`),
        userId: appointment.user_id,
        serviceName: appointment.servico?.nome || "serviço",
      },
      {
        onSuccess: () => {
          toast.success("Falta registrada com sucesso");
          onUpdate();
          onClose();
        },
      }
    );
  };

  const handleConfirmPlanPayment = async () => {
    if (!appointment) return;
    setLoading(true);
    try {
      // Buscar assinatura cash pendente/legada (inclui active sem confirmação)
      let subQuery = supabase
        .from("assinaturas")
        .select("id, plano_id, status, payment_method, barbeiro_id, cash_payment_confirmed")
        .eq("user_id", appointment.user_id)
        .eq("payment_method", "cash");

      if (resolvedBarbeiroId) {
        subQuery = subQuery.eq("barbeiro_id", resolvedBarbeiroId);
      }

      const { data: sub, error: fetchErr } = await subQuery
        .or("status.in.(pending_cash,suspended),and(status.eq.active,cash_payment_confirmed.eq.false)")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchErr) throw fetchErr;

      if (!sub) {
        toast.error("Nenhuma assinatura cash pendente encontrada para este cliente");
        return;
      }

      // Delegar confirmação e notificação ao hook centralizado
      confirmarPlanoMutation.mutate(
        {
          assinaturaId: sub.id,
          userId: appointment.user_id,
          planoNome: planInfo.planName || "assinatura",
        },
        {
          onSuccess: () => {
            setPaymentJustConfirmed(true);
            setShowPaymentSuccess(true);
            onUpdate();
            setTimeout(() => setShowPaymentSuccess(false), 2500);
          },
          onSettled: () => setLoading(false),
        }
      );
      return; // loading será desligado pelo onSettled
    } catch (error) {
      console.error("Error confirming plan payment:", error);
      toast.error("Erro ao confirmar pagamento");
    } finally {
      setLoading(false);
    }
  };

  const [convertingToPlan, setConvertingToPlan] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id || null);
    });
  }, []);

  if (convertingToPlan && appointment) {
    return createPortal(
      <div className="fixed inset-0 z-[9999] bg-background pt-[env(safe-area-inset-top)]">
        <ClientPlanConversionScreen
          client={{
            id: appointment.user_id,
            nome: appointment.profile?.nome || "Cliente",
          }}
          tenantId={resolvedTenantId}
          currentUserId={currentUserId}
          lockedBarbeiroId={resolvedBarbeiroId}
          initialServiceId={appointment.servico_id}
          initialAppointmentId={appointment.id}
          onBack={() => setConvertingToPlan(false)}
          onConverted={() => {
            setConvertingToPlan(false);
            onUpdate();
          }}
        />
      </div>,
      document.body
    );
  }

  if (!appointment) return null;

  /* ═══ Derived state ═══ */
  const payment = appointment.pagamentos?.[0];
  const paymentMethod = payment?.metodo || appointment.payment_method || 'cash';
  const isPrepaid = payment?.status === 'paid';
  const isMutating = completeMutation.isPending || cancelMutation.isPending || noShowMutation.isPending;
  const isActing = loading || isMutating;
  const isActiveStatus = !['completed', 'cancelled_by_admin', 'cancelled_by_user', 'no_show'].includes(appointment.status);
  const canComplete = isActiveStatus;
  const canCancel = isActiveStatus;
  const canNoShow = isActiveStatus;
  const isCredit = paymentMethod === 'credit' || appointment.observacoes?.includes('crédito do app');
  const isCompleted = appointment.status === 'completed';
  const isCancelled = appointment.status === 'cancelled_by_admin' || appointment.status === 'cancelled_by_user';
  const isNoShow = appointment.status === 'no_show';
  const isPending = appointment.status === 'pending';

  const isToday = appointment.data === format(new Date(), 'yyyy-MM-dd');
  const dateLabel = isToday 
    ? "Hoje" 
    : format(new Date(`${appointment.data}T12:00:00`), "EEEE, dd 'de' MMMM", { locale: ptBR });

  const horaFormatted = (appointment.hora || "00:00").substring(0, 5);
  const duration = (appointment as any).duracao || appointment.servico?.duracao_minutos || 30;

  const getPaymentLabel = () => {
    if (isPlanAppointment) {
      if (planInfo.isCashPending) return "Plano — Cobrar na Barbearia";
      if (planInfo.isPlanCash) return "Plano (Dinheiro)";
      if (planInfo.planPaymentMethod === 'pix') return "Plano PIX";
      return "Plano Ativo";
    }
    if (isCredit) return "Crédito do App";
    if (appointment.is_free) return "Fidelidade";
    if (paymentMethod === 'pix') return "PIX";
    if (paymentMethod === 'card') return "Cartão";
    return "Dinheiro";
  };

  const getPaymentIcon = () => {
    if (isPlanAppointment) return Star;
    if (isCredit) return Wallet;
    if (paymentMethod === 'pix') return QrCode;
    if (paymentMethod === 'card') return CreditCard;
    return Banknote;
  };

  const getStatusConfig = () => {
    if (isCompleted) return { label: "Concluído", dot: "bg-emerald-500", icon: CheckCircle2 };
    if (isCancelled) return { label: "Cancelado", dot: "bg-red-500", icon: XCircle };
    if (isNoShow) return { label: "Não compareceu", dot: "bg-orange-500", icon: UserX };
    if (isPending) return { label: "Pendente", dot: "bg-amber-500", icon: Clock };
    return { label: "Confirmado", dot: "bg-blue-500", icon: CheckCircle2 };
  };

  const statusConfig = getStatusConfig();
  const StatusIcon = statusConfig.icon;
  const PayIcon = getPaymentIcon();


  const serviceName = (() => {
    if (appointment.observacoes?.startsWith("Serviços:")) {
      return appointment.observacoes.split(".")[0].replace("Serviços: ", "");
    }
    const sName = appointment.servico?.nome || "Serviço";
    const sDur = appointment.servico?.duracao_minutos || 0;
    const aDur = (appointment as any).duracao || 0;
    if (sDur > 0 && aDur > sDur) {
      const qty = Math.round(aDur / sDur);
      if (qty > 1) return `${qty}x ${sName}`;
    }
    return sName;
  })();

  const initials = (appointment.profile?.nome || "?")
    .split(" ")
    .slice(0, 2)
    .map(n => n[0])
    .join("")
    .toUpperCase();

  const priceDisplay = isPlanAppointment 
    ? "No Plano" 
    : appointment.is_free || isCredit
      ? "Incluso"
      : `R$ ${typeof appointment.preco === 'number' && !isNaN(appointment.preco) ? appointment.preco.toFixed(2).replace('.', ',') : '0,00'}`;

  /* ═══ Conteúdo compartilhado entre Sheet e tela cheia ═══ */
  const content = (
    <div className="mx-auto w-full max-w-md pb-6 space-y-3.5">
      {/* ── CLIENT HEADER STATUS ── */}
      <div className={cn("px-4 pb-1", renderAsPage ? "pt-1" : "")} style={renderAsPage ? undefined : { paddingTop: "calc(3rem + var(--app-safe-top, env(safe-area-inset-top, 0px)))" }}>
        <div className="space-y-1">
          {!renderAsPage && (
            <div className="flex items-center gap-2">
              <h2 className="text-[16px] font-semibold text-foreground leading-tight truncate">
                {appointment.profile?.nome || "Cliente"}
              </h2>
              {isWhatsAppAppointment(appointment.observacoes) && <WhatsAppBadge />}
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-card border border-border/60 text-foreground">
              <span className={cn("w-1.5 h-1.5 rounded-full", statusConfig.dot)} />
              {statusConfig.label}
            </span>
            <span className="text-[12px] text-muted-foreground capitalize truncate">{dateLabel}</span>
          </div>
        </div>
      </div>

      {/* ── CARD PRINCIPAL: HORÁRIO, SERVIÇO, PAGAMENTO ── */}
      <div className="px-4">
        <div className="rounded-2xl bg-card border border-border/60 p-4 space-y-3.5 shadow-sm">
          {/* Horário */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <Clock className="w-4 h-4 text-foreground/70" />
              <span className="text-[13px] font-medium">Horário</span>
            </div>
            <div className="flex items-center gap-1.5 text-[13px]">
              <span className="font-semibold tabular-nums text-foreground">{horaFormatted}</span>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-muted-foreground">{duration} min</span>
            </div>
          </div>

          <div className="h-px bg-border/40" />

          {/* Serviço */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0 text-muted-foreground">
              <Scissors className="w-4 h-4 text-foreground/70 flex-shrink-0" />
              <span className="text-[13px] font-medium truncate">{serviceName}</span>
            </div>
            {appliedCupom ? (
              <div className="flex items-baseline gap-1.5 flex-shrink-0">
                <span className="text-[11px] text-muted-foreground/60 line-through tabular-nums">
                  R$ {appliedCupom.preco_original.toFixed(2).replace('.', ',')}
                </span>
                <span className="text-[13px] font-semibold text-foreground tabular-nums">
                  R$ {appliedCupom.preco_final.toFixed(2).replace('.', ',')}
                </span>
              </div>
            ) : (
              <span className="text-[13px] font-semibold text-foreground tabular-nums flex-shrink-0">{priceDisplay}</span>
            )}
          </div>

          <div className="h-px bg-border/40" />

          {/* Pagamento */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <PayIcon className="w-4 h-4 text-foreground/70" />
              <span className="text-[13px] font-medium">{getPaymentLabel()}</span>
            </div>
            {(isPrepaid || isPlanAppointment || isCredit || appointment.is_free) ? (
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[11px] font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Pago</span>
              </div>
            ) : (
              <span className="text-[11px] text-muted-foreground px-2.5 py-0.5 rounded-full bg-secondary">Na barbearia</span>
            )}
          </div>
        </div>
      </div>

      {/* Cash plan banner — se houver pagamento pendente */}
      {isPlanAppointment && planInfo.isCashPending && !paymentJustConfirmed && (
        <div className="px-4">
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 text-amber-500">
              <Banknote className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-foreground truncate">
                Cobrar R$ {planInfo.precoMensal.toFixed(2).replace('.', ',')}
              </p>
              <p className="text-[12px] text-muted-foreground truncate">
                {planInfo.planName ? `Plano ${planInfo.planName} · ` : ''}pagamento pendente
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── OBSERVAÇÕES ── */}
      {appointment.observacoes && (
        <div className="px-4">
          <div className="rounded-2xl bg-card border border-border/60 p-4 space-y-1.5 shadow-sm">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Observações</p>
            <p className="text-[13px] text-foreground leading-relaxed">{appointment.observacoes}</p>
          </div>
        </div>
      )}

      {/* ── PLANO / FIDELIDADE ── */}
      <div className="px-4">
        <div className="rounded-2xl bg-card border border-border/60 p-4 space-y-3 shadow-sm">
          {isPlanAppointment || hasPlan ? (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center text-foreground">
                    <CalendarCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">Uso do Plano</p>
                    <p className="text-[10px] text-muted-foreground">Mês atual</p>
                  </div>
                </div>
                <span className="text-[15px] font-bold text-foreground tabular-nums">
                  {planUsageCount}/{planLimit}
                </span>
              </div>
              <div className="flex gap-1.5 flex-wrap pt-1">
                {Array.from({ length: planLimit }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-2 flex-1 min-w-[14px] rounded-full transition-all",
                      i < planUsageCount ? "bg-foreground" : "bg-secondary"
                    )}
                  />
                ))}
              </div>
              {planUsageCount >= planLimit ? (
                <p className="text-[11px] font-medium text-amber-500">Limite mensal atingido</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  {planLimit - planUsageCount} {planLimit - planUsageCount === 1 ? "corte restante" : "cortes restantes"}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
                    <Award className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">Programa Fidelidade</p>
                    <p className="text-[10px] text-muted-foreground">Pontos acumulados</p>
                  </div>
                </div>
                <span className="text-[15px] font-bold text-foreground tabular-nums">
                  {clientPoints}/{requiredPoints}
                </span>
              </div>
              <div className="flex gap-1.5 flex-wrap pt-1">
                {Array.from({ length: requiredPoints }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-2 flex-1 min-w-[12px] rounded-full transition-all",
                      i < clientPoints ? "bg-amber-500" : "bg-secondary"
                    )}
                  />
                ))}
              </div>
              {clientPoints >= requiredPoints ? (
                <p className="text-[11px] font-medium text-amber-500">Próximo corte gratuito disponível!</p>
              ) : appointment.ponto_liberado ? (
                <p className="text-[11px] text-emerald-500">Ponto registrado para este atendimento</p>
              ) : null}

              {isActiveStatus && !hasPlan && !isPlanAppointment && (
                <div className="pt-2 border-t border-border/40">
                  <button
                    type="button"
                    onClick={() => setConvertingToPlan(true)}
                    className="w-full h-9 rounded-xl bg-secondary/50 hover:bg-secondary text-foreground text-[12px] font-medium flex items-center justify-center gap-1.5 transition-colors active:scale-[0.98]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Vincular cliente a um plano</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── HISTÓRICO DE VISITAS ── */}
      {history.length > 0 && (
        <div className="px-4">
          <div className="rounded-2xl bg-card border border-border/60 p-4 space-y-3 shadow-sm">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" />
              Últimas visitas
            </p>
            <div className="divide-y divide-border/40">
              {history.map((h, i) => (
                <div key={i} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                  <span className="text-[12px] font-mono text-muted-foreground tabular-nums">
                    {format(new Date(`${h.data}T12:00:00`), "dd/MM/yy")} · {h.hora?.substring(0, 5)}
                  </span>
                  <span className="text-[13px] font-medium text-foreground truncate ml-3">
                    {(h as any).servico?.nome || "Serviço"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  /* ═══ Renderização: Sheet (default) vs. tela cheia ═══ */
  const sheetWrapper = (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-[420px] p-0 z-[80] flex flex-col border-l border-border/60 overflow-hidden bg-background">
        {/* ═══ SCROLLABLE CONTENT ═══ */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {content}
        </div>

        {/* ═══ FIXED ACTION BAR ═══ */}
        {(canComplete || canCancel || canNoShow) && (
          <div
            className="flex-shrink-0 border-t border-border/60 bg-background px-5 pt-3.5 space-y-2.5"
            style={{ paddingBottom: "calc(1.25rem + var(--app-safe-bottom, env(safe-area-inset-bottom, 0px)))" }}
          >
            {/* Confirm plan cash payment */}
            {isPlanAppointment && planInfo.isCashPending && !paymentJustConfirmed && (
              <button
                onClick={handleConfirmPlanPayment}
                disabled={isActing}
                className={cn(
                  "w-full h-11 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2",
                  "bg-amber-500 text-background",
                  "active:scale-[0.98] transition-transform duration-150",
                  "disabled:opacity-40 disabled:pointer-events-none"
                )}
              >
                <Banknote className="w-4 h-4" />
                Cliente pagou
              </button>
            )}

            {/* Primary: Finalizar Atendimento — largo, proeminente e confortável */}
            {canComplete && (
              <button 
                onClick={handleMarkAsCompleted} 
                disabled={isActing}
                className={cn(
                  "w-full h-12 rounded-2xl text-[14px] font-bold flex items-center justify-center gap-2",
                  "bg-foreground text-background shadow-md shadow-foreground/15",
                  "active:scale-[0.98] transition-all duration-150",
                  "disabled:opacity-40 disabled:pointer-events-none"
                )}
              >
                <CheckCircle2 className="w-4 h-4" />
                Finalizar atendimento
              </button>
            )}

            {/* Secondary row: Cancelar + Falta */}
            {(canCancel || canNoShow) && (
              <div className="flex gap-2.5">
                {canCancel && (
                  <button 
                    onClick={handleCancel} 
                    disabled={isActing}
                    className={cn(
                      "flex-1 h-10 rounded-xl text-[12px] font-medium flex items-center justify-center gap-1.5",
                      "bg-card border border-border/60 text-muted-foreground",
                      "hover:text-foreground",
                      "active:scale-[0.98] transition-transform duration-150",
                      "disabled:opacity-40 disabled:pointer-events-none"
                    )}
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Cancelar
                  </button>
                )}

                {canNoShow && (
                  <button 
                    onClick={handleNoShow} 
                    disabled={isActing}
                    className={cn(
                      "flex-1 h-10 rounded-xl text-[12px] font-medium flex items-center justify-center gap-1.5",
                      "bg-card border border-border/60 text-muted-foreground",
                      "hover:text-foreground",
                      "active:scale-[0.98] transition-transform duration-150",
                      "disabled:opacity-40 disabled:pointer-events-none"
                    )}
                  >
                    <UserX className="w-3.5 h-3.5" />
                    Falta
                  </button>
                )}
              </div>
            )}

            {/* Opção discreta: Vincular ao Plano */}
            {isActiveStatus && !hasPlan && !isPlanAppointment && (
              <button
                type="button"
                onClick={() => setConvertingToPlan(true)}
                className="w-full py-0.5 text-center text-[11px] font-medium text-muted-foreground/70 hover:text-foreground transition-colors flex items-center justify-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>Vincular ao plano</span>
              </button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );

  const pageWrapper = (
    <div className="fixed inset-0 z-[80] bg-background flex flex-col overflow-hidden">
      {/* ── HEADER PADRÃO DO APP ── */}
      <div
        className="flex-shrink-0 mx-auto w-full max-w-md px-4"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
      >
        <div className="flex items-center gap-3 min-h-[52px]">
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-card border border-border/60 hover:bg-secondary/50 active:scale-95 transition-all text-foreground shrink-0 shadow-sm"
            aria-label="Voltar"
          >
            <ChevronLeft className="w-5 h-5 stroke-[2.2]" />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <h2 className="text-[18px] font-semibold text-foreground tracking-tight truncate">
              {appointment.profile?.nome || "Cliente"}
            </h2>
            {isWhatsAppAppointment(appointment.observacoes) && <WhatsAppBadge />}
          </div>
        </div>
      </div>

      {/* ── SCROLLABLE CONTENT ── */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {content}
      </div>

      {/* ── FIXED ACTION BAR ── */}
      {(canComplete || canCancel || canNoShow) && (
        <div
          className="flex-shrink-0 border-t border-border/60 bg-background px-5 pt-3.5 space-y-2.5"
          style={{ paddingBottom: "calc(1.25rem + var(--app-safe-bottom, env(safe-area-inset-bottom, 0px)))" }}
        >
          {isPlanAppointment && planInfo.isCashPending && !paymentJustConfirmed && (
            <button
              onClick={handleConfirmPlanPayment}
              disabled={isActing}
              className={cn(
                "w-full h-11 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2",
                "bg-amber-500 text-background",
                "active:scale-[0.98] transition-transform duration-150",
                "disabled:opacity-40 disabled:pointer-events-none"
              )}
            >
              <Banknote className="w-4 h-4" />
              Cliente pagou
            </button>
          )}

          {/* Primary: Finalizar Atendimento — largo, proeminente e confortável */}
          {canComplete && (
            <button 
              onClick={handleMarkAsCompleted} 
              disabled={isActing}
              className={cn(
                "w-full h-12 rounded-2xl text-[14px] font-bold flex items-center justify-center gap-2",
                "bg-foreground text-background shadow-md shadow-foreground/15",
                "active:scale-[0.98] transition-all duration-150",
                "disabled:opacity-40 disabled:pointer-events-none"
              )}
            >
              <CheckCircle2 className="w-4 h-4" />
              Finalizar atendimento
            </button>
          )}

          {/* Secondary row: Cancelar + Falta */}
          {(canCancel || canNoShow) && (
            <div className="flex gap-2.5">
              {canCancel && (
                <button 
                  onClick={handleCancel} 
                  disabled={isActing}
                  className={cn(
                    "flex-1 h-10 rounded-xl text-[12px] font-medium flex items-center justify-center gap-1.5",
                    "bg-card border border-border/60 text-muted-foreground",
                    "hover:text-foreground",
                    "active:scale-[0.98] transition-transform duration-150",
                    "disabled:opacity-40 disabled:pointer-events-none"
                  )}
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Cancelar
                </button>
              )}

              {canNoShow && (
                <button 
                  onClick={handleNoShow} 
                  disabled={isActing}
                  className={cn(
                    "flex-1 h-10 rounded-xl text-[12px] font-medium flex items-center justify-center gap-1.5",
                    "bg-card border border-border/60 text-muted-foreground",
                    "hover:text-foreground",
                    "active:scale-[0.98] transition-transform duration-150",
                    "disabled:opacity-40 disabled:pointer-events-none"
                  )}
                >
                  <UserX className="w-3.5 h-3.5" />
                  Falta
                </button>
              )}
            </div>
          )}

          {/* Opção discreta: Vincular ao Plano */}
          {isActiveStatus && !hasPlan && !isPlanAppointment && (
            <button
              type="button"
              onClick={() => setConvertingToPlan(true)}
              className="w-full py-0.5 text-center text-[11px] font-medium text-muted-foreground/70 hover:text-foreground transition-colors flex items-center justify-center gap-1"
            >
              <Plus className="w-3 h-3" />
              <span>Vincular ao plano</span>
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      {renderAsPage ? pageWrapper : sheetWrapper}

      {/* Admin Reschedule Modal */}
      {appointment && (
        <AdminRescheduleModal
          open={rescheduleModalOpen}
          onOpenChange={setRescheduleModalOpen}
          appointmentId={appointment.id}
          userId={appointment.user_id}
          serviceName={appointment.servico?.nome || "Serviço"}
          currentDate={appointment.data}
          currentTime={appointment.hora}
          onSuccess={() => {
            setRescheduleModalOpen(false);
            onClose();
            onUpdate();
          }}
        />
      )}

      {/* ═══ PAYMENT SUCCESS OVERLAY — Premium, sério, profissional ═══ */}
      <AnimatePresence>
        {showPaymentSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
            style={{ background: "#0f0f0f" }}
          >
            {/* Linha verde sutil no topo */}
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="absolute top-0 left-0 right-0 h-[3px] origin-left"
              style={{ background: "linear-gradient(90deg, #10b981, #34d399)" }}
            />

            {/* Ícone — traço fino e elegante, sem círculos */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <Check className="w-14 h-14 text-emerald-400" strokeWidth={1.5} />
            </motion.div>

            {/* Texto — tipografia séria, sem emojis */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.3 }}
              className="mt-5 text-center px-8"
            >
              <h2 className="text-lg font-semibold text-foreground tracking-tight">
                Pagamento confirmado
              </h2>
              <p className="mt-1.5 text-foreground/50 text-xs font-normal max-w-[220px] mx-auto leading-relaxed">
                O plano foi ativado com sucesso
              </p>
            </motion.div>

            {/* Indicador discreto no rodapé */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2, duration: 0.4 }}
              className="absolute bottom-10 text-foreground/25 text-[10px] font-medium tracking-widest uppercase"
            >
              Voltando…
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
