import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { 
  format, 
  addDays, 
  subDays, 
  isToday, 
  isSameDay, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  addMonths, 
  subMonths, 
  isSameMonth 
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  Calendar, 
  Clock, 
  Scissors,
  Plus,
  Crown,
  CreditCard,
  Banknote,
  Gift,
  QrCode,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MobileManualBookingModal } from "./MobileManualBookingModal";
import { extractWalkInName, extractWhatsAppName, isWhatsAppAppointment } from "@/lib/walkInName";
import { WhatsAppBadge } from "@/components/shared/WhatsAppBadge";
import { readSyncCache, writeSyncCache } from "@/lib/syncQueryCache";
import { useOverdueAppointments } from "@/hooks/useOverdueAppointments";
import { PendingAppointmentsModal } from "@/components/barber/PendingAppointmentsModal";

interface MobileAppointment {
  id: string;
  data: string;
  hora: string;
  status: string;
  preco: number;
  observacoes: string | null;
  barbeiro_confirmou: boolean | null;
  is_free: boolean | null;
  payment_method: string | null;
  tipo_agendamento: string | null;
  user_id: string;
  servico_id: string;
  barbeiro_id?: string | null;
  duracao: number;
  profile: { nome: string; telefone?: string } | null;
  servico: { nome: string; duracao_minutos: number } | null;
  planUsage?: { used: number; limit: number } | null;
}

interface AdminMobileAgendaProps {
  onAppointmentClick?: (appointment: MobileAppointment) => void;
  onAddClick?: (date: string, time: string) => void;
  barbeiroId?: string | null;
  tenantId?: string | null;
  title?: string;
  onBack?: () => void;
  showBack?: boolean;
}

/** Status oficial do sistema com cores claras:
 * - Concluído: VERDE (emerald)
 * - Agendado: AZUL (blue)
 * - Pendente: ÂMBAR (amber)
 * - Não veio: VERMELHO (rose)
 */
const getStatusConfig = (status: string, barbeiroConfirmou: boolean | null) => {
  if (status === "completed") {
    return {
      dot: "bg-[#34C759] dark:bg-[#30D158]",
      barColor: "bg-[#34C759] dark:bg-[#30D158]",
      barColorDone: "bg-[#34C759]/40 dark:bg-[#30D158]/40",
      textColor: "text-muted-foreground/75",
      statusLabel: "Concluído",
    };
  }
  if (status === "no_show") {
    return {
      dot: "bg-[#FF3B30] dark:bg-[#FF453A]",
      barColor: "bg-[#FF3B30] dark:bg-[#FF453A]",
      barColorDone: "bg-[#FF3B30]/40 dark:bg-[#FF453A]/40",
      textColor: "text-rose-600/80 dark:text-rose-400/80",
      statusLabel: "Não veio",
    };
  }
  if (status === "confirmed" || barbeiroConfirmou) {
    return {
      dot: "bg-[#007AFF] dark:bg-[#0A84FF]",
      barColor: "bg-[#007AFF] dark:bg-[#0A84FF]",
      barColorDone: "bg-[#007AFF]/40 dark:bg-[#0A84FF]/40",
      textColor: "text-muted-foreground/75",
      statusLabel: "Agendado",
    };
  }
  return {
    dot: "bg-[#FF9500] dark:bg-[#FF9F0A]",
    barColor: "bg-[#FF9500] dark:bg-[#FF9F0A]",
    barColorDone: "bg-[#FF9500]/40 dark:bg-[#FF9F0A]/40",
    textColor: "text-amber-600/80 dark:text-amber-400/80",
    statusLabel: "Pendente",
  };
};

/** Ícone, rótulo e cor da forma de pagamento:
 * - Dinheiro: verde (emerald)
 * - PIX: azulzinho (blue)
 * - Cortesia: roxo elegante (purple)
 * - Cartão: neutro/violeta
 */
const getPaymentBadge = (apt: { tipo_agendamento: string | null; payment_method: string | null; is_free: boolean | null }) => {
  if (apt.tipo_agendamento === "plano" || apt.payment_method === "plano") {
    return { icon: Crown, label: "Plano", iconColor: "text-amber-500 dark:text-amber-400" };
  }
  if (apt.is_free) {
    return { icon: Gift, label: "Cortesia", iconColor: "text-purple-500 dark:text-purple-400" };
  }
  const method = (apt.payment_method || "").toLowerCase();
  if (method === "pix") {
    return { icon: QrCode, label: "PIX", iconColor: "text-blue-500 dark:text-blue-400" };
  }
  if (method === "card" || method === "credit_card" || method === "credit" || method === "debit") {
    return { icon: CreditCard, label: "Cartão", iconColor: "text-violet-400 dark:text-violet-300" };
  }
  return { icon: Banknote, label: "Dinheiro", iconColor: "text-emerald-500 dark:text-emerald-400" };
};

const MONTH_NAMES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", 
  "Jul", "Ago", "Set", "Out", "Nov", "Dez"
];

