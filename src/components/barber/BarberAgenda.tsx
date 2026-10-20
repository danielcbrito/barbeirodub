import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { STALE_TIMES } from "@/lib/queryConstants";
import { format, addDays, isToday, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Calendar,
  Clock,
  User,
  Scissors,
  Plus,
  Crown,
  CreditCard,
  Banknote,
  Gift,
  QrCode,
  Filter,
  ExternalLink,
  Check,
  CheckCheck,
  Loader2,
} from "lucide-react";
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
import { cn } from "@/lib/utils";
import { BarberContext } from "@/pages/Barbeiro";
import { useIsMobile } from "@/hooks/use-mobile";
import { AdminMobileAgenda } from "@/components/admin/mobile/AdminMobileAgenda";
import { canAutoOpenOverdueModal, recordOverdueModalDismissal } from "@/lib/modalFrequency";
import { ConfirmAttendanceModal } from "@/components/admin/ConfirmAttendanceModal";
import { MobileManualBookingModal } from "@/components/admin/mobile/MobileManualBookingModal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBarberAgenda, type TimelineAppointment } from "@/hooks/useBarberAgenda";
import { useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { isWhatsAppAppointment } from "@/lib/walkInName";
import { WhatsAppBadge } from "@/components/shared/WhatsAppBadge";
import { fetchAgendaDia } from "@/lib/fetchers/agendaFetchers";
import { toast } from "sonner";
import { useOverdueAppointments } from "@/hooks/useOverdueAppointments";
import { PendingAppointmentsModal } from "@/components/barber/PendingAppointmentsModal";
import { extractDebtFromAppointment } from "@/lib/barberCancellationFee";

interface BarberAgendaProps {
  barberContext: BarberContext;
}

/** Status color config — idêntico ao admin */
const getStatusColorConfig = (status: string, barbeiroConfirmou: boolean | null) => {
  // Minimalista: sem cores fortes, sem borda lateral colorida.
  // Diferenciação sutil via um "dot" e o rótulo do status em muted.
  if (status === "completed") {
    return {
      dot: "bg-emerald-500",
      statusBadge: "text-muted-foreground",
      statusLabel: "Concluído",
    };
  }
  if (status === "no_show" || status === "nao_veio" || status === "faltou") {
    return {
      dot: "bg-zinc-400 dark:bg-zinc-500",
      statusBadge: "text-muted-foreground",
      statusLabel: "Não veio",
    };
  }
  if (status === "confirmed" || barbeiroConfirmou) {
    return {
      dot: "bg-foreground/70",
      statusBadge: "text-muted-foreground",
      statusLabel: "Agendado",
    };
  }
  return {
    dot: "bg-amber-500",
    statusBadge: "text-muted-foreground",
    statusLabel: "Pendente",
  };
};

/** Payment badge — minimalista, sem cores saturadas */
const getPaymentBadge = (apt: { tipo_agendamento: string | null; payment_method: string | null; is_free: boolean | null }) => {
  if (apt.tipo_agendamento === "plano") {
    return { icon: Crown, label: "Plano", cls: "text-muted-foreground" };
  }
  if (apt.is_free) {
    return { icon: Gift, label: "Grátis", cls: "text-muted-foreground" };
  }
  if (apt.payment_method === "pix") {
    return { icon: QrCode, label: "PIX", cls: "text-muted-foreground" };
  }
  if (apt.payment_method === "card" || apt.payment_method === "credit_card") {
    return { icon: CreditCard, label: "Cartão", cls: "text-muted-foreground" };
  }
  return { icon: Banknote, label: "Dinheiro", cls: "text-muted-foreground" };
};


export function BarberAgenda({ barberContext }: BarberAgendaProps) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });
  const [confirmModalAppointment, setConfirmModalAppointment] = useState<TimelineAppointment | null>(null);
  const [manualBookingModalOpen, setManualBookingModalOpen] = useState(false);
  const [selectedEmptySlot, setSelectedEmptySlot] = useState({ date: "", time: "" });
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const location = useLocation();
  const overdueState = useOverdueAppointments(barberContext.barbeiroId, { enabled: !isMobile });
  const [isOverdueModalOpen, setIsOverdueModalOpen] = useState(() => Boolean(location.state?.openOverdueModal));
  const hasAutoPromptedOverdueRef = useRef(false);

  useEffect(() => {
    if (location.state?.openOverdueModal) {
      setIsOverdueModalOpen(true);
      return;
    }
    if (isMobile) return;
    if (overdueState.isLoading) return;
    if (overdueState.count > 0 && !hasAutoPromptedOverdueRef.current) {
      hasAutoPromptedOverdueRef.current = true;
      if (canAutoOpenOverdueModal()) {
        setIsOverdueModalOpen(true);
      }
    }
  }, [location.state, isMobile, overdueState.count, overdueState.isLoading]);


  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const isInitialScrollDone = useRef(false);

  /* ── TanStack Query: dados da agenda ── */
  const { data: appointments = [], isLoading: loading } = useBarberAgenda(
    barberContext.barbeiroId,
    selectedDate
  );

  /* ── Prefetch dos dias adjacentes ao trocar data ── */
  useEffect(() => {
    const bId = barberContext.barbeiroId;
    if (!bId) return;

    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const nextDay = new Date(dateStr + "T00:00:00");
    nextDay.setDate(nextDay.getDate() + 1);
    const prevDay = new Date(dateStr + "T00:00:00");
    prevDay.setDate(prevDay.getDate() - 1);

    const fmtDate = (d: Date) => d.toISOString().split("T")[0];

    Promise.all([
      queryClient.prefetchQuery({
        queryKey: QUERY_KEYS.barbeiro.agenda(bId, fmtDate(nextDay)),
        queryFn: () => fetchAgendaDia(bId, fmtDate(nextDay)),
        staleTime: STALE_TIMES.AGENDA_DIA,
      }),
      queryClient.prefetchQuery({
        queryKey: QUERY_KEYS.barbeiro.agenda(bId, fmtDate(prevDay)),
        queryFn: () => fetchAgendaDia(bId, fmtDate(prevDay)),
        staleTime: STALE_TIMES.AGENDA_DIA,
      }),
    ]);
  }, [selectedDate, barberContext.barbeiroId, queryClient]);

  /** Invalida o cache da agenda (usado por Realtime e callbacks de mutations) */
  const invalidateAgenda = useCallback(() => {
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.barbeiro.agenda(barberContext.barbeiroId, dateStr),
    });
  }, [queryClient, barberContext.barbeiroId, selectedDate]);

  /* ── Realtime: ouvir mudanças de agendamentos (somente no desktop, mobile tem seu próprio) ── */
  useEffect(() => {
    if (isMobile || !barberContext.barbeiroId) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      const channelId = `barber-agenda-${barberContext.barbeiroId}-${Math.random().toString(36).slice(2, 9)}`;
      channel = supabase
        .channel(channelId)
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "agendamentos",
          filter: `barbeiro_id=eq.${barberContext.barbeiroId}`,
        }, (payload) => {
          invalidateAgenda();
          if (payload.eventType === "INSERT") {
            toast.success("Novo agendamento recebido!");
          }
        })
        .subscribe();
    } catch (err) {
      console.warn("[BarberAgenda] Erro ao conectar canal Realtime:", err);
    }

    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {}
      }
    };
  }, [barberContext.barbeiroId, invalidateAgenda, isMobile]);

  // Estabilizar array de dias — hoje SEMPRE no fuso local
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);
  const allDays = useMemo(() => Array.from({ length: 31 }, (_, i) => addDays(today, i - 15)), [today]);
  const todayIndex = 15;

  const shortDayName = (date: Date) => {
    const names = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
    return names[date.getDay()];
  };

  // Scroll inicial para o dia de hoje
  useEffect(() => {
    if (isMobile) return;
    const timer = setTimeout(() => {
      const el = scrollRef.current;
      const inner = innerRef.current;
      if (!el || !inner) return;
      const child = inner.children[todayIndex] as HTMLElement;
      if (!child) return;
      el.scrollLeft = child.offsetLeft - el.offsetWidth / 2 + child.offsetWidth / 2;
      setTimeout(() => { isInitialScrollDone.current = true; }, 100);
    }, 50);
    return () => clearTimeout(timer);
  }, [isMobile]);

  // Detectar o dia central durante scroll
  useEffect(() => {
    if (isMobile) return;
    const el = scrollRef.current;
    const inner = innerRef.current;
    if (!el || !inner) return;

    let rafId: number;
    const handleScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (!isInitialScrollDone.current) return;
        const centerX = el.scrollLeft + el.offsetWidth / 2;
        const children = Array.from(inner.children) as HTMLElement[];
        let closestIdx = 0;
        let minDist = Infinity;
        for (let i = 0; i < children.length; i++) {
          const childCenter = children[i].offsetLeft + children[i].offsetWidth / 2;
          const dist = Math.abs(childCenter - centerX);
          if (dist < minDist) {
            minDist = dist;
            closestIdx = i;
          }
        }
        if (allDays[closestIdx]) {
          setSelectedDate(prev => {
            if (isSameDay(prev, allDays[closestIdx])) return prev;
            return allDays[closestIdx];
          });
        }
      });
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", handleScroll);
      cancelAnimationFrame(rafId);
    };
  }, [allDays, isMobile]);

  const scrollToDate = useCallback((date: Date) => {
    const el = scrollRef.current;
    const inner = innerRef.current;
    if (!el || !inner) return;
    const idx = allDays.findIndex(d => isSameDay(d, date));
    if (idx < 0) return;
    const child = inner.children[idx] as HTMLElement;
    if (!child) return;
    el.scrollTo({ left: child.offsetLeft - el.offsetWidth / 2 + child.offsetWidth / 2, behavior: "smooth" });
  }, [allDays]);

  // Check for appointments that need confirmation - ONLY for TODAY
  useEffect(() => {
    const checkAppointmentCompletion = () => {
      const now = new Date();
      const currentDateStr = format(now, "yyyy-MM-dd");
      const todaysAppointments = appointments.filter(apt => apt?.data === currentDateStr);

      todaysAppointments.forEach(apt => {
        if (!apt || !apt.hora) return;
        if (apt.status === "completed" || apt.status === "cancelled_by_admin" ||
            apt.status === "cancelled_by_user" || apt.status === "no_show") return;

        const [hours, minutes] = (apt.hora || "00:00").split(":").map(Number);
        const aptStart = new Date(now);
        aptStart.setHours(hours || 0, minutes || 0, 0, 0);
        const aptEnd = new Date(aptStart.getTime() + (apt.servico?.duracao_minutos || 30) * 60000);

        if (now >= aptEnd && now.getTime() - aptEnd.getTime() < 120000) {
          setConfirmModalAppointment(apt);
        }
      });
    };

    const interval = setInterval(checkAppointmentCompletion, 60000);
    checkAppointmentCompletion();
    return () => clearInterval(interval);
  }, [appointments]);

  const filteredAppointments = appointments.filter(apt => {
    if (filterStatus !== "all" && apt.status !== filterStatus) return false;
    return true;
  });

  const dayPendingAppointments = useMemo(() => {
    if (!appointments || appointments.length === 0) return [];
    return appointments.filter(
      (apt) => apt && apt.id && apt.status !== "completed" && apt.status !== "no_show" && (apt as any).status !== "cancelled"
    );
  }, [appointments]);

  const [isFinalizingDay, setIsFinalizingDay] = useState(false);
  const [finalizeAllModalOpen, setFinalizeAllModalOpen] = useState(false);

  const handleFinalizeDay = async () => {
    if (dayPendingAppointments.length === 0) {
      toast.info("Todos os agendamentos deste dia já estão concluídos.");
      return;
    }

    try {
      setIsFinalizingDay(true);
      const idsToComplete = dayPendingAppointments.map((a) => a.id);

      const dateStr = format(selectedDate, "yyyy-MM-dd");
      queryClient.setQueryData(
        QUERY_KEYS.barbeiro.agenda(barberContext.barbeiroId, dateStr),
        (prev: any) =>
          Array.isArray(prev)
            ? prev.map((apt: any) =>
                idsToComplete.includes(apt.id)
                  ? { ...apt, status: "completed", barbeiro_confirmou: true }
                  : apt
              )
            : prev
      );

      await overdueState.completeBulk(idsToComplete);
      invalidateAgenda();
    } catch (error) {
      console.error("Erro ao finalizar agendamentos do dia:", error);
      toast.error("Erro ao finalizar agendamentos.");
    } finally {
      setIsFinalizingDay(false);
    }
  };

  // ========== MOBILE ==========
  if (isMobile) {
    return (
      <>
        <AdminMobileAgenda
          onAppointmentClick={(apt) =>
            navigate(`/barbeiro/agendamento/${apt.id}`, { state: { appointment: apt as any } })
          }
          barbeiroId={barberContext.barbeiroId}
          tenantId={barberContext.tenantId}
        />
        <ConfirmAttendanceModal
          appointment={confirmModalAppointment}
          open={!!confirmModalAppointment}
          onClose={() => setConfirmModalAppointment(null)}
          onUpdate={invalidateAgenda}
        />
      </>
    );
  }

  // ========== DESKTOP — Idêntico ao AdminAgenda ==========
  return (
    <div className="flex flex-col animate-fade-in pb-16 relative">
      {/* ══════ HEADER SECTION ══════ */}
      <div className="flex-shrink-0 px-6 pt-2 pb-4">
        {/* Title + Controls */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <span className="text-[20px] font-bold text-foreground capitalize tracking-tight">
              {format(selectedDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </span>
            {!isToday(selectedDate) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedDate(today);
                  scrollToDate(today);
                }}
                className="px-2.5 py-0.5 text-[11px] font-semibold rounded-full bg-secondary text-foreground hover:bg-secondary/80 active:scale-95 transition-all cursor-pointer"
              >
                Hoje
              </button>
            )}
            <span className="text-[12px] font-medium text-muted-foreground/75 tabular-nums">
              • {filteredAppointments.length} {filteredAppointments.length === 1 ? "agendamento" : "agendamentos"}
            </span>
          </div>

          <div className="flex items-center gap-2">

            <button
              onClick={() => window.open("/agenda", "_blank")}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium bg-secondary/50 text-muted-foreground hover:bg-secondary/70 transition-all"
            >
              <ExternalLink className="w-4 h-4" />
              Nova aba
            </button>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all",
                showFilters
                  ? "bg-primary/10 text-primary"
                  : "bg-secondary/50 text-muted-foreground hover:bg-secondary/70"
              )}
            >
              <Filter className="w-4 h-4" />
              Filtros
            </button>
          </div>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="flex flex-wrap gap-3 p-4 mb-4 rounded-xl bg-secondary/30 border border-border overflow-hidden">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[200px] bg-secondary/50 border-border">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="confirmed">Confirmado</SelectItem>
                <SelectItem value="completed">Concluído</SelectItem>
                <SelectItem value="no_show">Não Veio</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* ══════ DATE CAROUSEL ══════ */}
        <div className="mb-0">
          <button
            onClick={() => {
              setSelectedDate(today);
              scrollToDate(today);
            }}
            className={cn(
              "mb-2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-secondary text-foreground hover:bg-secondary/80 transition-opacity duration-200",
              isToday(selectedDate) ? "opacity-0 pointer-events-none" : "opacity-100"
            )}
          >
            Hoje
          </button>

          <div className="relative">
            <div
              ref={scrollRef}
              className="overflow-x-auto scrollbar-hide"
              style={{
                WebkitOverflowScrolling: "touch",
                scrollSnapType: "x mandatory",
              }}
            >
              <div
                ref={innerRef}
                className="flex items-end"
                style={{ paddingLeft: "calc(50% - 32px)", paddingRight: "calc(50% - 32px)" }}
              >
                {allDays.map((day) => {
                  const isSelected = isSameDay(day, selectedDate);
                  const dayIsToday = isToday(day);

                  return (
                    <div
                      key={day.toISOString()}
                      className="flex-shrink-0 w-16"
                      style={{ scrollSnapAlign: "center" }}
                    >
                      <button
                        onClick={() => {
                          setSelectedDate(day);
                          scrollToDate(day);
                        }}
                        className={cn(
                          "w-full flex flex-col items-center gap-1 py-1 transition-all duration-200 select-none cursor-pointer",
                          isSelected ? "opacity-100 scale-105" : "opacity-40 hover:opacity-75 scale-95"
                        )}
                      >
                        <span className={cn(
                          "text-[11px] uppercase leading-none tracking-tight transition-colors duration-200",
                          isSelected ? "text-foreground font-semibold" : "text-muted-foreground/70 font-medium"
                        )}>
                          {shortDayName(day)}
                        </span>

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
                          <span className={cn(
                            "leading-none tabular-nums transition-all duration-200",
                            isSelected ? "text-[16px] text-background font-semibold" : dayIsToday ? "text-[15px] font-semibold" : "text-[15px] font-normal"
                          )}>
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
        </div>
      </div>

      {/* ══════ APPOINTMENT LIST — Card grid ══════ */}
      <div className="flex-1 min-h-0 px-6 pb-8">
        {loading ? (
          <div className="flex items-center justify-center h-52">
            <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : filteredAppointments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Calendar className="w-7 h-7 text-muted-foreground/30 mb-3" strokeWidth={1.5} />
            <p className="text-[15px] font-semibold text-muted-foreground">
              Sem agendamentos
            </p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="flex items-center gap-3 mb-4">
              <span className="text-sm font-semibold text-foreground">
                {filteredAppointments.length} agendamento{filteredAppointments.length > 1 ? "s" : ""}
              </span>
              <span className="text-xs text-muted-foreground">
                {format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
              </span>
            </div>

            {/* Cards — 2 columns on large screens */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {filteredAppointments.map((apt, idx) => {
                if (!apt) return null;
                const statusConfig = getStatusColorConfig(apt.status, apt.barbeiro_confirmou);
                const paymentBadge = getPaymentBadge(apt);
                const PayIcon = paymentBadge.icon;
                const duration = apt.duracao || apt.servico?.duracao_minutos || 30;
                const rawHora = apt.hora || "00:00";
                const horaFormatted = rawHora.slice(0, 5);
                const debtInfo = extractDebtFromAppointment(apt);

                const now = new Date();
                const isViewingToday = isToday(selectedDate);
                const currentTimeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
                const aptEndMinutes = (() => {
                  const [h, m] = rawHora.split(":").map(Number);
                  return ((h || 0) * 60 + (m || 0)) + duration;
                })();
                const nowMinutes = now.getHours() * 60 + now.getMinutes();
                const isCompleted = apt.status === "completed" || apt.status === "no_show";
                const isPastTime = isViewingToday && aptEndMinutes <= nowMinutes;
                const isDone = isCompleted || isPastTime;
                const isNextUp = isViewingToday && !isDone && rawHora >= currentTimeStr
                  && apt.status !== "completed" && apt.status !== "no_show"
                  && idx === filteredAppointments.findIndex(a =>
                    (a?.hora || "") >= currentTimeStr
                    && a?.status !== "completed"
                    && a?.status !== "no_show"
                  );

                return (
                  <div
                    key={apt.id}
                    onClick={() => navigate(`/barbeiro/agendamento/${apt.id}`, { state: { appointment: apt } })}
                    onMouseEnter={() => {
                      if (!apt.user_id) return;
                      queryClient.prefetchQuery({
                        queryKey: QUERY_KEYS.barbeiro.clienteHistorico(apt.user_id, barberContext.barbeiroId),
                        queryFn: async () => {
                          const { data, error } = await supabase
                            .from("agendamentos")
                            .select("id, data, hora, status, preco, servico:servicos(nome)")
                            .eq("user_id", apt.user_id)
                            .eq("barbeiro_id", barberContext.barbeiroId)
                            .in("status", ["completed", "cancelled_by_user", "no_show"])
                            .order("data", { ascending: false })
                            .limit(10);
                          if (error) throw error;
                          return data ?? [];
                        },
                        staleTime: STALE_TIMES.CLIENTES,
                      });
                    }}
                    style={{ opacity: isDone ? 0.48 : 1 }}
                    className={cn(
                      "group relative rounded-2xl p-4 cursor-pointer transition-all duration-200 backdrop-blur-xl backdrop-saturate-[180%]",
                      isDone
                        ? "border border-border/20 dark:border-white/[0.04] bg-card/35 dark:bg-white/[0.02] shadow-none"
                        : "border border-border/40 dark:border-white/[0.08] bg-card/75 dark:bg-white/[0.04] hover:bg-card/90 dark:hover:bg-white/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.03),inset_0_1px_1px_rgba(255,255,255,0.4)] dark:shadow-[0_2px_16px_rgba(0,0,0,0.25),inset_0_1px_1px_rgba(255,255,255,0.06)] active:scale-[0.99]",
                      isNextUp && "ring-1 ring-foreground/20"
                    )}
                  >
                    {/* Header: serviço + status minimalista */}
                    <div className="flex items-center justify-between mb-2 gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Scissors className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
                        <span className="text-[15px] font-medium text-foreground truncate tracking-tight">
                          {(() => {
                            if (apt.observacoes?.startsWith("Serviços:")) {
                              return apt.observacoes.split(".")[0].replace("Serviços: ", "");
                            }
                            const sName = apt.servico?.nome || "Serviço";
                            const sDur = apt.servico?.duracao_minutos || 0;
                            const aDur = apt.duracao || 0;
                            if (sDur > 0 && aDur > sDur) {
                              const qty = Math.round(aDur / sDur);
                              if (qty > 1) return `${qty}x ${sName}`;
                            }
                            return sName;
                          })()}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={cn("w-1.5 h-1.5 rounded-full", statusConfig.dot)} />
                        <span className={cn("text-[11px] font-medium", statusConfig.statusBadge)}>
                          {statusConfig.statusLabel}
                        </span>
                      </div>
                    </div>

                    {/* Cliente */}
                    <div className="flex items-center gap-2 mb-3">
                      <User className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
                      <span className="text-[13px] text-muted-foreground truncate">
                        {apt.profile?.nome || "Cliente"}
                      </span>
                      {isWhatsAppAppointment(apt.observacoes) && <WhatsAppBadge />}
                      {debtInfo.hasDebt && (
                        <span className="px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25 text-[10px] font-semibold tabular-nums shrink-0">
                          + R$ {debtInfo.debtAmount.toFixed(2).replace(".", ",")} taxa
                        </span>
                      )}
                      {isNextUp && (
                        <span className="ml-auto text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
                          agora
                        </span>
                      )}
                    </div>

                    {/* Rodapé: hora · duração · pagamento · preço */}
                    <div className="flex items-center justify-between pt-3 border-t border-border/40">
                      <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
                        <span className="font-mono tabular-nums text-foreground text-[13px] font-medium">
                          {horaFormatted}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {duration}min
                        </span>
                        <span className={cn("flex items-center gap-1", paymentBadge.cls)}>
                          <PayIcon className="w-3 h-3" />
                          {paymentBadge.label}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className={cn(
                          "text-[13px] font-medium tabular-nums block",
                          apt.is_free ? "text-muted-foreground/40 line-through" : "text-foreground"
                        )}>
                          {apt.is_free
                            ? "Grátis"
                            : `R$ ${typeof apt.preco === "number" && !isNaN(apt.preco) ? apt.preco.toFixed(2).replace(".", ",") : "0,00"}`}
                        </span>
                        {debtInfo.hasDebt && (
                          <span className="text-[9.5px] text-amber-600 dark:text-amber-400 font-medium block tabular-nums">
                            Com taxa inclusa
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Botão Finalizar Todos no fim da lista */}
            <div className="pt-6 pb-2 flex justify-center">
              <button
                type="button"
                onClick={() => setFinalizeAllModalOpen(true)}
                disabled={dayPendingAppointments.length === 0 || isFinalizingDay}
                className={cn(
                  "w-full max-w-sm h-11 rounded-2xl font-semibold text-[13.5px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-sm select-none",
                  dayPendingAppointments.length === 0
                    ? "bg-secondary/70 text-muted-foreground/60 border border-border/40 cursor-not-allowed"
                    : "bg-foreground text-background hover:opacity-90 active:opacity-80 cursor-pointer"
                )}
              >
                {isFinalizingDay ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCheck className="w-4 h-4 stroke-[2.2]" />
                )}
                <span>
                  {dayPendingAppointments.length === 0
                    ? "Todos os cortes finalizados"
                    : `Finalizar todos (${dayPendingAppointments.length})`}
                </span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* ══════ FAB ══════ */}
      <button
        onClick={() => {
          setSelectedEmptySlot({ date: format(selectedDate, "yyyy-MM-dd"), time: "" });
          setManualBookingModalOpen(true);
        }}
        className={cn(
          "fixed bottom-28 right-8 z-40",
          "w-13 h-13 rounded-full",
          "bg-foreground text-background",
          "flex items-center justify-center",
          "shadow-[0_0_12px_2px_hsl(var(--foreground)/0.15)]",
          "hover:scale-105 active:scale-95",
          "transition-all duration-200"
        )}
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* ══════ MODALS ══════ */}

      <ConfirmAttendanceModal
        appointment={confirmModalAppointment}
        open={!!confirmModalAppointment}
        onClose={() => setConfirmModalAppointment(null)}
        onUpdate={invalidateAgenda}
      />

      <MobileManualBookingModal
        open={manualBookingModalOpen}
        onOpenChange={setManualBookingModalOpen}
        date={selectedEmptySlot.date}
        initialTime={selectedEmptySlot.time}
        onSuccess={invalidateAgenda}
        skipValidation={true}
        barbeiroId={barberContext.barbeiroId}
        tenantId={barberContext.tenantId}
      />

      {/* Gaveta Apple HIG de finalização de atendimentos */}
      <PendingAppointmentsModal
        open={isOverdueModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            recordOverdueModalDismissal();
          }
          setIsOverdueModalOpen(open);
        }}
        appointments={overdueState.overdueAppointments}
        onCompleteBulk={overdueState.completeBulk}
        isCompleting={overdueState.isCompleting}
      />

      {/* ══════ MODAL DE CONFIRMAÇÃO CENTRAL: FINALIZAR TODOS OS CORTES ══════ */}
      <AlertDialog open={finalizeAllModalOpen} onOpenChange={setFinalizeAllModalOpen}>
        <AlertDialogContent className="max-w-[340px] sm:max-w-sm rounded-[24px] p-6 border border-border/60 bg-card shadow-2xl space-y-4">
          <AlertDialogHeader className="flex flex-col items-center text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-500 mb-1">
              <CheckCheck className="w-6 h-6 stroke-[2.2]" />
            </div>
            <AlertDialogTitle className="text-[17px] font-semibold text-foreground tracking-tight text-center">
              Finalizar todos os cortes?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[12.5px] text-muted-foreground leading-relaxed px-1 text-center">
              {dayPendingAppointments.length === 1
                ? "Deseja marcar 1 agendamento pendente deste dia como concluído?"
                : `Deseja marcar todos os ${dayPendingAppointments.length} agendamentos pendentes deste dia como concluídos?`}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter className="flex-row gap-2.5 pt-2 sm:space-x-0">
            <AlertDialogCancel
              disabled={isFinalizingDay}
              className="flex-1 h-11 rounded-xl text-[13px] font-medium border-border/50 hover:bg-secondary mt-0"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setFinalizeAllModalOpen(false);
                handleFinalizeDay();
              }}
              disabled={isFinalizingDay}
              className="flex-1 h-11 rounded-xl text-[13px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
            >
              {isFinalizingDay ? (
                <Loader2 className="w-4 h-4 animate-spin mx-auto" />
              ) : (
                "Finalizar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
