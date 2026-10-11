import { useEffect, useMemo, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, ChevronLeft, Clock, Check, Copy, Crown } from "lucide-react";
import { toast } from "sonner";
import { ptBR } from "date-fns/locale";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { resolveClientTenantId } from "@/lib/clientTenant";
import { useSlotAvailability } from "@/hooks/useSlotAvailability";
import { sendNovoAgendamentoEvent, sendRemarcacaoConcluidaEvent } from "@/lib/webhookService";
import { motion, AnimatePresence } from "framer-motion";

// Premium Components
import { ServiceCard } from "@/components/booking/ServiceCard";
import { TimeSlot } from "@/components/booking/TimeSlot";
import { PaymentOption } from "@/components/booking/PaymentOption";
import { SummaryRow } from "@/components/booking/SummaryRow";
import { PremiumCalendar } from "@/components/booking/PremiumCalendar";
import { StepDots } from "@/components/booking/StepDots";
import { BookingBottomBar } from "@/components/booking/BookingBottomBar";
import { TimeSelectionBar } from "@/components/booking/TimeSelectionBar";

interface Service {
  id: string;
  nome: string;
  descricao: string;
  duracao_minutos: number;
  preco: number;
}

interface Barber {
  id: string;
  apelido: string;
  foto_url: string | null;
  unidade_id: string | null;
}

interface ActiveSubscription {
  id: string;
  plano_id: string;
  plano_nome: string;
  limite_agendamentos_mes: number;
  agendamentos_usados: number;
  next_billing_date: string;
  status: string;
  servico_id: string | null;
  servico: Service | null;
  /** true quando o plano é cash e ainda não foi pago (pending_cash) */
  isPendingCash?: boolean;
  /** Preço mensal do plano (usado para cobrar no primeiro corte de plano cash) */
  preco_mensal?: number;
}

interface ClienteAgendarProps {
  forcedTenantId?: string | null;
  forcedTenantName?: string | null;
}