export function AdminMobileAgenda({
  onAppointmentClick,
  onAddClick,
  barbeiroId,
  tenantId,
  title = "Agenda",
  onBack,
  showBack = false,
}: AdminMobileAgendaProps) {
  const navigate = useNavigate();

  const getLocalToday = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  };

  const getDateKey = (date: Date) => format(date, 'yyyy-MM-dd');
  const syncKey = (dateStr: string) => `admin-agenda:${barbeiroId || tenantId || "all"}:${dateStr}`;

  const today = useMemo(() => getLocalToday(), []);

  // Mês selecionado no carrossel e data selecionada
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => startOfMonth(getLocalToday()));
  const [selectedDate, setSelectedDate] = useState<Date>(() => getLocalToday());

  // Modal de seleção rápida de mês/ano
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => selectedMonth.getFullYear());

  const [appointments, setAppointments] = useState<MobileAppointment[]>(
    () => readSyncCache<MobileAppointment[]>(syncKey(getDateKey(getLocalToday())))?.data || []
  );
  const [appointmentsDateKey, setAppointmentsDateKey] = useState(() => getDateKey(getLocalToday()));
  const [loading, setLoading] = useState(
    () => !readSyncCache<MobileAppointment[]>(syncKey(getDateKey(getLocalToday())))
  );
  const [refreshing, setRefreshing] = useState(false);
  const [manualBookingOpen, setManualBookingOpen] = useState(false);
  const [selectedSlotTime, setSelectedSlotTime] = useState("09:00");
  const [isOverdueModalOpen, setIsOverdueModalOpen] = useState(false);

  const overdueState = useOverdueAppointments(barbeiroId);

  // Auto-abertura da gaveta ao entrar na Agenda quando houver agendamentos para finalizar
  const hasAutoPromptedOverdueRef = useRef(false);
  useEffect(() => {
    if (overdueState.isLoading) return;
    if (overdueState.count > 0 && !hasAutoPromptedOverdueRef.current) {
      setIsOverdueModalOpen(true);
      hasAutoPromptedOverdueRef.current = true;
    } else if (overdueState.count === 0) {
      hasAutoPromptedOverdueRef.current = false;
    }
  }, [overdueState.count, overdueState.isLoading]);

  useEffect(() => {
    const handleOpen = () => setIsOverdueModalOpen(true);
    window.addEventListener("open-overdue-modal", handleOpen);
    return () => window.removeEventListener("open-overdue-modal", handleOpen);
  }, []);

  const carouselRef = useRef<HTMLDivElement>(null);
  const isInitialScrollDone = useRef(false);
  const visibleDateRef = useRef<string>(format(selectedDate, 'yyyy-MM-dd'));
  const requestSeqRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);
  const cacheRef = useRef<Map<string, MobileAppointment[]>>(new Map());

  // Todos os dias do mês atual selecionado (1 ao último dia do mês)
  const daysInMonth = useMemo(() => {
    const start = startOfMonth(selectedMonth);
    const end = endOfMonth(selectedMonth);
    return eachDayOfInterval({ start, end });
  }, [selectedMonth]);

  // Relógio do sistema em minutos atualizado em tempo real a cada 5s
  const [currentMinutesNow, setCurrentMinutesNow] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date();
      setCurrentMinutesNow(d.getHours() * 60 + d.getMinutes());
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Agendamento que está CORTANDO AGORA no dia de hoje (dentro do horário de início até o fim da duração)
  const currentlyCuttingApt = useMemo(() => {
    if (!isToday(selectedDate) || !appointments?.length) return null;

    return appointments.find((apt) => {
      if (!apt || !apt.hora) return false;
      if (apt.status === "completed" || apt.status === "no_show" || (apt as any).status === "cancelled") {
        return false;
      }
      const rawHora = apt.hora || "00:00";
      const [h, m] = rawHora.split(":").map(Number);
      const startMin = (h || 0) * 60 + (m || 0);
      const dur = apt.duracao || apt.servico?.duracao_minutos || 30;
      return currentMinutesNow >= startMin && currentMinutesNow < (startMin + dur);
    }) || null;
  }, [appointments, selectedDate, currentMinutesNow]);

  // Sincroniza em tempo real o agendamento em corte ativo com o Dashboard ("Próximo corte")
  useEffect(() => {
    if (!isToday(selectedDate)) return;

    writeSyncCache("agenda:activeBlinkingApt", {
      id: currentlyCuttingApt?.id || null,
      hora: currentlyCuttingApt ? (currentlyCuttingApt.hora || "").slice(0, 5) : null,
      isCuttingNow: !!currentlyCuttingApt,
      updatedAt: Date.now(),
    });

    window.dispatchEvent(
      new CustomEvent("agenda-active-blinking-changed", {
        detail: {
          id: currentlyCuttingApt?.id || null,
          hora: currentlyCuttingApt ? (currentlyCuttingApt.hora || "").slice(0, 5) : null,
          isCuttingNow: !!currentlyCuttingApt,
        },
      })
    );
  }, [currentlyCuttingApt, selectedDate]);

  const shortDayName = (date: Date) => {
    const names = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
    return names[date.getDay()];
  };

  const commitAppointments = useCallback((nextAppointments: MobileAppointment[], dateKey?: string) => {
    setAppointments(nextAppointments);
    if (dateKey) setAppointmentsDateKey(dateKey);
  }, []);

  const isScrollingFromCodeRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Centraliza com precisão o dia selecionado no centro geométrico do carrossel
  const scrollToDay = useCallback((day: Date, behavior: ScrollBehavior = "smooth") => {
    const container = carouselRef.current;
    if (!container) return;
    const dayKey = format(day, "yyyy-MM-dd");
    const el = container.querySelector(`[data-date="${dayKey}"]`) as HTMLElement;
    if (!el) return;

    isScrollingFromCodeRef.current = true;
    const containerWidth = container.offsetWidth;
    const cardLeft = el.offsetLeft;
    const cardWidth = el.offsetWidth;
    const targetScroll = cardLeft - (containerWidth / 2) + (cardWidth / 2);

    container.scrollTo({
      left: Math.max(0, targetScroll),
      behavior,
    });

    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      isScrollingFromCodeRef.current = false;
    }, behavior === "smooth" ? 350 : 50);
  }, []);

  // Detecta o dia mais próximo ao centro quando o usuário passa o dedo no carrossel
  useEffect(() => {
    const container = carouselRef.current;
    if (!container) return;

    let rafId: number;
    const handleScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (isScrollingFromCodeRef.current) return;

        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = setTimeout(() => {
          if (isScrollingFromCodeRef.current) return;
          const centerX = container.scrollLeft + container.offsetWidth / 2;
          const children = container.querySelectorAll("[data-date]");
          let closestDate: Date | null = null;
          let minDist = Infinity;

          children.forEach((child) => {
            const el = child as HTMLElement;
            const childCenter = el.offsetLeft + el.offsetWidth / 2;
            const dist = Math.abs(childCenter - centerX);
            if (dist < minDist) {
              minDist = dist;
              const dateStr = el.getAttribute("data-date");
              if (dateStr) {
                const [y, m, d] = dateStr.split("-").map(Number);
                closestDate = new Date(y, m - 1, d);
              }
            }
          });

          if (closestDate && !isSameDay(closestDate, selectedDate)) {
            setSelectedDate(closestDate);
          }
        }, 60);
      });
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
      cancelAnimationFrame(rafId);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, [selectedDate]);

  // Carregar agendamentos do dia ativo
  const loadAppointments = useCallback(async (
    date: Date,
    options: { silent?: boolean; visible?: boolean } = {}
  ) => {
    const { silent = false, visible = true } = options;
    const dateStr = getDateKey(date);
    const requestId = visible ? ++requestSeqRef.current : 0;

    if (visible) {
      visibleDateRef.current = dateStr;
    }

    try {
      if (visible && !silent && !cacheRef.current.has(dateStr) && !hasLoadedOnceRef.current) {
        setLoading(true);
      }

      let appointmentsWithDetails: MobileAppointment[] | null = null;

      // RPC rápida agregada
      if (barbeiroId) {
        const { data: bundle, error: bundleError } = await supabase.rpc("get_barber_agenda_bundle", {
          p_barbeiro_id: barbeiroId,
          p_data: dateStr,
        });
        if (!bundleError) {
          const raw = ((bundle as any)?.appointments || []) as any[];
          appointmentsWithDetails = raw
            .filter((apt) => Boolean(apt) && ["pending", "confirmed", "completed"].includes(apt.status || "pending"))
            .map((apt) => {
              const walkInName = extractWalkInName(apt.observacoes);
              const whatsAppName = extractWhatsAppName(apt.observacoes);
              const displayName = whatsAppName || walkInName || apt.profile?.nome || null;
              return {
                ...apt,
                hora: apt.hora || "00:00",
                preco: typeof apt.preco === "number" && !isNaN(apt.preco) ? apt.preco : 0,
                duracao: apt.duracao || apt.servico?.duracao_minutos || 30,
                status: apt.status || "pending",
                profile: displayName
                  ? { nome: displayName, telefone: apt.profile?.telefone ?? undefined }
                  : apt.profile
                  ? { nome: apt.profile.nome, telefone: apt.profile.telefone ?? undefined }
                  : null,
                servico: apt.servico || null,
              } as MobileAppointment;
            });
        }
      }

      if (!appointmentsWithDetails) {
        let query = supabase
          .from("agendamentos")
          .select("id, data, hora, duracao, status, preco, observacoes, barbeiro_confirmou, cliente_confirmou, ponto_liberado, user_id, servico_id, barbeiro_id, is_free, payment_method, tipo_agendamento, remarcacao_solicitada, motivo_remarcacao, created_at")
          .eq("data", dateStr)
          .in("status", ["pending", "confirmed", "completed"])
          .order("hora", { ascending: true });

        if (barbeiroId) {
          query = query.eq("barbeiro_id", barbeiroId);
        }

        const { data, error } = await query;
        if (!error && data) {
          const rawAppointments = data || [];
          const userIds = [...new Set(rawAppointments.map((apt) => apt.user_id).filter(Boolean))];
          const serviceIds = [...new Set(rawAppointments.map((apt) => apt.servico_id).filter(Boolean))];

          const [profilesRes, servicosRes] = await Promise.all([
            userIds.length
              ? supabase.from("profiles").select("id, nome, telefone").in("id", userIds)
              : Promise.resolve({ data: [] }),
            serviceIds.length
              ? supabase.from("servicos").select("id, nome, duracao_minutos").in("id", serviceIds)
              : Promise.resolve({ data: [] }),
          ]);

          const profilesMap = new Map(
            ((profilesRes.data || []) as Array<{ id: string; nome: string; telefone?: string | null }>).map((profile) => [
              profile.id,
              { nome: profile.nome, telefone: profile.telefone ?? undefined },
            ])
          );
          const servicosMap = new Map(
            ((servicosRes.data || []) as Array<{ id: string; nome: string; duracao_minutos: number }>).map((servico) => [servico.id, servico])
          );

          appointmentsWithDetails = rawAppointments
            .filter(Boolean)
            .map((apt) => {
              const walkInName = extractWalkInName(apt.observacoes);
              const whatsAppName = extractWhatsAppName(apt.observacoes);
              const displayName = whatsAppName || walkInName || null;
              const profile = displayName
                ? { nome: displayName, telefone: profilesMap.get(apt.user_id)?.telefone ?? undefined }
                : profilesMap.get(apt.user_id) || null;
              return {
                ...apt,
                hora: apt.hora || "00:00",
                preco: typeof apt.preco === "number" && !isNaN(apt.preco) ? apt.preco : 0,
                duracao: apt.duracao || servicosMap.get(apt.servico_id)?.duracao_minutos || 30,
                status: apt.status || "pending",
                profile,
                servico: servicosMap.get(apt.servico_id) || null,
              };
            }) as MobileAppointment[];
        }
      }

      if (appointmentsWithDetails) {
        // Enriquecer agendamentos de plano com contagem de uso estratégica (ex: 2/4)
        const planUserIds = [
          ...new Set(
            appointmentsWithDetails
              .filter((apt) => (apt.tipo_agendamento === "plano" || apt.payment_method === "plano") && apt.user_id)
              .map((apt) => apt.user_id)
          ),
        ];

        if (planUserIds.length > 0) {
          try {
            const { data: subs } = await supabase
              .from("assinaturas")
              .select(`
                id,
                user_id,
                usos_ciclo_atual,
                status,
                plano:planos(id, nome, limite_agendamentos_mes)
              `)
              .in("user_id", planUserIds)
              .in("status", ["active", "pending_renewal", "pending_cash"])
              .order("created_at", { ascending: false });

            if (subs && subs.length > 0) {
              const subIds = subs.map((s) => s.id);
              const { data: usos } = await supabase
                .from("plano_agendamentos_usos")
                .select("assinatura_id")
                .in("assinatura_id", subIds)
                .is("released_at", null);

              const usosCountMap = new Map<string, number>();
              for (const u of usos || []) {
                usosCountMap.set(u.assinatura_id, (usosCountMap.get(u.assinatura_id) || 0) + 1);
              }

              const userPlanMap = new Map<string, { used: number; limit: number }>();
              for (const s of subs) {
                if (userPlanMap.has(s.user_id)) continue;
                const planoData = s.plano as any;
                const limit = s.status === "pending_cash" ? 1 : (planoData?.limite_agendamentos_mes || 4);
                const recordedUsos = usosCountMap.get(s.id);
                const used = recordedUsos !== undefined ? recordedUsos : (s.usos_ciclo_atual ?? 0);
                userPlanMap.set(s.user_id, {
                  used: Math.max(0, used),
                  limit,
                });
              }

              appointmentsWithDetails = appointmentsWithDetails.map((apt) => {
                const usage = userPlanMap.get(apt.user_id);
                return usage ? { ...apt, planUsage: usage } : apt;
              });
            }
          } catch (err) {
            console.warn("Erro ao buscar contagem de plano:", err);
          }
        }

        cacheRef.current.set(dateStr, appointmentsWithDetails);
        writeSyncCache(syncKey(dateStr), appointmentsWithDetails);

        if (visible && visibleDateRef.current === dateStr && requestSeqRef.current === requestId) {
          commitAppointments(appointmentsWithDetails, dateStr);
        }
      }

    } catch (error) {
      console.error("Error loading appointments:", error);
      if (visible && !silent) toast.error("Erro ao carregar agendamentos");
    } finally {
      if (visible && visibleDateRef.current === dateStr && requestSeqRef.current === requestId) {
        hasLoadedOnceRef.current = true;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [barbeiroId, commitAppointments]);

  // Carrega agendamentos quando selectedDate mudar
  useEffect(() => {
    const dateStr = getDateKey(selectedDate);
    const cached =
      cacheRef.current.get(dateStr) ||
      readSyncCache<MobileAppointment[]>(syncKey(dateStr))?.data;

    if (cached) {
      cacheRef.current.set(dateStr, cached);
      commitAppointments(cached, dateStr);
      setLoading(false);
      hasLoadedOnceRef.current = true;
      visibleDateRef.current = dateStr;
      loadAppointments(selectedDate, { silent: true, visible: true });
    } else {
      loadAppointments(selectedDate, { visible: true });
    }

    // Prefetch silencioso dos dias adjacentes
    const prev = subDays(selectedDate, 1);
    const next = addDays(selectedDate, 1);
    [prev, next].forEach((d) => {
      const key = getDateKey(d);
      if (!cacheRef.current.has(key)) {
        loadAppointments(d, { silent: true, visible: false });
      }
    });

    const channelConfig = barbeiroId
      ? { event: '*', schema: 'public', table: 'agendamentos', filter: `barbeiro_id=eq.${barbeiroId}` }
      : { event: '*', schema: 'public', table: 'agendamentos' };

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleSilentRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        cacheRef.current.delete(getDateKey(selectedDate));
        loadAppointments(selectedDate, { silent: true, visible: true });
      }, 250);
    };

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      const channelId = `mobile-agenda-v6-${barbeiroId || 'all'}-${Math.random().toString(36).slice(2, 9)}`;
      channel = supabase
        .channel(channelId)
        .on('postgres_changes', channelConfig as any, scheduleSilentRefresh)
        .subscribe();
    } catch (err) {
      console.warn('[AdminMobileAgenda] Erro ao conectar canal Realtime:', err);
    }

    const handleHeaderRefresh = () => {
      setRefreshing(true);
      scheduleSilentRefresh();
    };
    window.addEventListener('agenda-refresh', handleHeaderRefresh);

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {}
      }
      window.removeEventListener('agenda-refresh', handleHeaderRefresh);
    };
  }, [selectedDate, selectedMonth, loadAppointments, barbeiroId]);

  // Centraliza o carrossel no dia selecionado
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToDay(selectedDate, isInitialScrollDone.current ? "smooth" : "auto");
      isInitialScrollDone.current = true;
    }, 60);
    return () => clearTimeout(timer);
  }, [selectedDate, selectedMonth, scrollToDay]);

  // Troca de mês pelos botões de seta
  const goToPreviousMonth = () => {
    setSelectedMonth((prev) => {
      const nextMonth = subMonths(prev, 1);
      const newDate = isSameMonth(nextMonth, today) ? today : startOfMonth(nextMonth);
      setSelectedDate(newDate);
      return nextMonth;
    });
  };

  const goToNextMonth = () => {
    setSelectedMonth((prev) => {
      const nextMonth = addMonths(prev, 1);
      const newDate = isSameMonth(nextMonth, today) ? today : startOfMonth(nextMonth);
      setSelectedDate(newDate);
      return nextMonth;
    });
  };

  const goToToday = () => {
    const now = getLocalToday();
    setSelectedMonth(startOfMonth(now));
    setSelectedDate(now);
  };

  const selectedDateKey = getDateKey(selectedDate);
  const isShowingSelectedDate = appointmentsDateKey === selectedDateKey;

  const isSelectedToday = isToday(selectedDate);
  const weekdayName = isSelectedToday
    ? "Hoje"
    : format(selectedDate, "EEEE", { locale: ptBR }).replace("-feira", "");
  const capitalizedWeekday = weekdayName.charAt(0).toUpperCase() + weekdayName.slice(1);
  const dayAndMonth = format(selectedDate, "d 'de' MMMM", { locale: ptBR });
  const formattedDateTitle = `${capitalizedWeekday}, ${dayAndMonth}`;

  return (
    <div className="admin-mobile-agenda flex flex-col bg-background relative w-full" style={{ height: 'calc(100dvh - 56px)' }}>
      {/* ══════ HEADER FIXO: NAVEGAÇÃO E CARROSSEL DE DATAS ESTILO APPLE HIG (CORES DA MARCA: VERMELHO/PRETO/BRANCO) ══════ */}
      <div className="flex-shrink-0 z-20 bg-background/80 backdrop-blur-xl pt-3 pb-2.5 relative">
        {/* Linha 1: Mês/Ano + Botão Hoje + Setas de Navegação */}
        <div className="flex items-center justify-between px-4 mb-2.5">
          {/* Seletor Mês/Ano */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => {
                setPickerYear(selectedMonth.getFullYear());
                setIsMonthPickerOpen(true);
              }}
              className="flex items-center gap-1.5 text-[17px] font-semibold text-foreground capitalize tracking-tight hover:opacity-80 active:opacity-60 transition-all cursor-pointer"
            >
              <span>{format(selectedMonth, "MMMM yyyy", { locale: ptBR })}</span>
              <ChevronDown className="w-4 h-4 text-muted-foreground/70 stroke-[2.2]" />
            </button>

            {!isSameMonth(selectedMonth, today) && (
              <button
                type="button"
                onClick={goToToday}
                className="px-2.5 py-0.5 text-[12px] font-semibold rounded-full bg-secondary text-foreground hover:bg-secondary/80 active:opacity-70 transition-all cursor-pointer"
              >
                Hoje
              </button>
            )}
          </div>

          {/* Setas Anterior / Próximo Mês */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={goToPreviousMonth}
              className="w-8 h-8 rounded-full flex items-center justify-center text-foreground hover:bg-secondary active:opacity-70 transition-all border border-border/40 dark:border-white/[0.08] bg-secondary/40 dark:bg-white/[0.04] cursor-pointer"
              aria-label="Mês anterior"
            >
              <ChevronLeft className="w-4 h-4 stroke-[2]" />
            </button>
            <button
              type="button"
              onClick={goToNextMonth}
              className="w-8 h-8 rounded-full flex items-center justify-center text-foreground hover:bg-secondary active:opacity-70 transition-all border border-border/40 dark:border-white/[0.08] bg-secondary/40 dark:bg-white/[0.04] cursor-pointer"
              aria-label="Próximo mês"
            >
              <ChevronRight className="w-4 h-4 stroke-[2]" />
            </button>
          </div>
        </div>

        {/* ══════ CARROSSEL DE DATAS FLUIDO (SEM LINHA DIVISÓRIA INFERIOR) ══════ */}
        <div
          ref={carouselRef}
          className="w-full overflow-x-auto scrollbar-hide py-1 scroll-smooth"
          style={{
            WebkitOverflowScrolling: "touch",
            scrollSnapType: "x mandatory",
          }}
        >
          <div
            className="flex items-end gap-2.5 w-max"
            style={{
              paddingLeft: "calc(50% - 25px)",
              paddingRight: "calc(50% - 25px)",
            }}
          >
            {daysInMonth.map((day) => {
              const isSelected = isSameDay(day, selectedDate);
              const dayIsToday = isToday(day);
              const dateKey = format(day, "yyyy-MM-dd");

              return (
                <div
                  key={dateKey}
                  data-date={dateKey}
                  className="flex-shrink-0 w-[50px] flex justify-center"
                  style={{ scrollSnapAlign: "center" }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDate(day);
                      scrollToDay(day, "smooth");
                    }}
                    className={cn(
                      "w-full min-h-[52px] flex flex-col items-center justify-center gap-1 select-none cursor-pointer transition-all duration-200 ease-out",
                      isSelected
                        ? "opacity-100 scale-105"
                        : "opacity-40 hover:opacity-75 scale-95"
                    )}
                  >
                    {/* Dia da semana */}
                    <span
                      className={cn(
                        "text-[11px] uppercase leading-none tracking-tight transition-colors duration-200",
                        isSelected
                          ? "text-foreground font-semibold"
                          : "text-muted-foreground/70 font-medium"
                      )}
                    >
                      {shortDayName(day)}
                    </span>

                    {/* Botão Redondo com cor preta pura/elegante no dia selecionado */}
                    <div
                      className={cn(
                        "w-10 h-10 flex items-center justify-center rounded-full will-change-transform transition-all duration-200 ease-out",
                        isSelected
                          ? "bg-foreground text-background shadow-xs font-semibold"
                          : dayIsToday
                            ? "text-foreground font-semibold ring-1.5 ring-foreground/40 bg-transparent"
                            : "text-foreground font-normal bg-transparent hover:bg-secondary/40"
                      )}
                    >
                      <span
                        className={cn(
                          "leading-none tabular-nums transition-all duration-200",
                          isSelected
                            ? "text-[16px] text-background font-semibold"
                            : dayIsToday
                              ? "text-[15px] font-semibold"
                              : "text-[15px] font-normal"
                        )}
                      >
                        {format(day, "d")}
                      </span>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ══════ ÁREA SCROLLÁVEL: DATA, CONTAGEM E BOTÃO SOBEM JUNTOS AO ROLAR A TELA ══════ */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-28 pt-2">
        {/* Barra de Ação (Data + Contagem + Botão Novo Encaixe) — sobe junto com os agendamentos */}
        <div className="px-4 pt-2 pb-2.5 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1 pr-1">
            <h3 className="text-[16px] font-semibold text-foreground tracking-tight truncate">
              {formattedDateTitle}
            </h3>
            <p className="text-[13px] font-normal text-muted-foreground mt-0.5 truncate">
              {appointments.length === 0
                ? "Nenhum agendamento"
                : appointments.length === 1
                ? "1 agendamento"
                : `${appointments.length} agendamentos`}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {overdueState.count > 0 && (
              <button
                type="button"
                onClick={() => setIsOverdueModalOpen(true)}
                className="h-9 px-3.5 rounded-full bg-secondary/80 hover:bg-secondary text-foreground border border-border/40 text-[12.5px] font-semibold flex items-center justify-center gap-1.5 active:opacity-70 transition-all cursor-pointer shadow-xs shrink-0 whitespace-nowrap"
                aria-label="Finalizar atendimentos pendentes"
              >
                <Check className="w-3.5 h-3.5 stroke-[2.4]" />
                <span>Finalizar ({overdueState.count})</span>
              </button>
            )}

            {/* Botão Novo Encaixe — Cápsula nativa Apple Preto Elegante */}
            <button
              type="button"
              onClick={() => {
                if (onAddClick) {
                  onAddClick(selectedDateKey, "09:00");
                } else {
                  setSelectedSlotTime("09:00");
                  setManualBookingOpen(true);
                }
              }}
              className="h-9 px-4 rounded-full bg-foreground text-background text-[13px] font-semibold flex items-center justify-center gap-1.5 active:opacity-70 hover:opacity-90 transition-opacity cursor-pointer shadow-xs shrink-0 whitespace-nowrap"
              aria-label="Novo Encaixe"
            >
              <Plus className="w-4 h-4 stroke-[2.2]" />
              <span>Novo Encaixe</span>
            </button>
          </div>
        </div>

        {!isShowingSelectedDate ? (
          <div className="px-4 space-y-2.5 animate-pulse">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-16 rounded-2xl border border-border/30 dark:border-white/[0.04] bg-card/60 p-3.5 flex items-center gap-3">
                <div className="w-12 shrink-0 flex flex-col items-center gap-1">
                  <div className="h-4 w-10 rounded bg-muted/40" />
                  <div className="h-3 w-8 rounded bg-muted/20" />
                </div>
                <div className="w-[3px] h-10 rounded-full bg-muted/30 shrink-0" />
                <div className="flex-1 space-y-2 min-w-0">
                  <div className="flex justify-between items-center">
                    <div className="h-4 w-28 rounded bg-muted/40" />
                    <div className="h-4 w-14 rounded bg-muted/30" />
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="h-3 w-24 rounded bg-muted/30" />
                    <div className="h-3 w-16 rounded bg-muted/20" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : loading && !hasLoadedOnceRef.current && appointments.length === 0 ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-7 h-7 border-2 border-foreground/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : appointments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <div className="w-12 h-12 rounded-2xl bg-secondary/60 dark:bg-white/[0.04] border border-border/40 dark:border-white/[0.06] flex items-center justify-center mb-2.5 text-muted-foreground/60">
              <Calendar className="w-6 h-6 stroke-[1.6]" />
            </div>
            <p className="text-[15px] font-medium text-foreground">
              Sem agendamentos
            </p>
          </div>
        ) : (
          /* ══════ LISTA DE AGENDAMENTOS: PADRÃO APPLE HIG, MINIMALISTA, SÉRIO E MODERNO ══════ */
          <div className="px-4 space-y-2 mt-0.5">
            {appointments.map((apt) => {
              if (!apt) return null;
              const statusConfig = getStatusConfig(apt.status, apt.barbeiro_confirmou);
              const paymentBadge = getPaymentBadge(apt);
              const PayIcon = paymentBadge.icon;
              const isPlan = apt.tipo_agendamento === "plano" || apt.payment_method === "plano";
              const isFree = Boolean(apt.is_free);
              const duration = apt.duracao || apt.servico?.duracao_minutos || 30;
              const rawHora = apt.hora || "00:00";
              const horaFormatted = rawHora.slice(0, 5);

              const isCompleted = apt.status === "completed" || apt.status === "no_show";
              const isViewingToday = isToday(selectedDate);
              const [h, m] = rawHora.split(':').map(Number);
              const startMinutes = (h || 0) * 60 + (m || 0);
              const endMinutes = startMinutes + duration;
              const isPastTime = isViewingToday && endMinutes <= currentMinutesNow;
              const isDone = isCompleted || isPastTime;

              const clientName = apt.profile?.nome || "Cliente";
              const serviceName = (() => {
                if (apt.observacoes?.startsWith("Serviços:")) {
                  return apt.observacoes.split(".")[0].replace("Serviços: ", "");
                }
                const sName = apt.servico?.nome || "Serviço";
                const sDur = apt.servico?.duracao_minutos || 0;
                const aDur = (apt as any).duracao || 0;
                if (sDur > 0 && aDur > sDur) {
                  const qty = Math.round(aDur / sDur);
                  if (qty > 1) return `${qty}x ${sName}`;
                }
                return sName;
              })();

              // Contagem do plano (ex: 2/4)
              const planUsageCount = apt.planUsage
                ? `${apt.planUsage.used}/${apt.planUsage.limit}`
                : "2/4";

              // Pisca o horário SE E SOMENTE SE estiver cortando agora
              const isCuttingNow =
                isViewingToday &&
                !isDone &&
                apt.status !== 'completed' &&
                apt.status !== 'no_show' &&
                (apt as any).status !== 'cancelled' &&
                currentMinutesNow >= startMinutes &&
                currentMinutesNow < endMinutes;

              const precoFormatted = typeof apt.preco === 'number' && !isNaN(apt.preco)
                ? apt.preco.toFixed(2).replace('.', ',')
                : '0,00';

              return (
                <div
                  key={apt.id}
                  onClick={() => onAppointmentClick?.(apt)}
                  style={{ opacity: isDone ? 0.48 : 1 }}
                  className={cn(
                    "w-full rounded-2xl border transition-all duration-200 cursor-pointer p-3 sm:p-3.5 flex items-center gap-3",
                    isDone
                      ? "border-border/25 dark:border-white/[0.04] bg-card/60 dark:bg-[#151516]/60 shadow-none"
                      : "border-border/40 dark:border-white/[0.07] bg-card dark:bg-[#18181a] shadow-2xs hover:border-border active:opacity-70"
                  )}
                >
                  {/* Coluna de Horário da Agenda (Esquerda) */}
                  <div className="w-12 shrink-0 flex flex-col items-center justify-center text-center">
                    <span
                      style={
                        isCuttingNow
                          ? {
                              animation: "soft-pulse-blink 1.8s ease-in-out infinite",
                              willChange: "opacity",
                            }
                          : undefined
                      }
                      className={cn(
                        "font-mono text-[15px] tabular-nums tracking-tight inline-block",
                        isCuttingNow
                          ? "text-[#34C759] dark:text-[#30D158] font-semibold animate-soft-blink"
                          : isDone
                            ? "text-muted-foreground/60 font-medium"
                            : "text-foreground font-semibold"
                      )}
                    >
                      {horaFormatted}
                    </span>
                    <span className={cn(
                      "text-[12px] font-normal mt-0.5",
                      isDone ? "text-muted-foreground/45" : "text-muted-foreground/70"
                    )}>
                      {duration} min
                    </span>
                  </div>

                  {/* Barra vertical fina estilo cápsula Apple (3px): mantém verde suave quando finalizado */}
                  <div
                    className={cn(
                      "w-[3px] self-stretch rounded-full shrink-0 transition-colors",
                      isDone ? statusConfig.barColorDone : statusConfig.barColor
                    )}
                  />

                  {/* Conteúdo Principal do Agendamento */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                    {/* Linha Superior: Nome do Cliente + Preço / Plano */}
                    <div className="flex items-center justify-between gap-2 overflow-hidden w-full">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                        <span className={cn(
                          "text-[15px] tracking-tight truncate block",
                          isDone ? "text-muted-foreground/75 font-normal" : "text-foreground font-semibold"
                        )}>
                          {clientName}
                        </span>
                        {isWhatsAppAppointment(apt.observacoes) && (
                          <span className={cn(isDone && "opacity-60")}>
                            <WhatsAppBadge />
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {apt.status !== 'completed' && apt.status !== 'no_show' && ((apt.data && apt.data < format(new Date(), 'yyyy-MM-dd')) || (isViewingToday && isPastTime)) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (overdueState?.completeBulk && apt.id) {
                                overdueState.completeBulk([apt.id]);
                              }
                            }}
                            disabled={overdueState?.isCompleting}
                            className="h-6 px-2.5 rounded-full bg-foreground text-background text-[11px] font-semibold active:opacity-75 shadow-xs flex items-center gap-1 shrink-0 cursor-pointer"
                          >
                            <Check className="w-3 h-3 stroke-[2.5]" />
                            <span>Confirmar</span>
                          </button>
                        )}
                        <span className={cn(
                          "text-[13px] tabular-nums shrink-0 text-right",
                          isDone ? "text-muted-foreground/50 font-normal" : "text-foreground/90 font-medium"
                        )}>
                          {isPlan
                            ? "Plano"
                            : isFree
                              ? "Grátis"
                              : `R$ ${precoFormatted}`}
                        </span>
                      </div>
                    </div>

                    {/* Linha Inferior: Tesourinha + Serviço à esquerda | Forma de Pagamento com ícone (ou contagem X/Y do Plano) à direita */}
                    <div className="flex items-center justify-between gap-2 overflow-hidden w-full text-[12px]">
                      {/* Esquerda: Tesourinha + Nome do Serviço */}
                      <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden text-muted-foreground">
                        <Scissors className={cn(
                          "w-3.5 h-3.5 shrink-0",
                          isDone ? "text-muted-foreground/35" : "text-muted-foreground/60"
                        )} />
                        <span className={cn(
                          "truncate text-[12px] block font-normal",
                          isDone ? "text-muted-foreground/60" : "text-muted-foreground"
                        )}>
                          {serviceName}
                        </span>
                      </div>

                      {/* Direita: Abaixo do Preço ou Abaixo do Plano */}
                      {isPlan ? (
                        <div className={cn(
                          "flex items-center gap-1 shrink-0 font-medium tabular-nums text-[12px] text-right",
                          isDone ? "text-muted-foreground/50" : "text-muted-foreground/80"
                        )}>
                          <span>{planUsageCount}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 shrink-0 text-[11.5px] font-normal text-right">
                          <PayIcon className={cn(
                            "w-3.5 h-3.5 shrink-0",
                            isDone ? "text-muted-foreground/40" : paymentBadge.iconColor
                          )} />
                          <span className={cn(
                            isDone ? "text-muted-foreground/50" : "text-muted-foreground/80"
                          )}>
                            {paymentBadge.label}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

              {/* Botão estratégico inferior para finalizar todos ao final dos atendimentos */}
              {overdueState.count > 0 && (
                <div className="pt-6 pb-6 flex flex-col items-center gap-2 px-2">
                  <button
                    type="button"
                    onClick={() => setIsOverdueModalOpen(true)}
                    className="w-full max-w-sm h-12 rounded-full bg-foreground text-background text-[14px] font-semibold flex items-center justify-center gap-2 active:opacity-70 hover:opacity-90 transition-all cursor-pointer shadow-sm"
                  >
                    <Check className="w-4 h-4 stroke-[2.5]" />
                    <span>Finalizar todos ({overdueState.count})</span>
                  </button>
                  <p className="text-[12px] text-muted-foreground font-normal">
                    {overdueState.count === 1
                      ? "1 atendimento pendente de confirmação"
                      : `${overdueState.count} atendimentos pendentes de confirmação`}
                  </p>
                </div>
              )}

              {/* Espaçamento inferior elegante para rolagem */}
              <div className="pb-8" />
            </div>
          )}
        </div>

      {/* ══════ MODAL DE SELEÇÃO RÁPIDA DE MÊS/ANO: 100% MINIMALISTA, MONOCROMÁTICO ══════ */}
      {isMonthPickerOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
          onClick={() => setIsMonthPickerOpen(false)}
        >
          <div
            className="w-full max-w-xs rounded-2xl bg-card dark:bg-[#121212] border border-border/60 dark:border-white/[0.08] shadow-2xl p-4 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header: Troca de Ano */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setPickerYear((y) => y - 1)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary active:scale-95 text-foreground transition-all cursor-pointer"
                aria-label="Ano anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="agenda-strong text-[15px] font-bold text-foreground">
                {pickerYear}
              </span>

              <button
                type="button"
                onClick={() => setPickerYear((y) => y + 1)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary active:scale-95 text-foreground transition-all cursor-pointer"
                aria-label="Próximo ano"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Grid dos 12 Meses (Preto e Branco Puro) */}
            <div className="grid grid-cols-3 gap-2">
              {MONTH_NAMES.map((mName, idx) => {
                const isCurrentSelected =
                  selectedMonth.getMonth() === idx && selectedMonth.getFullYear() === pickerYear;
                const isThisMonth =
                  today.getMonth() === idx && today.getFullYear() === pickerYear;

                return (
                  <button
                    key={mName}
                    type="button"
                    onClick={() => {
                      const newMonthDate = new Date(pickerYear, idx, 1);
                      setSelectedMonth(newMonthDate);
                      const newDate = isSameMonth(newMonthDate, today) ? today : newMonthDate;
                      setSelectedDate(newDate);
                      setIsMonthPickerOpen(false);
                    }}
                    className={cn(
                      "h-10 rounded-xl text-[13px] font-semibold transition-all flex items-center justify-center cursor-pointer active:scale-95",
                      isCurrentSelected
                        ? "agenda-strong bg-foreground text-background font-bold shadow-sm"
                        : isThisMonth
                        ? "agenda-strong bg-secondary text-foreground ring-1 ring-border"
                        : "agenda-subtle text-muted-foreground hover:text-foreground hover:bg-secondary/40"
                    )}
                  >
                    {mName}
                  </button>
                );
              })}
            </div>

            {/* Rodapé: Atalho Hoje + Fechar */}
            <div className="flex items-center justify-between pt-2 border-t border-border/40 dark:border-white/[0.06]">
              <button
                type="button"
                onClick={() => {
                  const now = getLocalToday();
                  setPickerYear(now.getFullYear());
                  setSelectedMonth(startOfMonth(now));
                  setSelectedDate(now);
                  setIsMonthPickerOpen(false);
                }}
                className="agenda-strong text-[12px] font-semibold text-foreground dark:text-white hover:underline cursor-pointer"
              >
                Mês atual
              </button>
              <button
                type="button"
                onClick={() => setIsMonthPickerOpen(false)}
                className="agenda-subtle text-[12px] font-medium text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Encaixe Manual */}
      <MobileManualBookingModal
        open={manualBookingOpen}
        onOpenChange={setManualBookingOpen}
        date={selectedDateKey}
        initialTime={selectedSlotTime}
        onSuccess={() => {
          cacheRef.current.delete(selectedDateKey);
          loadAppointments(selectedDate, { silent: true, visible: true });
        }}
        skipValidation={true}
        barbeiroId={barbeiroId || undefined}
        tenantId={tenantId}
      />

      {/* Modal de confirmação em lote de agendamentos pendentes */}
      <PendingAppointmentsModal
        open={isOverdueModalOpen}
        onOpenChange={setIsOverdueModalOpen}
        appointments={overdueState.overdueAppointments}
        onCompleteBulk={overdueState.completeBulk}
        isCompleting={overdueState.isCompleting}
      />
    </div>
  );
}
