import { useRef } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { STALE_TIMES } from "@/lib/queryConstants";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { AdminRescheduleModal } from "./AdminRescheduleModal";
import { 
  Clock, 
  CreditCard, 
  Scissors,
  History,
  Star,
  AlertCircle,
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
  Pencil,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { TimelineAppointment as BaseTimelineAppointment } from "@/hooks/useBarberAgenda";
import { WhatsAppBadge } from "@/components/shared/WhatsAppBadge";

type TimelineAppointment = BaseTimelineAppointment & { barbeiro_apelido?: string | null };
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
import { Input } from "@/components/ui/input";
import { ClientPlanConversionScreen } from "@/components/shared/ClientPlanConversionScreen";
import { isWhatsAppAppointment, resolveClienteDisplayName, isBarberOrSystemName } from "@/lib/walkInName";
import {
  extractDebtFromAppointment,
  dispenseCancellationDebt,
  fetchBarberCancellationFee,
} from "@/lib/barberCancellationFee";

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
  const [convertingToPlan, setConvertingToPlan] = useState(false);
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
  const [hasActivePlans, setHasActivePlans] = useState(false);
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);
  const [paymentJustConfirmed, setPaymentJustConfirmed] = useState(false);
  const [confirmFinalizeOpen, setConfirmFinalizeOpen] = useState(false);
  const [confirmNoShowOpen, setConfirmNoShowOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentBarberId, setCurrentBarberId] = useState<string | null>(null);
  const [localClientName, setLocalClientName] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newNameInput, setNewNameInput] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);

  useEffect(() => {
    setLocalClientName(null);
  }, [appointment?.id]);

  // Garante que o body nunca permaneça congelado com pointer-events: none ao fechar modais
  useEffect(() => {
    const cleanPointerEvents = () => {
      if (typeof document !== "undefined" && document.body.style.pointerEvents === "none") {
        document.body.style.pointerEvents = "auto";
      }
    };
    cleanPointerEvents();
    const interval = setInterval(cleanPointerEvents, 400);
    return () => {
      clearInterval(interval);
      cleanPointerEvents();
    };
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id || null;
      setCurrentUserId(uid);
      if (uid) {
        const { data: b } = await supabase
          .from("barbeiros")
          .select("id")
          .eq("user_id", uid)
          .maybeSingle();
        if (b?.id) setCurrentBarberId(b.id);
      }
    });
  }, []);

  const isPlanAppointment =
    appointment?.tipo_agendamento === 'plano' ||
    appointment?.tipo_agendamento === 'assinatura' ||
    appointment?.payment_method === 'plano' ||
    appointment?.observacoes?.toLowerCase().includes('[plano]') ||
    appointment?.observacoes?.toLowerCase().includes('assinatura');

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
    enabled: !!appointment?.id && (renderAsPage || open),
    staleTime: 10_000,
  });

  const resolvedTenantId = cupomData?.tenantId || null;

  /* ── Checa se a barbearia tem fidelidade e planos ativos ── */
  useEffect(() => {
    let mounted = true;
    const checkTenantConfig = async () => {
      try {
        let tid = resolvedTenantId;
        if (!tid && resolvedBarbeiroId) {
          const { data: b } = await supabase
            .from("barbeiros")
            .select("tenant_id")
            .eq("id", resolvedBarbeiroId)
            .maybeSingle();
          tid = b?.tenant_id || null;
        }

        // 1. Checa se o programa de fidelidade está ativo
        let promoQuery = supabase
          .from("promocoes")
          .select("id")
          .eq("ativo", true);
        if (tid) promoQuery = promoQuery.eq("tenant_id", tid);
        const { data: promo } = await promoQuery.limit(1).maybeSingle();
        if (mounted) setLoyaltyEnabled(Boolean(promo));

        // 2. Checa se a barbearia tem planos ativos
        let planosQuery = supabase
          .from("planos")
          .select("id")
          .eq("ativo", true);
        if (tid) planosQuery = planosQuery.eq("tenant_id", tid);
        const { data: planos } = await planosQuery.limit(1);
        if (mounted) setHasActivePlans(Boolean(planos && planos.length > 0));
      } catch (err) {
        console.warn("Erro ao buscar configuracoes de fidelidade/planos:", err);
      }
    };

    checkTenantConfig();
    return () => { mounted = false; };
  }, [resolvedTenantId, resolvedBarbeiroId, appointment?.id]);

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

  /* ── Configuração de taxa de cancelamento do barbeiro ── */
  const { data: cancellationFeeConfig } = useQuery({
    queryKey: ["barber-cancellation-fee", resolvedBarbeiroId],
    queryFn: async () => {
      if (!resolvedBarbeiroId) return null;
      return await fetchBarberCancellationFee(resolvedBarbeiroId);
    },
    enabled: !!resolvedBarbeiroId,
    staleTime: 1000 * 60 * 5,
  });

  const isCancellationFeeEnabled = Boolean(cancellationFeeConfig?.habilitado);

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
      const authBarberId = currentBarberId || resolvedBarbeiroId;
      const { data, error } = await (supabase as any).rpc(
        "get_client_loyalty_for_barber_view",
        { p_user_id: appointment.user_id, p_barbeiro_id: authBarberId }
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

  /** Carrega uso do plano com busca direta robusta na tabela de assinaturas */
  const resolvedBaseName = resolveClienteDisplayName(
    appointment.observacoes,
    appointment.profile?.nome,
    "Cliente",
    (appointment as any).cliente_nome,
    appointment.barbeiro_apelido
  );
  const clientDisplayName = localClientName || resolvedBaseName;

  const loadPlanUsage = async () => {
    let targetUserId = appointment?.user_id;

    // Se o agendamento não tiver user_id direto, tenta encontrar por nome de perfil
    if (!targetUserId && (clientDisplayName || (appointment as any)?.client_name)) {
      const searchName = (clientDisplayName || (appointment as any)?.client_name || "").trim();
      if (searchName && searchName !== "Cliente") {
        try {
          const { data: prof } = await supabase
            .from("profiles")
            .select("id")
            .ilike("nome", searchName)
            .limit(1)
            .maybeSingle();
          if (prof?.id) targetUserId = prof.id;
        } catch {}
      }
    }

    if (!targetUserId) {
      const isMetaPlan = isPlanAppointment;
      if (mountedRef.current) {
        setHasPlan(isMetaPlan);
        setPlanLimit(4);
        setPlanUsageCount(isMetaPlan ? 1 : 0);
      }
      return;
    }

    try {
      // 1. Consulta direta na tabela de assinaturas (identifica clientes com plano ativo como Samuel dos Santos Souza)
      const { data: directSubs, error: subErr } = await supabase
        .from("assinaturas")
        .select("id, status, plano_id, next_billing_date, plano:planos(id, nome, limite_agendamentos_mes)")
        .eq("user_id", targetUserId)
        .in("status", ["active", "pending_cash", "pending_renewal", "suspended", "trialing"] as any)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!subErr && directSubs && directSubs.length > 0) {
        const sub = directSubs[0];
        const rawLimit = (sub as any)?.plano?.limite_agendamentos_mes;
        const limit = rawLimit ? Math.max(1, Number(rawLimit)) : 4;

        // Contar agendamentos do mês atual
        const monthPrefix = new Date().toISOString().slice(0, 7);
        const { count } = await supabase
          .from("agendamentos")
          .select("id", { count: "exact", head: true })
          .eq("user_id", targetUserId)
          .gte("data", `${monthPrefix}-01`)
          .not("status", "in", '("cancelled_by_admin","cancelled_by_user")');

        if (!mountedRef.current) return;
        setHasPlan(true);
        setPlanLimit(limit);
        setPlanUsageCount(count || 0);
        return;
      }

      // 2. Fallback via RPC SECURITY DEFINER
      const authBarberId = currentBarberId || resolvedBarbeiroId;
      if (authBarberId) {
        try {
          const { data: rpcData, error: rpcErr } = await (supabase as any).rpc("get_plan_usage_for_barber_view", {
            p_user_id: targetUserId,
            p_barbeiro_id: authBarberId,
          });

          if (!rpcErr && rpcData) {
            const usage = Array.isArray(rpcData) ? rpcData[0] : null;
            if (usage && usage.has_plan) {
              if (!mountedRef.current) return;
              setHasPlan(true);
              setPlanLimit(Math.max(1, Number(usage.plan_limit || 4)));
              setPlanUsageCount(Math.max(0, Number(usage.used_count || 0)));
              return;
            }
          }
        } catch (rpcErr) {
          console.warn("RPC plan check error:", rpcErr);
        }
      }

      // 3. Fallback: metadados do próprio agendamento
      if (!mountedRef.current) return;
      if (isPlanAppointment) {
        setHasPlan(true);
        setPlanLimit(4);
        setPlanUsageCount(1);
      } else {
        setHasPlan(false);
        setPlanLimit(4);
        setPlanUsageCount(0);
      }
    } catch (error) {
      console.error("Error loading plan usage:", error);
      if (mountedRef.current) {
        setHasPlan(isPlanAppointment);
        setPlanLimit(4);
        setPlanUsageCount(isPlanAppointment ? 1 : 0);
      }
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
        onSuccess: async () => {
          // Se possuía taxa de cancelamento pendente somada neste agendamento, dá baixa no débito
          const debtInfo = extractDebtFromAppointment(appointment);
          if (debtInfo.hasDebt && appointment.user_id) {
            try {
              await dispenseCancellationDebt({
                clienteId: appointment.user_id,
                barbeiroId: resolvedBarbeiroId || undefined,
                tenantId: resolvedTenantId,
              });
            } catch (err) {
              console.warn("Erro ao quitar taxa pendente no atendimento:", err);
            }
          }
          toast.success("Atendimento finalizado");
          onUpdate();
          onClose();
        },
      }
    );
  };

  const onFinalizeClick = () => {
    if (!appointment) return;
    // Se for plano com pagamento pendente presencial
    if (isPlanAppointment && planInfo.isCashPending && !paymentJustConfirmed) {
      setConfirmFinalizeOpen(true);
      return;
    }
    handleMarkAsCompleted();
  };

  const handleFinalizeWithPaid = async () => {
    setConfirmFinalizeOpen(false);
    setLoading(true);
    try {
      if (appointment.user_id) {
        let subQuery = supabase
          .from("assinaturas")
          .select("id, plano_id, status, payment_method, barbeiro_id, cash_payment_confirmed")
          .eq("user_id", appointment.user_id)
          .eq("payment_method", "cash");

        if (resolvedBarbeiroId) {
          subQuery = subQuery.eq("barbeiro_id", resolvedBarbeiroId);
        }

        const { data: sub } = await subQuery
          .or("status.in.(pending_cash,suspended),and(status.eq.active,cash_payment_confirmed.eq.false)")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (sub) {
          try {
            await confirmarPlanoMutation.mutateAsync({
              assinaturaId: sub.id,
              userId: appointment.user_id,
              planoNome: planInfo.planName || "assinatura",
            });
            setPaymentJustConfirmed(true);
          } catch (confirmErr) {
            console.warn("[AppointmentDetailsView] Confirmação de plano não-bloqueante:", confirmErr);
          }
        }
      }
    } catch (err) {
      console.error("Erro ao confirmar pagamento do plano:", err);
    } finally {
      setLoading(false);
      handleMarkAsCompleted();
    }
  };

  const handleFinalizeWithoutPaid = () => {
    setConfirmFinalizeOpen(false);
    toast.info("Atendimento finalizado. Cobrança do plano permanece pendente.");
    handleMarkAsCompleted();
  };

  const handleCancel = () => {
    if (!appointment) return;
    setConfirmCancelOpen(false);
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
    setConfirmNoShowOpen(false);
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


  if (convertingToPlan && appointment) {
    return createPortal(
      <div className="fixed inset-0 z-[9999] bg-background pt-[env(safe-area-inset-top)]">
        <ClientPlanConversionScreen
          client={{
            id: appointment.user_id,
            nome: clientDisplayName,
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
  const debtInfo = extractDebtFromAppointment(appointment);

  const isToday = appointment.data === format(new Date(), 'yyyy-MM-dd');
  const dateLabel = isToday 
    ? "Hoje" 
    : format(new Date(`${appointment.data}T12:00:00`), "EEEE, dd 'de' MMMM", { locale: ptBR });

  const horaFormatted = (appointment.hora || "00:00").substring(0, 5);
  const duration = (appointment as any).duracao || appointment.servico?.duracao_minutos || 30;

  const getPaymentLabel = () => {
    if (isPlanAppointment) {
      if (planInfo.isCashPending && !paymentJustConfirmed) return "Plano";
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
    if (isCompleted) return { label: "Concluído", dot: "bg-[#34C759]", icon: CheckCircle2 };
    if (isCancelled) return { label: "Cancelado", dot: "bg-red-500", icon: XCircle };
    if (isNoShow) return { label: "Não veio", dot: "bg-zinc-400 dark:bg-zinc-500", icon: UserX };
    if (isPending) return { label: "Pendente", dot: "bg-[#007AFF]", icon: Clock };
    return { label: "Agendado", dot: "bg-[#007AFF]", icon: CheckCircle2 };
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

  const initials = (clientDisplayName || "?")
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
                {clientDisplayName}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setNewNameInput(clientDisplayName === "Cliente" ? "" : clientDisplayName);
                  setIsEditingName(true);
                }}
                className="w-7 h-7 rounded-full bg-secondary/80 hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-95 transition-all shrink-0 cursor-pointer"
                aria-label="Editar nome do cliente"
                title="Editar nome do cliente"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
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
            {isPlanAppointment && planInfo.isCashPending && !paymentJustConfirmed ? (
              <span className="text-[11.5px] font-semibold px-2.5 py-0.5 rounded-full bg-foreground/[0.06] border border-border/80 text-foreground tabular-nums">
                A cobrar R$ {planInfo.precoMensal.toFixed(2).replace('.', ',')}
              </span>
            ) : (isPrepaid || isPlanAppointment || isCredit || appointment.is_free) ? (
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

      {/* ── DISCRIMINAÇÃO DE TAXA PENDENTE SOMADA (SE HOUVER) ── */}
      {debtInfo.hasDebt && (
        <div className="px-4">
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4 space-y-3 shadow-xs">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="text-[13px] font-bold tracking-tight">
                Taxa de cancelamento/falta anterior somada
              </span>
            </div>

            <div className="divide-y divide-amber-500/15 text-[12.5px]">
              <div className="py-1.5 flex justify-between text-muted-foreground">
                <span>Serviço:</span>
                <span className="tabular-nums font-medium text-foreground">
                  R$ {debtInfo.servicePrice.toFixed(2).replace(".", ",")}
                </span>
              </div>
              <div className="py-1.5 flex justify-between text-amber-600 dark:text-amber-400 font-medium">
                <span>Taxa anterior (cancelamento/falta):</span>
                <span className="tabular-nums font-semibold">
                  + R$ {debtInfo.debtAmount.toFixed(2).replace(".", ",")}
                </span>
              </div>
              <div className="pt-2 flex justify-between text-[14px] font-bold text-foreground">
                <span>Total a cobrar no balcão:</span>
                <span className="tabular-nums text-foreground">
                  R$ {debtInfo.totalToCollect.toFixed(2).replace(".", ",")}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground/80 leading-relaxed pt-0.5 border-t border-amber-500/15">
              O cliente possuía uma dívida pendente que foi unificada automaticamente a este agendamento presencial. Lembre-se de cobrar o total de <strong>R$ {debtInfo.totalToCollect.toFixed(2).replace(".", ",")}</strong> no balcão.
            </p>
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
      {isPlanAppointment || hasPlan ? (
        <div className="px-4">
          <div className="rounded-2xl bg-card border border-border/60 p-4 space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CalendarCheck className="w-4 h-4 text-foreground/80 stroke-[1.8] flex-shrink-0" />
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
          </div>
        </div>
      ) : loyaltyEnabled ? (
        <div className="px-4">
          <div className="rounded-2xl bg-card border border-border/60 p-4 space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Award className="w-5 h-5 text-amber-500 stroke-[1.8] flex-shrink-0" />
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
          </div>
        </div>
      ) : null}

      {/* ── BOTAO VINCULAR CLIENTE A UM PLANO (Apenas se a barbearia tiver planos ativos E cliente não for de plano) ── */}
      {isActiveStatus && !hasPlan && !isPlanAppointment && hasActivePlans && (
        <div className="px-4">
          <button
            type="button"
            onClick={() => setConvertingToPlan(true)}
            className="w-full h-11 rounded-2xl bg-card border border-border/60 hover:bg-secondary/40 text-foreground text-[13px] font-medium flex items-center justify-center gap-2 transition-all active:scale-[0.99] shadow-xs"
          >
            <Plus className="w-4 h-4 text-foreground/70" />
            <span>Vincular cliente a um plano</span>
          </button>
        </div>
      )}

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
            {/* Primary: Finalizar Atendimento — cápsula Apple preto */}
            {canComplete && (
              <button 
                onClick={onFinalizeClick} 
                disabled={isActing}
                className={cn(
                  "w-full h-12 rounded-full text-[14px] font-semibold flex items-center justify-center gap-2",
                  "bg-foreground text-background shadow-xs hover:bg-foreground/90",
                  "active:scale-[0.99] transition-all duration-150",
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
                    onClick={() => setConfirmCancelOpen(true)} 
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
                    onClick={() => setConfirmNoShowOpen(true)} 
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
              {clientDisplayName}
            </h2>
            <button
              type="button"
              onClick={() => {
                setNewNameInput(clientDisplayName === "Cliente" ? "" : clientDisplayName);
                setIsEditingName(true);
              }}
              className="w-7 h-7 rounded-full bg-secondary/80 hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-95 transition-all shrink-0 cursor-pointer"
              aria-label="Editar nome do cliente"
              title="Editar nome do cliente"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
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
          {/* Primary: Finalizar Atendimento — cápsula Apple preto */}
          {canComplete && (
            <button 
              onClick={onFinalizeClick} 
              disabled={isActing}
              className={cn(
                "w-full h-12 rounded-full text-[14px] font-semibold flex items-center justify-center gap-2",
                "bg-foreground text-background shadow-xs hover:bg-foreground/90",
                "active:scale-[0.99] transition-all duration-150",
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
                  onClick={() => setConfirmCancelOpen(true)} 
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
                  onClick={() => setConfirmNoShowOpen(true)} 
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
      {/* ═══ DIALOG CONFIRMAÇÃO PAGAMENTO PLANO NO FINALIZAR ═══ */}
      <AlertDialog open={confirmFinalizeOpen} onOpenChange={setConfirmFinalizeOpen}>
        <AlertDialogContent className="max-w-sm rounded-3xl border border-border/60 p-6 bg-background z-[100]">
          <AlertDialogHeader className="space-y-2 text-center sm:text-center">
            <div className="w-12 h-12 rounded-full bg-foreground/5 border border-border/60 flex items-center justify-center mx-auto text-foreground mb-1">
              <Banknote className="w-6 h-6 stroke-[1.8]" />
            </div>
            <AlertDialogTitle className="text-[17px] font-semibold tracking-tight text-foreground">
              O cliente realizou o pagamento?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[13px] text-muted-foreground leading-relaxed">
              Há uma cobrança pendente de <span className="font-semibold text-foreground">R$ {planInfo.precoMensal.toFixed(2).replace('.', ',')}</span> referente ao plano <span className="font-semibold text-foreground">{planInfo.planName || "Mensal"}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="pt-4 space-y-2.5">
            <button
              type="button"
              onClick={handleFinalizeWithPaid}
              disabled={isActing}
              className="w-full h-11 rounded-full bg-foreground text-background text-[13px] font-semibold hover:bg-foreground/90 active:scale-[0.99] transition-all shadow-xs flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              Sim, cliente pagou
            </button>

            <button
              type="button"
              onClick={handleFinalizeWithoutPaid}
              disabled={isActing}
              className="w-full h-11 rounded-full bg-card border border-border/80 text-foreground text-[13px] font-medium hover:bg-secondary/40 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              Não pagou (Cobrar depois)
            </button>

            <AlertDialogCancel
              onClick={() => setConfirmFinalizeOpen(false)}
              className="w-full h-9 border-0 bg-transparent text-[12px] text-muted-foreground hover:text-foreground transition-colors mt-0 shadow-none hover:bg-transparent"
            >
              Voltar
            </AlertDialogCancel>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* ═══ DIALOG CONFIRMAÇÃO DE FALTA (NO-SHOW) ═══ */}
      <AlertDialog open={confirmNoShowOpen} onOpenChange={setConfirmNoShowOpen}>
        <AlertDialogContent className="max-w-sm rounded-3xl border border-border/60 p-6 bg-background z-[100]">
          <AlertDialogHeader className="space-y-2 text-center sm:text-center">
            <div className="w-12 h-12 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto text-destructive mb-1">
              <UserX className="w-6 h-6 stroke-[1.8]" />
            </div>
            <AlertDialogTitle className="text-[17px] font-semibold tracking-tight text-foreground">
              Confirmar falta do cliente?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[12.5px] text-muted-foreground leading-relaxed">
              O agendamento de <strong className="text-foreground">{clientDisplayName}</strong> será marcado como <strong className="text-foreground">Falta</strong>.
              {isCancellationFeeEnabled ? (
                <>
                  <br /><br />
                  {isPrepaid ? (
                    <span>O cliente já realizou pagamento antecipado (Pix). O valor correspondente à taxa de cancelamento/falta será retido.</span>
                  ) : (
                    <span>Como o agendamento é com pagamento presencial na barbearia, a taxa configurada será registrada como pendência na conta do cliente e somada no próximo agendamento dele.</span>
                  )}
                </>
              ) : (
                <span> O horário será liberado na agenda.</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="pt-4 flex gap-2">
            <AlertDialogCancel
              onClick={() => setConfirmNoShowOpen(false)}
              className="flex-1 h-11 rounded-full bg-secondary border border-border/60 text-[13px] font-medium text-foreground hover:bg-secondary/80 transition-all mt-0"
            >
              Voltar
            </AlertDialogCancel>
            <button
              type="button"
              onClick={handleNoShow}
              disabled={isActing}
              className="flex-1 h-11 rounded-full bg-destructive text-destructive-foreground text-[13px] font-semibold hover:opacity-90 active:scale-[0.99] transition-all shadow-xs disabled:opacity-50"
            >
              Sim, registrar falta
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* ═══ DIALOG CONFIRMAÇÃO DE CANCELAMENTO ═══ */}
      <AlertDialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen}>
        <AlertDialogContent className="max-w-sm rounded-3xl border border-border/60 p-6 bg-background z-[100]">
          <AlertDialogHeader className="space-y-2 text-center sm:text-center">
            <div className="w-12 h-12 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto text-destructive mb-1">
              <XCircle className="w-6 h-6 stroke-[1.8]" />
            </div>
            <AlertDialogTitle className="text-[17px] font-semibold tracking-tight text-foreground">
              Cancelar agendamento?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[12.5px] text-muted-foreground leading-relaxed">
              Tem certeza que deseja cancelar o agendamento de <strong className="text-foreground">{clientDisplayName}</strong>? O horário será liberado na agenda.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="pt-4 flex gap-2">
            <AlertDialogCancel
              onClick={() => setConfirmCancelOpen(false)}
              className="flex-1 h-11 rounded-full bg-secondary border border-border/60 text-[13px] font-medium text-foreground hover:bg-secondary/80 transition-all mt-0"
            >
              Voltar
            </AlertDialogCancel>
            <button
              type="button"
              onClick={handleCancel}
              disabled={isActing}
              className="flex-1 h-11 rounded-full bg-destructive text-destructive-foreground text-[13px] font-semibold hover:opacity-90 active:scale-[0.99] transition-all shadow-xs disabled:opacity-50"
            >
              Sim, cancelar
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* ═══ DIALOG EDIÇÃO NOME DO CLIENTE ═══ */}
      <AlertDialog open={isEditingName} onOpenChange={setIsEditingName}>
        <AlertDialogContent className="max-w-sm rounded-3xl border border-border/60 p-6 bg-background z-[100] space-y-4">
          <AlertDialogHeader className="space-y-1.5 text-center sm:text-center">
            <div className="w-12 h-12 rounded-full bg-secondary/80 border border-border/60 flex items-center justify-center mx-auto text-foreground mb-1">
              <Pencil className="w-5 h-5 stroke-[1.8]" />
            </div>
            <AlertDialogTitle className="text-[17px] font-semibold tracking-tight text-foreground">
              Editar nome do cliente
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[12.5px] text-muted-foreground leading-relaxed">
              Informe o nome do cliente que será exibido na agenda para este agendamento.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <Input
              placeholder="Nome do cliente (ex: Carlos, Lucas)..."
              value={newNameInput}
              onChange={(e) => setNewNameInput(e.target.value)}
              className="h-11 rounded-xl text-[14px]"
              autoFocus
            />
            {isBarberOrSystemName(newNameInput, appointment.barbeiro_apelido) && (
              <p className="text-[11.5px] text-destructive px-1 font-medium flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Por favor, informe o nome do cliente (e não o nome do barbeiro).</span>
              </p>
            )}
          </div>

          <div className="pt-2 flex gap-2">
            <AlertDialogCancel
              disabled={isSavingName}
              onClick={() => setIsEditingName(false)}
              className="flex-1 h-11 rounded-full bg-secondary border border-border/60 text-[13px] font-medium text-foreground hover:bg-secondary/80 mt-0"
            >
              Cancelar
            </AlertDialogCancel>
            <button
              type="button"
              disabled={isSavingName || !newNameInput.trim() || isBarberOrSystemName(newNameInput, appointment.barbeiro_apelido)}
              onClick={async () => {
                setIsSavingName(true);
                try {
                  const { error } = await supabase.rpc("update_agendamento_cliente_nome", {
                    p_agendamento_id: appointment.id,
                    p_cliente_nome: newNameInput.trim(),
                  });
                  if (error) throw error;
                  setLocalClientName(newNameInput.trim());
                  toast.success("Nome do cliente atualizado com sucesso!");
                  setIsEditingName(false);
                  onUpdate();
                } catch (err: any) {
                  toast.error(err?.message || "Erro ao atualizar nome");
                } finally {
                  setIsSavingName(false);
                }
              }}
              className="flex-1 h-11 rounded-full bg-foreground text-background text-[13px] font-semibold hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {isSavingName ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