const ClienteAgendar = ({ forcedTenantId = null }: ClienteAgendarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const tenantFromRouteState = ((location.state as { tenant_id?: string } | null)?.tenant_id) ?? null;
  const effectiveTenantId = forcedTenantId ?? tenantFromRouteState ?? null;
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [selectedServices, setSelectedServices] = useState<Service[]>([]);
  const [selectedBarberId, setSelectedBarberId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card' | 'cash'>('pix');
  const [processingPayment, setProcessingPayment] = useState(false);
  const [pixQrCode, setPixQrCode] = useState<string | null>(null);
  const [pixPayload, setPixPayload] = useState<string | null>(null);
  const [cardHolderName, setCardHolderName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiryMonth, setCardExpiryMonth] = useState("");
  const [cardExpiryYear, setCardExpiryYear] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [cardCpf, setCardCpf] = useState("");
  const [resumePendingBookingId, setResumePendingBookingId] = useState<string | null>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [pendingBookingId, setPendingBookingId] = useState<string | null>(null);
  const [availableCredits, setAvailableCredits] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [rescheduleAppointmentId, setRescheduleAppointmentId] = useState<string | null>(null);
  const [rescheduleBarberId, setRescheduleBarberId] = useState<string | null>(null);
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);
  const servicesListRef = useRef<HTMLDivElement | null>(null);
  const [activeSubscription, setActiveSubscription] = useState<ActiveSubscription | null>(null);
  const [subscriptionBlocked, setSubscriptionBlocked] = useState(false);
  const [subscriptionLimitReached, setSubscriptionLimitReached] = useState(false);
  const [availableRedemptions, setAvailableRedemptions] = useState<{ id: string; promocao_id: string }[]>([]);
  const [useRedemption, setUseRedemption] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Indica se o usuário está usando fluxo de plano (serviço pré-selecionado)
  const [isPlanFlow, setIsPlanFlow] = useState(false);

  // Durações personalizadas do barbeiro selecionado
  const [barberDurations, setBarberDurations] = useState<Map<string, number>>(new Map());

  // Indica se o barbeiro selecionado possui banco (subconta Asaas) vinculado
  const [barberHasBank, setBarberHasBank] = useState(false);

  // Verificação se usuário pode usar o plano (fluxo com servico_id)
  const isPlanEligible =
    !isRescheduling &&
    isPlanFlow &&
    !!activeSubscription?.servico &&
    selectedServices.length === 1 &&
    selectedServices[0]?.id === activeSubscription.servico.id &&
    activeSubscription.agendamentos_usados < activeSubscription.limite_agendamentos_mes;

  /**
   * true quando o cliente tem plano ativo com usos disponíveis,
   * INDEPENDENTE de ter servico_id vinculado ou não.
   * Usado para forçar pagamento via plano no fluxo normal.
   */
  const hasActivePlanWithUses = useMemo(() => {
    if (!activeSubscription) return false;
    if (activeSubscription.status !== 'active' && activeSubscription.status !== 'pending_cash') return false;
    const usados = activeSubscription.agendamentos_usados ?? 0;
    const limite = activeSubscription.limite_agendamentos_mes ?? 0;
    // limite 0 = ilimitado
    return limite === 0 || usados < limite;
  }, [activeSubscription]);

  /**
   * true quando o plano existe mas os usos mensais estão esgotados.
   * Nesse caso, o cliente pode pagar avulso normalmente.
   */
  const isPlanExhausted = useMemo(() => {
    if (!activeSubscription) return false;
    const usados = activeSubscription.agendamentos_usados ?? 0;
    const limite = activeSubscription.limite_agendamentos_mes ?? 0;
    return limite > 0 && usados >= limite;
  }, [activeSubscription]);

  /** Retorna a duração efetiva de um serviço (personalizada pelo barbeiro ou padrão) */
  const getEffectiveDuration = (service: Service) => {
    return barberDurations.get(service.id) ?? service.duracao_minutos;
  };

  const totalDuration = selectedServices.reduce((sum, s) => sum + getEffectiveDuration(s), 0);

  const { 
    slots: availableSlots, 
    loading: loadingSlots, 
    refreshSlots,
    verifySlotAvailability 
  } = useSlotAvailability(
    selectedDate, 
    totalDuration,
    isRescheduling ? rescheduleAppointmentId : null,
    selectedBarberId
  );

  // Carregar durações personalizadas e verificar banco quando barbeiro é selecionado
  useEffect(() => {
    if (!selectedBarberId) {
      setBarberDurations(new Map());
      setBarberHasBank(false);
      return;
    }

    const loadBarberData = async () => {
      // Carregar durações e verificar banco em paralelo
      const [durationsRes, barberRes] = await Promise.all([
        supabase
          .from("barbeiro_servico_duracao")
          .select("servico_id, duracao_personalizada")
          .eq("barbeiro_id", selectedBarberId),
        supabase
          .from("barbeiros")
          .select("asaas_account_id, woovi_pix_key")
          .eq("id", selectedBarberId)
          .single(),
      ]);

      const map = new Map<string, number>();
      (durationsRes.data || []).forEach((d) => map.set(d.servico_id, d.duracao_personalizada));
      setBarberDurations(map);

      // Carteira do barbeiro: aceita Woovi (novo gateway) OU Asaas (legado)
      const row: any = barberRes.data;
      const hasBank = !!row?.woovi_pix_key || !!row?.asaas_account_id;
      setBarberHasBank(hasBank);
    };

    loadBarberData();
  }, [selectedBarberId]);

  useEffect(() => {
    const initializeBooking = async () => {
      await loadUserCredits();
      await loadAvailableRedemptions();

      const resolvedTenantId = await resolveClientTenantId({ forcedTenantId: effectiveTenantId });

      await loadBarbers(resolvedTenantId);

      const resumeBookingId = sessionStorage.getItem('resumePendingBookingId');
      if (resumeBookingId) {
        setResumePendingBookingId(resumeBookingId);
        sessionStorage.removeItem('resumePendingBookingId');
        loadPendingBookingDetails(resumeBookingId);
        return;
      }

      const isReschedulingSession = sessionStorage.getItem('isRescheduling');
      const appointmentId = sessionStorage.getItem('rescheduleAppointmentId');

      if (isReschedulingSession === 'true' && appointmentId) {
        setIsRescheduling(true);
        setRescheduleAppointmentId(appointmentId);
        loadAppointmentForReschedule(appointmentId);
        return;
      }

      const subscription = await loadActiveSubscription();

      if (subscription?.servico) {
        const restantes = subscription.limite_agendamentos_mes - subscription.agendamentos_usados;

        if (restantes > 0) {
          setSelectedServices([subscription.servico]);
          setIsPlanFlow(true);
          setStep(1);
          return;
        }

        setSubscriptionLimitReached(true);
        return;
      }

      await loadServices(resolvedTenantId);
    };

    initializeBooking();
  }, []);

  /* ── Realtime: assinaturas do usuário ──
     Se o admin/barbeiro ativar o plano enquanto o cliente está nesta tela,
     recarrega a assinatura ativa imediatamente (sem precisar voltar e abrir
     a tela de novo). Cobre INSERT (nova ativação), UPDATE (renovação) e
     DELETE/cancelamento. */
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`agendar-assinatura-${userId}-${Math.random().toString(36).slice(2, 9)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "assinaturas",
          filter: `user_id=eq.${userId}`,
        },
        async () => {
          const subscription = await loadActiveSubscription();
          // Se acabou de ganhar plano, pré-seleciona o serviço (igual ao init)
          if (subscription?.servico && step === 0) {
            const restantes =
              subscription.limite_agendamentos_mes - subscription.agendamentos_usados;
            if (restantes > 0) {
              setSelectedServices([subscription.servico]);
              setIsPlanFlow(true);
              setStep(1);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Dynamic viewport height for mobile browsers (without locking scroll)
  useEffect(() => {
    const setFullHeight = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };

    setFullHeight();
    window.addEventListener('resize', setFullHeight);

    return () => {
      window.removeEventListener('resize', setFullHeight);
    };
  }, []);

  // Scroll to top on step change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  useEffect(() => {
    if (selectedDate) {
      setUnavailableMessage(null);
    }
  }, [selectedDate]);

  // Poll for payment confirmation
  useEffect(() => {
    if (step === 6 && pixQrCode && pendingBookingId && !paymentConfirmed) {
      const pollInterval = setInterval(async () => {
        try {
          const { data: pendingBooking, error } = await supabase
            .from("pending_bookings")
            .select("id")
            .eq("id", pendingBookingId)
            .maybeSingle();

          if (error) return;

          if (!pendingBooking) {
            setPaymentConfirmed(true);
            clearInterval(pollInterval);
            toast.success("Pagamento confirmado!");
            setTimeout(() => navigate("/cliente"), 4000);
          }
        } catch (error) {
          console.error("Error polling payment status:", error);
        }
      }, 3000);

      return () => clearInterval(pollInterval);
    }
  }, [step, pixQrCode, pendingBookingId, paymentConfirmed, navigate]);

  /**
   * Busca o tenant_id associado ao cliente logado.
   * Prioridade: tenant_clientes → barbeiro do agendamento mais recente → null (DUB global)
   */
  const getClientTenantId = async (uid: string): Promise<string | null> => {
    // 1. Verificar tenant_clientes
    const { data: tenantCliente } = await supabase
      .from("tenant_clientes")
      .select("tenant_id")
      .eq("user_id", uid)
      .limit(1)
      .maybeSingle();

    if (tenantCliente?.tenant_id) return tenantCliente.tenant_id;

    // 2. Verificar agendamento mais recente para inferir tenant
    const { data: recentApt } = await supabase
      .from("agendamentos")
      .select("barbeiro_id")
      .eq("user_id", uid)
      .not("barbeiro_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentApt?.barbeiro_id) {
      const { data: barber } = await supabase
        .from("barbeiros")
        .select("tenant_id")
        .eq("id", recentApt.barbeiro_id)
        .single();
      return barber?.tenant_id ?? null;
    }

    return null;
  };

  const loadServices = async (tenantId?: string | null) => {
    let query = supabase
      .from("servicos")
      .select("id, nome, descricao, preco, duracao_minutos, ativo, tenant_id")
      .eq("ativo", true)
      .order("preco");

    // Filtrar por tenant: se tem tenant_id, filtrar; senão, mostrar globais (null)
    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    } else {
      query = query.is("tenant_id", null);
    }

    const { data } = await query;
    setServices(data || []);
  };

  const loadBarbers = async (tenantId?: string | null) => {
    let query = supabase
      .from("barbeiros")
      .select("id, apelido, foto_url, unidade_id")
      .eq("ativo", true)
      .is("deleted_at", null)
      .order("apelido");

    // Isolamento estrito por tenant no fluxo de cliente
    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    } else {
      query = query.is("tenant_id", null);
    }

    const { data } = await query;
    let filteredBarbers = data || [];

    // Aplicar bloqueios granulares (barber / unit / tenant)
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    const currentUserId = currentSession?.user?.id;

    if (tenantId && currentUserId) {
      const { data: blocks } = await supabase
        .from("client_booking_blocks")
        .select("scope, barbeiro_id, unidade_id")
        .eq("tenant_id", tenantId)
        .eq("client_user_id", currentUserId);

      if (blocks && blocks.length > 0) {
        // 1) Bloqueio total → nenhum barbeiro visível
        const hasTenantBlock = blocks.some((b) => b.scope === "tenant");
        if (hasTenantBlock) {
          setBarbers([]);
          return;
        }

        // 2) Bloqueio por unidade → remover barbeiros das unidades bloqueadas
        const unidadesBloqueadas = blocks
          .filter((b) => b.scope === "unit" && b.unidade_id)
          .map((b) => b.unidade_id!);

        if (unidadesBloqueadas.length > 0) {
          // Buscar barbeiros vinculados às unidades bloqueadas via tabela de junção
          const { data: barbeirosNasUnidades } = await supabase
            .from("barbeiro_unidades")
            .select("barbeiro_id")
            .in("unidade_id", unidadesBloqueadas);

          const idsBloqueadosPorUnidade = new Set([
            ...(barbeirosNasUnidades || []).map((b) => b.barbeiro_id),
            // Também considerar unidade_id direta do barbeiro
            ...filteredBarbers
              .filter((b) => b.unidade_id && unidadesBloqueadas.includes(b.unidade_id))
              .map((b) => b.id),
          ]);

          filteredBarbers = filteredBarbers.filter(
            (b) => !idsBloqueadosPorUnidade.has(b.id)
          );
        }

        // 3) Bloqueio individual → remover barbeiro específico
        const barbeirosBloqueados = new Set(
          blocks
            .filter((b) => b.scope === "barber" && b.barbeiro_id)
            .map((b) => b.barbeiro_id!)
        );

        if (barbeirosBloqueados.size > 0) {
          filteredBarbers = filteredBarbers.filter(
            (b) => !barbeirosBloqueados.has(b.id)
          );
        }
      }
    }

    setBarbers(filteredBarbers);

    // Se só tem 1 barbeiro NESTA barbearia, seleciona automaticamente
    if (filteredBarbers.length === 1) {
      setSelectedBarberId(filteredBarbers[0].id);
    }
  };

  const loadUserCredits = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      setUserId(session.user.id);

      const { data: creditsData, error } = await supabase
        .rpc("get_user_available_credits", { p_user_id: session.user.id });

      if (error) throw error;
      setAvailableCredits(creditsData || 0);
    } catch (error) {
      console.error("Error loading credits:", error);
    }
  };

  const loadAvailableRedemptions = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: redemptions, error } = await supabase
        .from("resgates")
        .select("id, promocao_id")
        .eq("user_id", session.user.id)
        .eq("status", "available")
        .is("used_at", null);

      if (error) throw error;
      setAvailableRedemptions(redemptions || []);
    } catch (error) {
      console.error("Error loading redemptions:", error);
    }
  };

  const loadActiveSubscription = async (): Promise<ActiveSubscription | null> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      // Busca assinatura ativa OU pendente de pagamento em dinheiro
      const { data: subscription, error } = await supabase
        .from("assinaturas")
        .select(`
          id,
          plano_id,
          next_billing_date,
          status,
          payment_method,
          plano:planos(nome, limite_agendamentos_mes, servico_id, preco_mensal)
        `)
        .eq("user_id", session.user.id)
        .in("status", ["active", "pending_cash"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) return null;

      if (subscription && subscription.plano) {
        const planoData = subscription.plano as any;
        const isPendingCash = subscription.status === 'pending_cash';

        // Para planos ativos, verificar vencimento
        if (!isPendingCash) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const billingDate = new Date(subscription.next_billing_date + 'T12:00:00');
          billingDate.setHours(0, 0, 0, 0);
          
          const isOverdue = today > billingDate;

          if (isOverdue) {
            setSubscriptionBlocked(true);
            toast.error("Seu plano está vencido. Regularize o pagamento para continuar agendando.");
            return null;
          }
        }

        // Conta usos vinculados à assinatura ATUAL (não global por user)
        // Isso garante que cancelar e reassinar reinicia a contagem
        const { data: usageRecords, error: countError } = await supabase
          .from("plano_agendamentos_usos")
          .select("id")
          .eq("assinatura_id", subscription.id)
          .is("released_at", null);

        const usedCount = countError ? 0 : (usageRecords?.length || 0);

        // Para pending_cash: permite apenas 1 agendamento (primeiro corte)
        const effectiveLimit = isPendingCash ? 1 : (planoData.limite_agendamentos_mes || 4);

        let servicoVinculado: Service | null = null;
        if (planoData.servico_id) {
          const { data: servicoData } = await supabase
            .from("servicos")
            .select("id, nome, descricao, duracao_minutos, preco")
            .eq("id", planoData.servico_id)
            .single();
          
          if (servicoData) {
            servicoVinculado = servicoData;
          }
        }

        const activeSubscriptionData: ActiveSubscription = {
          id: subscription.id,
          plano_id: subscription.plano_id,
          plano_nome: planoData.nome,
          limite_agendamentos_mes: effectiveLimit,
          agendamentos_usados: usedCount,
          next_billing_date: subscription.next_billing_date || '',
          status: subscription.status,
          servico_id: planoData.servico_id || null,
          servico: servicoVinculado,
          isPendingCash,
          preco_mensal: planoData.preco_mensal || 0,
        };

        setActiveSubscription(activeSubscriptionData);
        return activeSubscriptionData;
      }
      
      return null;
    } catch (error) {
      console.error("Error loading active subscription:", error);
      return null;
    }
  };

  const loadPendingBookingDetails = async (bookingId: string) => {
    try {
      const { data: booking, error } = await supabase
        .from("pending_bookings")
        .select(`*, servico:servicos(*)`)
        .eq("id", bookingId)
        .single();

      if (error) throw error;
      if (!booking) {
        toast.error("Reserva não encontrada ou expirada");
        navigate("/cliente");
        return;
      }

      setSelectedServices([booking.servico]);
      setSelectedDate(new Date(`${booking.data}T12:00:00`));
      setSelectedTime(booking.hora);
      setPendingBookingId(booking.id);

      if (booking.pix_qr_code && booking.pix_payload) {
        setPixQrCode(booking.pix_qr_code);
        setPixPayload(booking.pix_payload);
        setPaymentMethod('pix');
        setStep(6);
        toast.info("Continue o pagamento do seu agendamento PIX");
      } else {
        setStep(4);
        toast.info("Continue o pagamento do seu agendamento");
      }
    } catch (error) {
      console.error("Error loading pending booking:", error);
      toast.error("Erro ao carregar reserva");
      navigate("/cliente");
    }
  };

  const loadAppointmentForReschedule = async (appointmentId: string) => {
    try {
      const { data: appointment, error } = await supabase
        .from("agendamentos")
        .select(`id, data, hora, duracao, preco, status, barbeiro_id, servico_id, user_id, observacoes, payment_method, tipo_agendamento, is_free, servico:servicos(id, nome, descricao, duracao_minutos, preco)`)
        .eq("id", appointmentId)
        .single();

      if (error) throw error;
      if (!appointment) {
        toast.error("Agendamento não encontrado");
        sessionStorage.removeItem('isRescheduling');
        sessionStorage.removeItem('rescheduleAppointmentId');
        return;
      }

      setSelectedServices([appointment.servico]);
      // Manter o barbeiro original na remarcação
      if (appointment.barbeiro_id) {
        setRescheduleBarberId(appointment.barbeiro_id);
        setSelectedBarberId(appointment.barbeiro_id);
      }
      setStep(2); // Vai direto para data (pula barbeiro)
      toast.info("Escolha a nova data e horário");
    } catch (error) {
      console.error("Error loading appointment for reschedule:", error);
      toast.error("Erro ao carregar agendamento");
      sessionStorage.removeItem('isRescheduling');
      sessionStorage.removeItem('rescheduleAppointmentId');
    }
  };

  const toggleService = (service: Service) => {
    setSelectedServices(prev => {
      const exists = prev.find(s => s.id === service.id);
      if (exists) {
        return prev.filter(s => s.id !== service.id);
      } else {
        return [...prev, service];
      }
    });
  };

  const handleNextStep = async () => {
    // NOVO FLUXO:
    // Normal: step 1 = Serviços, step 2 = Barbeiro, step 3 = Data, step 4 = Horário, step 5 = Pagamento, step 6 = Confirmação
    // Plano:  step 1 = Barbeiro, step 2 = Data, step 3 = Horário, step 4 = Confirmação
    // Remarcação: step 2 = Data, step 3 = Horário, step 5 = Confirmação (mantém barbeiro original)
    
    // Validação de serviços (step 1 para normal)
    if (!isPlanFlow && !isRescheduling && step === 1 && selectedServices.length === 0) {
      toast.error("Selecione pelo menos um serviço");
      return;
    }
    
    // Validação de barbeiro
    const barberStep = isPlanFlow ? 1 : 2;
    if (!isRescheduling && step === barberStep && !selectedBarberId && barbers.length > 1) {
      toast.error("Selecione um barbeiro");
      return;
    }
    
    // Validação de data
    const dateStep = isPlanFlow ? 2 : (isRescheduling ? 2 : 3);
    if (step === dateStep && !selectedDate) {
      toast.error("Selecione uma data");
      return;
    }
    
    // Validação de horário
    const timeStep = isPlanFlow ? 3 : (isRescheduling ? 3 : 4);
    if (step === timeStep && !selectedTime) {
      toast.error("Selecione um horário");
      return;
    }
    
    // Verificar disponibilidade antes de avançar da etapa de horário
    if (step === timeStep && selectedDate && selectedTime) {
      setLoading(true);
      try {
        const result = await verifySlotAvailability(selectedTime);
        
        if (!result.available) {
          toast.error(result.message || "Este horário acabou de ser reservado. Por favor, escolha outro.");
          refreshSlots();
          setSelectedTime("");
          setLoading(false);
          return;
        }
        
        setLoading(false);
      } catch (err) {
        console.error('[handleNextStep] Erro:', err);
        setLoading(false);
        toast.error("Erro ao verificar disponibilidade. Tente novamente.");
        return;
      }
    }
    
    // Remarcação: vai direto para confirmação após horário (step 3 -> step 5)
    if (isRescheduling && step === 3) {
      setStep(5);
      return;
    }
    
    // Fluxo de plano: após horário (step 3), vai para confirmação (step 4)
    if (isPlanFlow && step === 3) {
      setStep(4);
      return;
    }

    // Fluxo normal: após horário (step 4), verifica plano ativo ou créditos
    if (!isPlanFlow && !isRescheduling && step === 4) {
      // Se tem plano ativo com usos, pula pagamento e vai direto para confirmação
      if (hasActivePlanWithUses) {
        setStep(5); // Confirmação — handlePayment detectará o plano
        return;
      }
      const totalPrice = getTotalPrice();
      if (availableCredits >= totalPrice) {
        setPaymentMethod('cash');
        setStep(6); // Vai para confirmação
        return;
      }
      // Vai para pagamento
      setStep(5);
      return;
    }
    
    setStep(step + 1);
  };

  const handlePayment = async () => {
    if (!selectedDate || !selectedTime || selectedServices.length === 0) {
      toast.error("Dados do agendamento inválidos");
      return;
    }

    // Forçar uso do plano quando elegível (fluxo com servico_id)
    // OU quando tem plano ativo com usos disponíveis (fluxo sem servico_id)
    if (isPlanEligible || (!isPlanFlow && hasActivePlanWithUses && !isRescheduling)) {
      await createAppointmentWithPlan();
      return;
    }

    const totalPrice = getTotalPrice();
    const finalPrice = Math.max(0, totalPrice - availableCredits);

    if (totalPrice === 0 && useRedemption) {
      await createAppointmentWithRedemption();
      return;
    }

    if (finalPrice === 0) {
      await createAppointmentWithCredits(totalPrice);
      return;
    }

    if (paymentMethod === 'card') {
      if (!cardHolderName || !cardNumber || !cardExpiryMonth || !cardExpiryYear || !cardCvv || !cardCpf) {
        toast.error("Preencha todos os dados do cartão");
        return;
      }
    }

    setProcessingPayment(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Você precisa estar logado");
        navigate("/auth");
        return;
      }

      const totalDuration = selectedServices.reduce((sum, s) => sum + getEffectiveDuration(s), 0);
      const serviceNames = selectedServices.map(s => s.nome).join(", ");

      const mainService = selectedServices[0];
      const bookingData = {
        servico_id: mainService.id,
        barbeiro_id: selectedBarberId,
        data: format(selectedDate, 'yyyy-MM-dd'),
        hora: selectedTime,
        duracao: totalDuration,
        preco: finalPrice,
        observacoes: selectedServices.length > 1 
          ? `Serviços: ${serviceNames}` 
          : undefined,
      };

      const payload: any = {
        bookingData,
        metodo: paymentMethod,
        creditsUsed: Math.min(availableCredits, totalPrice),
        rescheduleFromId: isRescheduling ? rescheduleAppointmentId : undefined,
      };

      if (paymentMethod === 'card') {
        payload.cardInfo = {
          holderName: cardHolderName.trim(),
          number: cardNumber.replace(/\s/g, ''),
          expiryMonth: cardExpiryMonth.trim(),
          expiryYear: cardExpiryYear.trim(),
          ccv: cardCvv.trim(),
        };

        payload.customerInfo = {
          name: cardHolderName.trim(),
          email: session.user.email,
          cpf: cardCpf.replace(/\D/g, ''),
        };
      }

      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: payload,
      });

      if (error) throw error;

      if (availableCredits > 0 && data.appointmentId) {
        await useCredits(Math.min(availableCredits, totalPrice), data.appointmentId);
      }

      if (useRedemption && data.appointmentId) {
        await markRedemptionAsUsed(data.appointmentId);
      }

      if (paymentMethod === 'cash') {
        sessionStorage.removeItem('isRescheduling');
        sessionStorage.removeItem('rescheduleAppointmentId');
        
        const { data: profile } = await supabase.from('profiles').select('nome, telefone').eq('id', session.user.id).single();
        sendNovoAgendamentoEvent({
          agendamento_id: data.appointmentId || '',
          cliente_id: session.user.id,
          cliente_nome: profile?.nome || session.user.email || 'Cliente',
          cliente_telefone: profile?.telefone,
          servico: serviceNames,
          data: format(selectedDate, 'yyyy-MM-dd'),
          hora: selectedTime,
          preco: finalPrice
        });
        
        toast.success("Agendamento criado! Pague na barbearia.");
        navigate("/cliente");
      } else if (paymentMethod === 'pix' && data.asaasPayment?.pixQrCode) {
        setPixQrCode(data.asaasPayment.pixQrCode.encodedImage);
        setPixPayload(data.asaasPayment.pixQrCode.payload);
        setPendingBookingId(data.pendingBookingId || null);
        toast.success("QR Code gerado! Escaneie para pagar.");
        setStep(6);
      } else if (paymentMethod === 'card') {
        sessionStorage.removeItem('isRescheduling');
        sessionStorage.removeItem('rescheduleAppointmentId');
        
        if (data.asaasPayment?.status === 'CONFIRMED') {
          toast.success("Pagamento aprovado! Agendamento confirmado.");
          navigate("/cliente");
        } else {
          toast.error("Pagamento recusado. Verifique os dados do cartão.");
        }
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      
      if (error.message?.includes('TIME_SLOT_UNAVAILABLE') || error.message?.includes('indisponível') || error.message?.includes('Horário')) {
        toast.error(error.message || "Horário indisponível. Escolha outro horário.");
        setStep(3);
        refreshSlots();
      } else {
        toast.error("Erro ao processar pagamento: " + (error.message || "Erro desconhecido"));
      }
    } finally {
      setProcessingPayment(false);
    }
  };

  const createAppointmentWithRedemption = async () => {
    setProcessingPayment(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Você precisa estar logado");
        navigate("/auth");
        return;
      }

      const totalDuration = selectedServices.reduce((sum, s) => sum + getEffectiveDuration(s), 0);
      const serviceNames = selectedServices.map(s => s.nome).join(", ");
      const mainService = selectedServices[0];
      const dateStr = format(selectedDate!, 'yyyy-MM-dd');

      const { data: validation, error: validationError } = await supabase.functions.invoke('validate-appointment', {
        body: { data: dateStr, hora: selectedTime, duracao: totalDuration, userId: session.user.id }
      });

      const valResult1 = validation?.data ?? validation;
      if (validationError || !valResult1?.valid) {
        toast.error(valResult1?.message || "Horário indisponível. Escolha outro.");
        setStep(3);
        refreshSlots();
        return;
      }

      const { data: appointment, error: aptError } = await supabase
        .from("agendamentos")
        .insert({
          user_id: session.user.id,
          servico_id: mainService.id,
          barbeiro_id: selectedBarberId,
          data: dateStr,
          hora: selectedTime,
          duracao: totalDuration,
          preco: 0,
          status: "confirmed",
          observacoes: `Corte grátis - Resgate do programa de fidelidade. ${selectedServices.length > 1 ? 'Serviços: ' + serviceNames : ''}`,
          payment_method: 'resgate',
          is_free: true,
          barbeiro_confirmou: true,
          cliente_confirmou: true,
        })
        .select()
        .single();

      if (aptError) throw aptError;

      await markRedemptionAsUsed(appointment.id);

      const { data: profile } = await supabase.from('profiles').select('nome, telefone').eq('id', session.user.id).single();
      sendNovoAgendamentoEvent({
        agendamento_id: appointment.id,
        cliente_id: session.user.id,
        cliente_nome: profile?.nome || 'Cliente',
        cliente_telefone: profile?.telefone,
        servico: serviceNames,
        data: dateStr,
        hora: selectedTime,
        preco: 0
      });

      toast.success("Corte grátis resgatado com sucesso!");
      navigate("/cliente");
    } catch (error: any) {
      console.error('Error creating appointment with redemption:', error);
      toast.error("Erro ao criar agendamento: " + (error.message || "Erro desconhecido"));
    } finally {
      setProcessingPayment(false);
    }
  };

  const createAppointmentWithCredits = async (totalPrice: number) => {
    setProcessingPayment(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Você precisa estar logado");
        navigate("/auth");
        return;
      }

      const totalDuration = selectedServices.reduce((sum, s) => sum + getEffectiveDuration(s), 0);
      const serviceNames = selectedServices.map(s => s.nome).join(", ");
      const mainService = selectedServices[0];
      const dateStr = format(selectedDate!, 'yyyy-MM-dd');

      const { data: validation, error: validationError } = await supabase.functions.invoke('validate-appointment', {
        body: {
          data: dateStr,
          hora: selectedTime,
          duracao: totalDuration,
          userId: session.user.id,
          excludeAppointmentId: isRescheduling ? rescheduleAppointmentId : undefined
        }
      });

      if (validationError) {
        toast.error("Erro ao verificar disponibilidade. Tente novamente.");
        return;
      }

      const valResult2 = validation?.data ?? validation;
      if (!valResult2?.valid) {
        toast.error(valResult2?.message || "Horário indisponível. Escolha outro horário.");
        setStep(3);
        refreshSlots();
        return;
      }

      if (isRescheduling && rescheduleAppointmentId) {
        await supabase
          .from("agendamentos")
          .update({ 
            status: 'cancelled_by_user' as any,
            visivel_para_usuario: false
          } as any)
          .eq("id", rescheduleAppointmentId);
      }

      const creditUsedAmount = Math.min(availableCredits, totalPrice);
      const observacoesText = selectedServices.length > 1 
        ? `Serviços: ${serviceNames}. Pago com crédito do app: R$ ${creditUsedAmount.toFixed(2)}`
        : `Pago com crédito do app: R$ ${creditUsedAmount.toFixed(2)}`;

      const { data: appointment, error: aptError } = await supabase
        .from("agendamentos")
        .insert({
          user_id: session.user.id,
          servico_id: mainService.id,
          barbeiro_id: selectedBarberId,
          data: dateStr,
          hora: selectedTime,
          duracao: totalDuration,
          preco: 0,
          status: "confirmed",
          observacoes: observacoesText,
          payment_method: 'credit',
          is_free: true,
          remarcado_de: isRescheduling ? rescheduleAppointmentId : null,
          barbeiro_confirmou: true,
          cliente_confirmou: true,
        })
        .select()
        .single();

      if (aptError) throw aptError;

      await supabase
        .from("pagamentos")
        .insert({
          user_id: session.user.id,
          agendamento_id: appointment.id,
          metodo: "cash",
          valor: 0,
          status: "paid",
        });

      await useCredits(totalPrice, appointment.id);

      if (useRedemption) {
        await markRedemptionAsUsed(appointment.id);
      }

      sessionStorage.removeItem('isRescheduling');
      sessionStorage.removeItem('rescheduleAppointmentId');

      const { data: profile } = await supabase.from('profiles').select('nome, telefone').eq('id', session.user.id).single();
      sendNovoAgendamentoEvent({
        agendamento_id: appointment.id,
        cliente_id: session.user.id,
        cliente_nome: profile?.nome || session.user.email || 'Cliente',
        cliente_telefone: profile?.telefone,
        servico: serviceNames,
        data: dateStr,
        hora: selectedTime,
        preco: 0
      });

      toast.success("Agendamento criado! Créditos aplicados com sucesso.");
      navigate("/cliente");
    } catch (error: any) {
      console.error('Error creating appointment with credits:', error);
      toast.error("Erro ao criar agendamento: " + (error.message || "Erro desconhecido"));
    } finally {
      setProcessingPayment(false);
    }
  };

  const createAppointmentWithPlan = async () => {
    if (!activeSubscription) {
      toast.error("Assinatura não encontrada");
      return;
    }

    setProcessingPayment(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Você precisa estar logado");
        navigate("/auth");
        return;
      }

      const totalDuration = selectedServices.reduce((sum, s) => sum + getEffectiveDuration(s), 0);
      const serviceNames = selectedServices.map(s => s.nome).join(", ");
      const mainService = selectedServices[0];
      const dateStr = format(selectedDate!, 'yyyy-MM-dd');

      const { data: validation, error: validationError } = await supabase.functions.invoke('validate-appointment', {
        body: {
          data: dateStr,
          hora: selectedTime,
          duracao: totalDuration,
          userId: session.user.id
        }
      });

      if (validationError) {
        toast.error("Erro ao verificar disponibilidade. Tente novamente.");
        return;
      }

      const valResult3 = validation?.data ?? validation;
      if (!valResult3?.valid) {
        toast.error(valResult3?.message || "Horário indisponível. Escolha outro horário.");
        setStep(3);
        refreshSlots();
        return;
      }

      // Determinar se é primeiro corte de plano cash (pendente de pagamento)
      const isPendingCash = activeSubscription.isPendingCash === true;
      const precoAgendamento = isPendingCash ? (activeSubscription.preco_mensal || 0) : 0;
      const observacoesBase = isPendingCash
        ? `⚠️ PRIMEIRO CORTE — Cobrar R$ ${precoAgendamento.toFixed(2).replace('.', ',')} do plano ${activeSubscription.plano_nome}. ${selectedServices.length > 1 ? 'Serviços: ' + serviceNames : ''}`
        : `Agendamento via ${activeSubscription.plano_nome}. ${selectedServices.length > 1 ? 'Serviços: ' + serviceNames : ''}`;

      const { data: appointment, error: aptError } = await supabase
        .from("agendamentos")
        .insert({
          user_id: session.user.id,
          servico_id: mainService.id,
          barbeiro_id: selectedBarberId,
          data: dateStr,
          hora: selectedTime,
          duracao: totalDuration,
          preco: precoAgendamento,
          status: "confirmed",
          observacoes: observacoesBase,
          payment_method: 'plano',
          tipo_agendamento: 'plano',
          is_free: !isPendingCash,
          barbeiro_confirmou: true,
          cliente_confirmou: true,
        })
        .select()
        .single();

      if (aptError) throw aptError;

      // Registrar pagamento — pending se for cash pendente, paid se plano já ativo
      await supabase
        .from("pagamentos")
        .insert({
          user_id: session.user.id,
          agendamento_id: appointment.id,
          metodo: "cash",
          valor: precoAgendamento,
          status: isPendingCash ? "pending" : "paid",
        });

      const { data: profile } = await supabase.from('profiles').select('nome, telefone').eq('id', session.user.id).single();
      sendNovoAgendamentoEvent({
        agendamento_id: appointment.id,
        cliente_id: session.user.id,
        cliente_nome: profile?.nome || session.user.email || 'Cliente',
        cliente_telefone: profile?.telefone,
        servico: serviceNames,
        data: dateStr,
        hora: selectedTime,
        preco: precoAgendamento
      });

      if (isPendingCash) {
        toast.success(`Agendamento criado! Pague R$ ${precoAgendamento.toFixed(2).replace('.', ',')} na barbearia para ativar seu plano.`);
      } else {
        toast.success(`Agendamento criado! Usando seu ${activeSubscription.plano_nome}.`);
      }
      navigate("/cliente");
    } catch (error: any) {
      console.error('Error creating appointment with plan:', error);
      toast.error("Erro ao criar agendamento: " + (error.message || "Erro desconhecido"));
    } finally {
      setProcessingPayment(false);
    }
  };

  const useCredits = async (amount: number, appointmentId: string) => {
    if (!userId || amount <= 0) return;

    try {
      const { data, error } = await supabase.rpc('use_credits_atomic', {
        p_user_id: userId,
        p_appointment_id: appointmentId,
        p_amount: amount
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; used_amount?: number } | null;

      if (!result?.success) {
        throw new Error(result?.error || 'Erro ao debitar créditos');
      }

      setAvailableCredits(prev => Math.max(0, prev - amount));
    } catch (error) {
      console.error("Error using credits:", error);
      throw error;
    }
  };

  const markRedemptionAsUsed = async (appointmentId: string) => {
    if (!useRedemption || availableRedemptions.length === 0) return;
    
    const redemptionToUse = availableRedemptions[0];
    try {
      const { error } = await supabase
        .from("resgates")
        .update({
          status: "used",
          used_at: new Date().toISOString(),
          appointment_id: appointmentId
        })
        .eq("id", redemptionToUse.id);

      if (error) throw error;
      
      setAvailableRedemptions(prev => prev.filter(r => r.id !== redemptionToUse.id));
      setUseRedemption(false);
    } catch (error) {
      console.error("Error marking redemption as used:", error);
    }
  };

  const handleRescheduleUpdate = async () => {
    if (!rescheduleAppointmentId || !selectedDate || !selectedTime) {
      toast.error("Dados incompletos para remarcação");
      return;
    }

    setProcessingPayment(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Você precisa estar logado");
        navigate("/auth");
        return;
      }

      const totalDuration = selectedServices.reduce((sum, s) => sum + getEffectiveDuration(s), 0);
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      
      const { data: validation, error: validationError } = await supabase.functions.invoke('validate-appointment', {
        body: {
          data: dateStr,
          hora: selectedTime,
          duracao: totalDuration,
          userId: session.user.id,
          excludeAppointmentId: rescheduleAppointmentId
        }
      });

      if (validationError) {
        toast.error("Erro ao verificar disponibilidade. Tente novamente.");
        return;
      }

      const valResult4 = validation?.data ?? validation;
      if (!valResult4?.valid) {
        toast.error(valResult4?.message || "Horário indisponível. Escolha outro horário.");
        setStep(3);
        refreshSlots();
        return;
      }
      
      const { error } = await supabase
        .from("agendamentos")
        .update({
          data: dateStr,
          hora: selectedTime,
          duracao: totalDuration,
          status: 'confirmed',
          barbeiro_confirmou: true,
          cliente_confirmou: true,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", rescheduleAppointmentId);

      if (error) throw error;

      sessionStorage.removeItem('isRescheduling');
      sessionStorage.removeItem('rescheduleAppointmentId');

      const { data: profile } = await supabase.from('profiles').select('nome, telefone').eq('id', session.user.id).single();
      const mainService = selectedServices[0];
      sendRemarcacaoConcluidaEvent({
        agendamento_id: rescheduleAppointmentId,
        cliente_id: session.user.id,
        cliente_nome: profile?.nome || session.user.email || 'Cliente',
        servico: mainService?.nome || 'Serviço',
        data: dateStr,
        hora: selectedTime,
        preco: mainService?.preco
      });

      toast.success("Agendamento remarcado com sucesso!");
      navigate("/cliente");
    } catch (error: any) {
      console.error("Error rescheduling:", error);
      toast.error("Erro ao remarcar: " + (error.message || "Erro desconhecido"));
    } finally {
      setProcessingPayment(false);
    }
  };

  const getTotalDuration = () => {
    return selectedServices.reduce((sum, s) => sum + getEffectiveDuration(s), 0);
  };

  const getCorteService = () => {
    return selectedServices.find(s => 
      s.nome.toLowerCase().includes('corte') && 
      !s.nome.toLowerCase().includes('barba')
    );
  };

  const getRedemptionDiscount = () => {
    if (!useRedemption || availableRedemptions.length === 0) return 0;
    const corteService = getCorteService();
    if (!corteService) return 0;
    return corteService.preco;
  };

  const getTotalPrice = () => {
    const baseTotal = selectedServices.reduce((sum, s) => sum + s.preco, 0);
    const redemptionDiscount = getRedemptionDiscount();
    return Math.max(0, baseTotal - redemptionDiscount);
  };

  const canUseRedemption = availableRedemptions.length > 0 && !!getCorteService();

  const handleBack = () => {
    if (isPlanFlow) {
      // Fluxo de plano: step 1 = Barbeiro, step 2 = Data, step 3 = Horário, step 4 = Confirmação
      if (step === 1) {
        navigate("/cliente");
      } else if (step === 4) {
        setStep(3);
      } else {
        setStep(step - 1);
      }
    } else if (isRescheduling) {
      // Fluxo de remarcação: step 2 = Data, step 3 = Horário, step 5 = Confirmação
      if (step === 2) {
        navigate("/cliente");
      } else if (step === 5) {
        setStep(3);
      } else {
        setStep(step - 1);
      }
    } else {
      // Fluxo normal: step 1 = Serviços, step 2 = Barbeiro, step 3 = Data, step 4 = Horário, step 5 = Pagamento, step 6 = Confirmação
      if (step === 1) {
        navigate("/cliente");
      } else if (step === 6) {
        setStep(5);
      } else {
        setStep(step - 1);
      }
    }
  };

  // Helper para obter o nome do barbeiro selecionado
  const getSelectedBarberName = () => {
    const barber = barbers.find(b => b.id === selectedBarberId);
    return barber?.apelido || '';
  };

  const handleCopyPix = () => {
    if (pixPayload) {
      navigator.clipboard.writeText(pixPayload);
      setCopied(true);
      toast.success("Código PIX copiado!");
      setTimeout(() => setCopied(false), 3000);
    }
  };

  // Cálculo dinâmico das bolinhas de progresso
  // Plano: 3 etapas (Data, Horário, Confirmação)
  // Remarcação: 3 etapas (Data, Horário, Confirmação)
  // Normal: 5 etapas (Serviços, Data, Horário, Pagamento, Confirmação)
  const totalSteps = isPlanFlow ? 3 : isRescheduling ? 3 : 5;
  
  // Mapear step interno para step visual
  const currentDisplayStep = (() => {
    if (isPlanFlow) {
      // Para plano: step 1-3 mapeiam direto para bolinhas 1-3
      return Math.min(step, 3);
    }
    if (isRescheduling) {
      // Para remarcação: step 2 = 1, step 3 = 2, step 5 = 3
      if (step === 2) return 1;
      if (step === 3) return 2;
      if (step === 5) return 3;
      return step;
    }
    // Normal: step mapeado direto
    return step;
  })();

  const pageVariants = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 }
  };

  // Tela de Limite Atingido - para quando o usuário já usou todos os agendamentos do plano
  if (subscriptionLimitReached) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 mx-auto mb-6 bg-destructive/10 rounded-full flex items-center justify-center">
            <Clock className="w-10 h-10 text-destructive" />
          </div>
          
          <h1 className="text-2xl font-bold text-foreground mb-3">
            Limite Mensal Atingido
          </h1>
          
          <p className="text-muted-foreground mb-6">
            Você já utilizou todos os {activeSubscription?.limite_agendamentos_mes || 4} agendamentos 
            do seu plano <span className="text-primary font-semibold">{activeSubscription?.plano_nome}</span> este mês.
          </p>
          
          <div className="bg-card border border-border rounded-2xl p-4 mb-6">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">Agendamentos usados</span>
              <span className="text-foreground font-semibold">
                {activeSubscription?.agendamentos_usados}/{activeSubscription?.limite_agendamentos_mes}
              </span>
            </div>
          </div>
          
          <p className="text-sm text-muted-foreground mb-6">
            O limite será renovado no próximo período de cobrança.
          </p>
          
          <button
            onClick={() => navigate("/cliente")}
            className="w-full py-3.5 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-all"
          >
            Voltar para Início
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header Minimalista - Apenas Setinha + Bolinhas */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-b border-border/50">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Botão Voltar */}
            <button
              type="button"
              onClick={handleBack}
              aria-label="Voltar"
              className="h-10 w-10 flex items-center justify-center rounded-full text-foreground/85 active:scale-95 transition-transform"
            >
              <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
            </button>

            {/* Bolinhas de Etapas */}
            <StepDots currentStep={currentDisplayStep} totalSteps={totalSteps} />

            {/* Espaço vazio para balancear */}
            <div className="w-10" />
          </div>
        </div>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {/* Step 1: Serviços (APENAS para usuários SEM plano) */}
        {step === 1 && !isPlanFlow && (
          <motion.div
            key="step-1-services"
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.3 }}
            className="min-h-screen pt-20 pb-32 px-4"
          >
            <div className="max-w-2xl mx-auto">
              {/* Título da Etapa */}
              <div className="mb-6 pt-4">
                <h2 className="text-xl font-semibold text-foreground">
                  Escolha os Serviços
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Selecione um ou mais serviços
                </p>
              </div>

              <div ref={servicesListRef} className="space-y-3">
                {services.map((service) => (
                  <ServiceCard
                    key={service.id}
                    service={service}
                    isSelected={selectedServices.some(s => s.id === service.id)}
                    onToggle={() => toggleService(service)}
                  />
                ))}
              </div>

              {/* Premium Bottom Bar */}
              <BookingBottomBar
                serviceCount={selectedServices.length}
                totalDuration={getTotalDuration()}
                totalPrice={getTotalPrice()}
                serviceName={selectedServices.length === 1 ? selectedServices[0]?.nome : `${selectedServices.length} serviços`}
                onContinue={() => setStep(2)}
                isVisible={selectedServices.length > 0}
              />
            </div>
          </motion.div>
        )}

        {/* Step 1 (Plano) ou Step 2 (Normal): Data */}
        {((isPlanFlow && step === 1) || (!isPlanFlow && step === 2)) && (
          <motion.div
            key="step-date"
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.3 }}
            className="min-h-screen pt-20 pb-24 px-4"
          >
            <div className="max-w-2xl mx-auto">
              {/* Título da Etapa */}
              <div className="mb-6 pt-4">
                <h2 className="text-xl font-semibold text-foreground">
                  Escolha a Data
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {isPlanFlow && activeSubscription ? (
                    <>Serviço: <span className="text-primary font-medium">{activeSubscription.servico?.nome}</span></>
                  ) : (
                    "Selecione o dia desejado"
                  )}
                </p>
              </div>

              <PremiumCalendar
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
              />

              {selectedDate && (
                <button
                  onClick={handleNextStep}
                  className="w-full mt-6 py-3.5 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-all"
                >
                  Continuar
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* Step 2 (Plano) ou Step 3 (Normal): Horário */}
        {((isPlanFlow && step === 2) || (!isPlanFlow && step === 3)) && (
          <motion.div
            key="step-time"
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.3 }}
            className="min-h-screen pt-20 pb-32 px-4"
          >
            <div className="max-w-2xl mx-auto">
              {/* Título da Etapa */}
              <div className="mb-6 pt-4">
                <h2 className="text-xl font-semibold text-foreground">
                  Escolha o Horário
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedDate ? format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR }) : ""}
                </p>
              </div>

              {loadingSlots ? (
                <div className="bg-card border border-border rounded-2xl p-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-primary/20 mx-auto flex items-center justify-center mb-4">
                    <Clock className="w-6 h-6 text-primary animate-spin" />
                  </div>
                  <p className="text-sm text-muted-foreground">Carregando horários...</p>
                </div>
              ) : availableSlots.filter(slot => slot.available).length === 0 ? (
                <div className="bg-card border border-border rounded-2xl p-8 text-center">
                  <p className="text-muted-foreground font-medium mb-4">
                    Agenda cheia neste dia.
                  </p>
                  <button
                    onClick={() => setStep(isPlanFlow ? 1 : 2)}
                    className="px-6 py-3 border border-border rounded-xl text-foreground hover:bg-secondary transition-all"
                  >
                    Escolher outra data
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    {availableSlots.map((slot) => (
                      <TimeSlot
                        key={slot.time}
                        time={slot.time}
                        isSelected={selectedTime === slot.time}
                        isDisabled={!slot.available}
                        onSelect={() => {
                          if (slot.available) {
                            setSelectedTime(slot.time);
                            setUnavailableMessage(null);
                          } else {
                            if (slot.blockedReason === 'minimum_advance') {
                              setUnavailableMessage("É necessário 30 minutos de antecedência.");
                            } else {
                              setUnavailableMessage("Este horário já foi agendado.");
                            }
                          }
                        }}
                      />
                    ))}
                  </div>

                  {unavailableMessage && (
                    <div className="mt-4 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-center">
                      <p className="text-sm text-destructive font-medium">{unavailableMessage}</p>
                    </div>
                  )}

                  {/* Premium Time Selection Bar */}
                  <TimeSelectionBar
                    selectedDate={selectedDate || null}
                    selectedTime={selectedTime}
                    formattedDate={selectedDate ? format(selectedDate, 'd/MM') : ''}
                    onContinue={handleNextStep}
                    isVisible={!!selectedTime}
                    isLoading={loading}
                  />
                </>
              )}
            </div>
          </motion.div>
        )}

        {/* Step 4: Pagamento (APENAS para usuários SEM plano) */}
        {step === 4 && !isRescheduling && !isPlanFlow && (
          <motion.div
            key="step-4"
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.3 }}
            className="min-h-screen pt-20 pb-24 px-4"
          >
            <div className="max-w-2xl mx-auto">
              {/* Título da Etapa */}
              <div className="mb-6 pt-4">
                <h2 className="text-xl font-semibold text-foreground">
                  Forma de Pagamento
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Escolha como deseja pagar
                </p>
              </div>

              <div className="space-y-3">
                {/* Aviso de plano esgotado — opções normais permanecem visíveis */}
                {isPlanExhausted && (
                  <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-3 mb-3">
                    <p className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">
                      ⚠️ Limite do plano atingido este mês
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Você usou todos os {activeSubscription?.limite_agendamentos_mes} cortes
                      do seu plano. Escolha outra forma de pagamento.
                    </p>
                  </div>
                )}

                {/* Opções normais — só aparecem quando NÃO tem plano com usos disponíveis */}
                {!hasActivePlanWithUses && (
                  <>
                    <PaymentOption
                      value="pix"
                      selected={paymentMethod === 'pix'}
                      onSelect={() => setPaymentMethod('pix')}
                      title="PIX"
                      description="Pagamento instantâneo via QR Code"
                    />

                    <PaymentOption
                      value="card"
                      selected={paymentMethod === 'card'}
                      onSelect={() => setPaymentMethod('card')}
                      title="Cartão de Crédito"
                      description="Pagamento aprovado na hora"
                    />

                    <PaymentOption
                      value="cash"
                      selected={paymentMethod === 'cash'}
                      onSelect={() => setPaymentMethod('cash')}
                      title="Pagar na Barbearia"
                      description="Pagamento presencial no dia"
                    />

                    {/* Resgate Grátis */}
                    {canUseRedemption && (
                      <div className="relative mt-6">
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                          <div className="bg-gradient-to-r from-orange-500 to-yellow-500 text-black text-xs font-bold px-3 py-1 rounded-full">
                            RESGATE DISPONÍVEL
                          </div>
                        </div>
                        
                        <button
                          onClick={() => setUseRedemption(!useRedemption)}
                          className={cn(
                            "w-full text-left rounded-2xl p-5 transition-all duration-200 border",
                            useRedemption 
                              ? "bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/50" 
                              : "bg-gradient-to-br from-orange-500/5 to-yellow-500/5 border-orange-500/30 hover:border-orange-500/50"
                          )}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <h3 className="text-base font-semibold text-foreground mb-1">
                                Corte Grátis Disponível
                              </h3>
                              <p className="text-sm text-muted-foreground">
                                Você tem {availableRedemptions.length} resgate{availableRedemptions.length > 1 ? 's' : ''} do programa de fidelidade
                              </p>
                            </div>
                            <div className={cn(
                              "flex-shrink-0 w-6 h-6 rounded-full border-2 transition-all flex items-center justify-center mt-0.5",
                              useRedemption 
                                ? "bg-green-500 border-green-500"
                                : "border-orange-500/50"
                            )}>
                              {useRedemption && (
                                <Check className="w-4 h-4 text-primary-foreground" strokeWidth={3} />
                              )}
                            </div>
                          </div>
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* Plano ativo com usos — forçar pagamento via plano */}
                {hasActivePlanWithUses && (
                  <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                        <Crown className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{activeSubscription?.plano_nome}</p>
                        <p className="text-sm text-muted-foreground">
                          {activeSubscription?.isPendingCash ? 'Primeiro corte — pagamento na barbearia' : 'Plano ativo'}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Este agendamento será descontado do seu plano.
                    </p>
                    <div className="flex justify-between items-center pt-2 border-t border-primary/20">
                      <span className="text-xs text-muted-foreground">Agendamentos este mês</span>
                      <span className="text-sm font-semibold text-foreground">
                        {(activeSubscription?.agendamentos_usados || 0)}/{activeSubscription?.limite_agendamentos_mes || 4}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Resumo de valores — apenas quando NÃO é plano */}
              {!hasActivePlanWithUses && (
                <div className="mt-6 bg-card border border-border rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-muted-foreground text-sm">Valor do serviço</span>
                    <span className={cn(
                      "text-foreground font-semibold",
                      useRedemption && getCorteService() && "line-through text-muted-foreground"
                    )}>
                      R$ {selectedServices.reduce((sum, s) => sum + s.preco, 0).toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                  
                  {useRedemption && getRedemptionDiscount() > 0 && (
                    <div className="flex items-center justify-between text-success font-semibold text-sm">
                      <span>Desconto (resgate)</span>
                      <span>-R$ {getRedemptionDiscount().toFixed(2).replace('.', ',')}</span>
                    </div>
                  )}

                  {availableCredits > 0 && getTotalPrice() > 0 && (
                    <div className="flex items-center justify-between text-success text-sm mt-2">
                      <span>Créditos aplicados</span>
                      <span>-R$ {Math.min(availableCredits, getTotalPrice()).toFixed(2).replace('.', ',')}</span>
                    </div>
                  )}
                  
                  <div className="border-t border-border mt-4 pt-4">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">Valor a pagar</span>
                      <span className="text-2xl font-bold text-primary">
                        R$ {Math.max(0, getTotalPrice() - availableCredits).toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={hasActivePlanWithUses ? handlePayment : () => setStep(5)}
                disabled={hasActivePlanWithUses && processingPayment}
                className="w-full mt-6 py-3.5 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {hasActivePlanWithUses
                  ? (processingPayment ? 'Agendando...' : 'Confirmar Agendamento')
                  : 'Continuar'
                }
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 3 (Plano) Confirmação - Tela limpa e profissional para usuários de plano */}
        {isPlanFlow && step === 3 && (
          <motion.div
            key="step-plan-confirmation"
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.3 }}
            className="min-h-screen pt-20 pb-24 px-4"
          >
            <div className="max-w-2xl mx-auto">
              {/* Título da Etapa */}
              <div className="mb-6 pt-4">
                <h2 className="text-xl font-semibold text-foreground">
                  Confirmar Agendamento
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Revise os detalhes do seu horário
                </p>
              </div>

              {/* Card de resumo - Layout limpo para plano */}
              <div className="bg-card border border-border rounded-2xl p-5 space-y-4 mb-6">
                <SummaryRow 
                  label="Serviço"
                  value={selectedServices.map(s => s.nome).join(", ")}
                />
                
                <div className="border-t border-border" />
                
                <SummaryRow 
                  label="Duração"
                  value={`${getTotalDuration()} minutos`}
                />
                
                <div className="border-t border-border" />
                
                <SummaryRow 
                  label="Data"
                  value={selectedDate ? format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : ""}
                />
                
                <div className="border-t border-border" />
                
                <SummaryRow 
                  label="Horário"
                  value={selectedTime}
                />
              </div>

              {/* Card do Plano - Destaque elegante */}
              <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/30 rounded-2xl p-5 mb-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <Check className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{activeSubscription?.plano_nome}</p>
                    <p className="text-sm text-muted-foreground">
                      {activeSubscription?.isPendingCash ? 'Primeiro corte — pagamento na barbearia' : 'Plano ativo'}
                    </p>
                  </div>
                </div>
                
                <div className="flex justify-between items-center pt-3 border-t border-primary/20">
                  <span className="text-sm text-muted-foreground">Agendamentos este mês</span>
                  <span className="text-sm font-semibold text-foreground">
                    {(activeSubscription?.agendamentos_usados || 0) + 1}/{activeSubscription?.limite_agendamentos_mes || 4}
                  </span>
                </div>
              </div>

              <button
                onClick={handlePayment}
                disabled={processingPayment}
                className="w-full py-4 bg-primary text-primary-foreground text-base font-semibold rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
              >
                {processingPayment ? 'Agendando...' : 'Confirmar Agendamento'}
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 5: Confirmação (Usuários normais SEM plano) */}
        {step === 5 && !isRescheduling && !isPlanFlow && (
          <motion.div
            key="step-5"
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.3 }}
            className="min-h-screen pt-20 pb-24 px-4"
          >
            <div className="max-w-2xl mx-auto">
              {/* Título da Etapa */}
              <div className="mb-6 pt-4">
                <h2 className="text-xl font-semibold text-foreground">
                  Confirmar Agendamento
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Revise os detalhes antes de finalizar
                </p>
              </div>

              {/* Card de resumo */}
              <div className="bg-card border border-border rounded-2xl p-5 space-y-4 mb-6">
                <SummaryRow 
                  label="Serviço"
                  value={selectedServices.map(s => s.nome).join(", ")}
                />
                
                <div className="border-t border-border" />
                
                <SummaryRow 
                  label="Data"
                  value={selectedDate ? format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : ""}
                />
                
                <div className="border-t border-border" />
                
                <SummaryRow 
                  label="Horário"
                  value={selectedTime}
                />
                
                <div className="border-t border-border" />
                
                <SummaryRow 
                  label="Forma de Pagamento"
                  value={
                    hasActivePlanWithUses ? `${activeSubscription?.plano_nome || 'Plano'}` :
                    useRedemption && getTotalPrice() === 0 ? "Resgate de Fidelidade" :
                    availableCredits >= getTotalPrice() ? "Créditos do App" :
                    paymentMethod === 'pix' ? "PIX" :
                    paymentMethod === 'card' ? "Cartão de Crédito" :
                    "Pagar na Barbearia"
                  }
                />

                {/* Contador de usos do plano */}
                {hasActivePlanWithUses && (
                  <div className="flex justify-between items-center text-xs text-muted-foreground">
                    <span>Agendamentos este mês</span>
                    <span className="font-semibold text-foreground">
                      {(activeSubscription?.agendamentos_usados || 0) + 1}/{activeSubscription?.limite_agendamentos_mes || 4}
                    </span>
                  </div>
                )}

                {/* Total — só para pagamento avulso */}
                {!hasActivePlanWithUses && (
                  <div className="border-t border-border mt-4 pt-4">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">Total</span>
                      <span className="text-2xl font-bold text-primary">
                        R$ {Math.max(0, getTotalPrice() - availableCredits).toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Card Dados do Cartão — oculto quando plano ativo */}
              {!hasActivePlanWithUses && paymentMethod === 'card' && availableCredits < getTotalPrice() && (
                <div className="bg-card border border-border rounded-2xl p-5 mb-6 space-y-4">
                  <h3 className="text-base font-semibold text-foreground mb-3">Dados do Cartão</h3>
                  
                  <input
                    type="text"
                    placeholder="Nome no cartão"
                    value={cardHolderName}
                    onChange={(e) => setCardHolderName(e.target.value)}
                    className="w-full px-4 py-3 bg-secondary border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50"
                  />
                  
                  <input
                    type="text"
                    placeholder="Número do cartão"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    className="w-full px-4 py-3 bg-secondary border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50"
                  />
                  
                  <div className="grid grid-cols-3 gap-3">
                    <input
                      type="text"
                      placeholder="MM"
                      value={cardExpiryMonth}
                      onChange={(e) => setCardExpiryMonth(e.target.value)}
                      className="px-4 py-3 bg-secondary border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50"
                    />
                    <input
                      type="text"
                      placeholder="AA"
                      value={cardExpiryYear}
                      onChange={(e) => setCardExpiryYear(e.target.value)}
                      className="px-4 py-3 bg-secondary border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50"
                    />
                    <input
                      type="text"
                      placeholder="CVV"
                      value={cardCvv}
                      onChange={(e) => setCardCvv(e.target.value)}
                      className="px-4 py-3 bg-secondary border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50"
                    />
                  </div>
                  
                  <input
                    type="text"
                    placeholder="CPF do titular"
                    value={cardCpf}
                    onChange={(e) => setCardCpf(e.target.value)}
                    className="w-full px-4 py-3 bg-secondary border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50"
                  />
                </div>
              )}

              {/* Avisos contextuais — ocultos quando plano ativo */}
              {!hasActivePlanWithUses && paymentMethod === 'pix' && availableCredits < getTotalPrice() && (
                <div className="bg-gold/10 border border-gold/20 rounded-xl p-4 mb-6">
                  <p className="text-sm text-gold text-center">
                    Ao confirmar, o QR Code PIX será gerado
                  </p>
                </div>
              )}

              <button
                onClick={handlePayment}
                disabled={processingPayment}
                className="w-full py-4 bg-primary text-primary-foreground text-base font-semibold rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
              >
                {processingPayment ? 'Processando...' : 
                  hasActivePlanWithUses ? 'Confirmar Agendamento' :
                  availableCredits >= getTotalPrice() ? 'Confirmar (usando créditos)' :
                  paymentMethod === 'pix' ? 'Gerar QR Code PIX' :
                  'Confirmar Agendamento'
                }
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 5: Confirmação Remarcação */}
        {step === 5 && isRescheduling && (
          <motion.div
            key="step-5-reschedule"
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.3 }}
            className="min-h-screen pt-20 pb-24 px-4"
          >
            <div className="max-w-2xl mx-auto">
              {/* Título da Etapa */}
              <div className="mb-6 pt-4">
                <h2 className="text-xl font-semibold text-foreground">
                  Confirmar Remarcação
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Revise os novos dados
                </p>
              </div>

              <div className="bg-card border border-border rounded-2xl p-5 space-y-4 mb-6">
                <SummaryRow 
                  label="Nova Data"
                  value={selectedDate ? format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : ""}
                />
                
                <div className="border-t border-border" />
                
                <SummaryRow 
                  label="Novo Horário"
                  value={selectedTime}
                />
                
                <div className="border-t border-border" />
                
                <SummaryRow 
                  label="Serviço"
                  value={selectedServices[0]?.nome || ""}
                />
              </div>

              <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 mb-6">
                <p className="text-sm text-primary text-center">
                  O pagamento existente permanecerá válido
                </p>
              </div>

              <button
                onClick={handleRescheduleUpdate}
                disabled={processingPayment}
                className="w-full py-4 bg-primary text-primary-foreground text-base font-semibold rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
              >
                {processingPayment ? 'Remarcando...' : 'Confirmar Remarcação'}
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 6: QR Code PIX */}
        {step === 6 && pixQrCode && (
          <motion.div
            key="step-6"
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.3 }}
            className="min-h-screen bg-background pb-8"
          >
            {paymentConfirmed ? (
              <div className="min-h-screen flex flex-col items-center justify-center px-6">
                <div className="w-16 h-16 bg-success/20 rounded-full flex items-center justify-center mb-6">
                  <Check className="w-8 h-8 text-success" />
                </div>
                <h2 className="text-xl font-bold text-foreground mb-2">Pagamento confirmado!</h2>
                <p className="text-muted-foreground text-center text-sm mb-8">
                  Você será redirecionado automaticamente...
                </p>
                <button
                  onClick={() => navigate("/cliente")}
                  className="px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl"
                >
                  Ir para tela inicial
                </button>
              </div>
            ) : (
              <>
                {/* Header PIX */}
                <div className="bg-background border-b border-border px-4 py-4">
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => setStep(5)}
                      aria-label="Voltar"
                      className="h-10 w-10 flex items-center justify-center rounded-full text-foreground/85 active:scale-95 transition-transform"
                    >
                      <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
                    </button>
                    <div>
                      <h1 className="text-lg font-semibold text-foreground">
                        Pagamento PIX
                      </h1>
                      <p className="text-xs text-muted-foreground">
                        Escaneie ou copie o código
                      </p>
                    </div>
                  </div>
                </div>

                <div className="max-w-md mx-auto px-4 py-6">
                  {/* Valor */}
                  <div className="text-center mb-6">
                    <p className="text-xs text-muted-foreground mb-1">Valor a pagar</p>
                    <p className="text-3xl font-bold text-foreground">
                      R$ {Math.max(0, getTotalPrice() - availableCredits).toFixed(2).replace('.', ',')}
                    </p>
                  </div>

                  {/* QR Code */}
                  <div className="bg-white rounded-2xl p-6 mb-6 flex justify-center">
                    <img 
                      src={`data:image/png;base64,${pixQrCode}`} 
                      alt="QR Code PIX" 
                      className="w-52 h-52"
                    />
                  </div>

                  {/* Instruções */}
                  <div className="text-center mb-6">
                    <p className="text-sm text-muted-foreground">
                      Abra o app do seu banco e escaneie o código acima
                    </p>
                  </div>

                  {/* Código PIX para copiar */}
                  {pixPayload && (
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-center">
                        Ou copie o código
                      </p>
                      
                      <div className="bg-card rounded-xl p-3 border border-border">
                        <p className="text-xs font-mono text-muted-foreground break-all leading-relaxed">
                          {pixPayload}
                        </p>
                      </div>

                      <button
                        onClick={handleCopyPix}
                        className="w-full py-3.5 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                      >
                        <Copy className="w-4 h-4" />
                        {copied ? 'Copiado!' : 'Copiar Código PIX'}
                      </button>
                    </div>
                  )}

                  {/* Status de pagamento */}
                  <div className="mt-6 text-center">
                    <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
                      Aguardando confirmação
                    </div>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ClienteAgendar;
