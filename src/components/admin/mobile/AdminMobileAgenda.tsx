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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MobileManualBookingModal } from "./MobileManualBookingModal";
import { extractWalkInName, extractWhatsAppName, isWhatsAppAppointment } from "@/lib/walkInName";
import { WhatsAppBadge } from "@/components/shared/WhatsAppBadge";
import { readSyncCache, writeSyncCache } from "@/lib/syncQueryCache";

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

/** Status oficial com cores nítidas:
 * - Concluído: VERDE (emerald)
 * - Agendado: AZUL (blue)
 * - Pendente: ÂMBAR (amber)
 * - Não veio: VERMELHO (rose)
 */
const getStatusConfig = (status: string, barbeiroConfirmou: boolean | null) => {
  if (status === "completed") {
    return {
      dot: "bg-emerald-500",
      textColor: "text-emerald-500 dark:text-emerald-400",
      statusLabel: "Concluído",
    };
  }
  if (status === "no_show") {
    return {
      dot: "bg-rose-500",
      textColor: "text-rose-500 dark:text-rose-400",
      statusLabel: "Não veio",
    };
  }
  if (status === "confirmed" || barbeiroConfirmou) {
    return {
      dot: "bg-blue-500",
      textColor: "text-blue-500 dark:text-blue-400",
      statusLabel: "Agendado",
    };
  }
  return {
    dot: "bg-amber-500",
    textColor: "text-amber-500 dark:text-amber-400",
    statusLabel: "Pendente",
  };
};

/** Ícone e rótulo do método de pagamento */
const getPaymentBadge = (apt: { tipo_agendamento: string | null; payment_method: string | null; is_free: boolean | null }) => {
  if (apt.tipo_agendamento === "plano") return { icon: Crown, label: "Plano" };
  if (apt.is_free) return { icon: Gift, label: "Grátis" };
  if (apt.payment_method === "pix") return { icon: QrCode, label: "PIX" };
  if (apt.payment_method === "card" || apt.payment_method === "credit_card") return { icon: CreditCard, label: "Cartão" };
  return { icon: Banknote, label: "Dinheiro" };
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

  const shortDayName = (date: Date) => {
    const names = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
    return names[date.getDay()];
  };

  const commitAppointments = useCallback((nextAppointments: MobileAppointment[], dateKey?: string) => {
    setAppointments(nextAppointments);
    if (dateKey) setAppointmentsDateKey(dateKey);
  }, []);

  // Centraliza o dia selecionado no carrossel
  const scrollToDay = useCallback((day: Date, behavior: ScrollBehavior = "smooth") => {
    const container = carouselRef.current;
    if (!container) return;
    const dayKey = format(day, "yyyy-MM-dd");
    const el = container.querySelector(`[data-date="${dayKey}"]`) as HTMLElement;
    if (!el) return;

    const containerWidth = container.offsetWidth;
    const cardLeft = el.offsetLeft;
    const cardWidth = el.offsetWidth;
    const targetScroll = cardLeft - (containerWidth / 2) + (cardWidth / 2);

    container.scrollTo({
      left: Math.max(0, targetScroll),
      behavior,
    });
  }, []);

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
            .filter((apt) => ["pending", "confirmed", "completed"].includes(apt.status || "pending"))
            .map((apt) => {
              const walkInName = extractWalkInName(apt.observacoes);
              const whatsAppName = extractWhatsAppName(apt.observacoes);
              const displayName = whatsAppName || walkInName || apt.profile?.nome || null;
              return {
                ...apt,
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

          appointmentsWithDetails = rawAppointments.map((apt) => {
            const walkInName = extractWalkInName(apt.observacoes);
            const whatsAppName = extractWhatsAppName(apt.observacoes);
            const displayName = whatsAppName || walkInName || null;
            const profile = displayName
              ? { nome: displayName, telefone: profilesMap.get(apt.user_id)?.telefone ?? undefined }
              : profilesMap.get(apt.user_id) || null;
            return { ...apt, profile, servico: servicosMap.get(apt.servico_id) || null };
          }) as MobileAppointment[];
        }
      }

      if (appointmentsWithDetails) {
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

    const channel = supabase
      .channel(`mobile-agenda-v5-${barbeiroId || 'all'}`)
      .on('postgres_changes', channelConfig as any, scheduleSilentRefresh)
      .subscribe();

    const handleHeaderRefresh = () => {
      setRefreshing(true);
      scheduleSilentRefresh();
    };
    window.addEventListener('agenda-refresh', handleHeaderRefresh);

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
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

  return (
    <div className="flex flex-col bg-background relative w-full" style={{ height: 'calc(100dvh - 56px)' }}>
      {/* ══════ HEADER FIXO: 100% OPACO (sem vazamento de agendamentos por trás) ══════ */}
      <div className="flex-shrink-0 z-20 bg-background pt-3 pb-2 border-b border-border/40 dark:border-white/[0.06]">
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
              className="flex items-center gap-1.5 text-[16px] font-bold text-foreground capitalize tracking-tight hover:opacity-80 active:scale-95 transition-all cursor-pointer"
            >
              <span>{format(selectedMonth, "MMMM yyyy", { locale: ptBR })}</span>
              <ChevronDown className="w-4 h-4 text-muted-foreground/70 stroke-[2]" />
            </button>

            {!isSameMonth(selectedMonth, today) && (
              <button
                type="button"
                onClick={goToToday}
                className="px-2.5 py-0.5 text-[11px] font-semibold rounded-full bg-secondary text-foreground hover:bg-secondary/80 active:scale-95 transition-all cursor-pointer"
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
              className="w-8 h-8 rounded-full flex items-center justify-center text-foreground hover:bg-secondary active:scale-90 transition-all border border-border/50 dark:border-white/[0.08] bg-secondary/40 dark:bg-white/[0.04] cursor-pointer"
              aria-label="Mês anterior"
            >
              <ChevronLeft className="w-4 h-4 stroke-[2]" />
            </button>
            <button
              type="button"
              onClick={goToNextMonth}
              className="w-8 h-8 rounded-full flex items-center justify-center text-foreground hover:bg-secondary active:scale-90 transition-all border border-border/50 dark:border-white/[0.08] bg-secondary/40 dark:bg-white/[0.04] cursor-pointer"
              aria-label="Próximo mês"
            >
              <ChevronRight className="w-4 h-4 stroke-[2]" />
            </button>
          </div>
        </div>

        {/* ══════ CARROSSEL ORIGINAL COM SQUIRCLES REDONDINHAS (100% Padrão Solicitado) ══════ */}
        <div
          ref={carouselRef}
          className="w-full overflow-x-auto scrollbar-hide px-3 py-1"
          style={{
            WebkitOverflowScrolling: "touch",
          }}
        >
          <div className="flex items-end gap-1.5 w-max px-2">
            {daysInMonth.map((day) => {
              const isSelected = isSameDay(day, selectedDate);
              const dayIsToday = isToday(day);
              const dateKey = format(day, "yyyy-MM-dd");

              return (
                <div
                  key={dateKey}
                  data-date={dateKey}
                  className="flex-shrink-0 w-11"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDate(day);
                      scrollToDay(day, "smooth");
                    }}
                    className="w-full flex flex-col items-center gap-1.5 py-1 active:scale-95 cursor-pointer select-none transition-all"
                    style={{
                      transform: isSelected ? "translateY(-2px)" : "translateY(0px)",
                    }}
                  >
                    {/* Dia da semana em cima */}
                    <span className={cn(
                      "text-[9.5px] font-bold uppercase leading-none tracking-wider",
                      isSelected ? "text-foreground" : "text-muted-foreground/60"
                    )}>
                      {shortDayName(day)}
                    </span>

                    {/* Squircle redondinha moderno */}
                    <div
                      className={cn(
                        "w-10 h-10 flex items-center justify-center rounded-2xl will-change-transform transition-all",
                        isSelected
                          ? "bg-foreground text-background shadow-sm font-bold"
                          : "text-foreground font-semibold hover:bg-secondary/40 bg-card/40 dark:bg-white/[0.03] border border-border/30 dark:border-white/[0.05]",
                        dayIsToday && !isSelected && "ring-1 ring-primary/40 text-primary font-bold"
                      )}
                      style={{
                        transform: isSelected ? "scale(1.05)" : "scale(1)",
                        transition: "transform 200ms ease-out",
                      }}
                    >
                      <span
                        className={cn(
                          "leading-none",
                          isSelected ? "text-background text-[15px] font-bold" : "text-foreground text-[13px] font-semibold"
                        )}
                      >
                        {format(day, "d")}
                      </span>
                    </div>

                    {/* Dot indicador de seleção */}
                    <div className="h-1.5 flex items-center justify-center">
                      {isSelected ? (
                        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      ) : (
                        <div className="w-1.5 h-1.5" />
                      )}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ══════ ÁREA SCROLLÁVEL: MÁSCARA FADE NO TOPO + CARDS LARGOS E ESPECÍFICOS ══════ */}
      <div className="flex-1 min-h-0 relative">
        {/* Fade mask no topo: agendamentos desaparecem suavemente ANTES do carrossel */}
        <div 
          className="absolute top-0 inset-x-0 h-6 z-10 pointer-events-none bg-gradient-to-b from-background to-transparent" 
        />

        <div className="h-full overflow-y-auto overscroll-contain pb-24 pt-2">
          
          {/* ══════ BARRA DE AÇÃO SUPERIOR: DATA + BOTÃO NOVO ENCAIXE ══════ */}
          <div className="px-4 pt-1 pb-3 flex items-center justify-between">
            <div className="min-w-0 pr-2">
              <h3 className="text-[14.5px] font-bold text-foreground tracking-tight capitalize truncate">
                {format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
              </h3>
              <p className="text-[11.5px] font-medium text-muted-foreground mt-0.5">
                {appointments.length === 0
                  ? "Nenhum agendamento"
                  : appointments.length === 1
                  ? "1 agendamento marcado"
                  : `${appointments.length} agendamentos marcados`}
              </p>
            </div>

            {/* Botão de Encaixe com Proporção Ideal */}
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
              className="h-8.5 px-3.5 rounded-xl border border-border/70 dark:border-white/[0.1] bg-secondary/60 dark:bg-white/[0.05] hover:bg-secondary text-foreground text-[12px] font-semibold flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-xs shrink-0"
              aria-label="Novo Encaixe"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.2] text-foreground" />
              <span>Novo Encaixe</span>
            </button>
          </div>

          {!isShowingSelectedDate ? (
            <div className="px-4 space-y-3 animate-pulse mt-1">
              {[0, 1, 2].map((item) => (
                <div key={item} className="rounded-2xl border border-border/40 dark:border-white/[0.05] bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="h-4 w-24 rounded-full bg-muted/40" />
                    <div className="h-3 w-16 rounded-full bg-muted/30" />
                  </div>
                  <div className="h-4 w-36 rounded-full bg-muted/40" />
                  <div className="flex items-center justify-between pt-2 border-t border-border/20">
                    <div className="h-3 w-28 rounded-full bg-muted/30" />
                    <div className="h-3 w-14 rounded-full bg-muted/40" />
                  </div>
                </div>
              ))}
            </div>
          ) : loading && !hasLoadedOnceRef.current && appointments.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
            </div>
          ) : appointments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-56 text-center px-8">
              <div className="w-12 h-12 rounded-2xl bg-secondary/60 dark:bg-white/[0.04] border border-border/50 dark:border-white/[0.06] flex items-center justify-center mb-3 text-muted-foreground/60">
                <Calendar className="w-6 h-6 stroke-[1.6]" />
              </div>
              <p className="text-[14px] font-bold text-foreground">
                {isToday(selectedDate) ? "Nenhum agendamento para hoje" : "Nenhum agendamento neste dia"}
              </p>
              <p className="text-[12px] text-muted-foreground/75 mt-1 max-w-[260px] leading-relaxed">
                {isToday(selectedDate)
                  ? "Seus horários livres estão disponíveis e podem ser reservados a qualquer momento."
                  : "Navegue pelas datas no carrossel ou adicione um encaixe manual."}
              </p>
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
                className="mt-4 h-8 px-3.5 rounded-xl bg-foreground text-background text-[12px] font-semibold flex items-center gap-1.5 shadow-sm active:scale-95 hover:opacity-90 transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2]" />
                <span>Adicionar Encaixe</span>
              </button>
            </div>
          ) : (
            /* ══════ CARDS LARGOS, ESPAÇOSOS E COM INFORMAÇÕES ESPECÍFICAS ══════ */
            <div className="px-4 space-y-3 mt-1">
              {appointments.map((apt) => {
                const statusConfig = getStatusConfig(apt.status, apt.barbeiro_confirmou);
                const paymentBadge = getPaymentBadge(apt);
                const PayIcon = paymentBadge.icon;
                const isPlan = apt.tipo_agendamento === "plano" || apt.payment_method === "plano";
                const isFree = Boolean(apt.is_free);
                const duration = apt.duracao || apt.servico?.duracao_minutos || 30;
                const horaFormatted = apt.hora.substring(0, 5);

                const now = new Date();
                const isViewingToday = isToday(selectedDate);
                const [h, m] = apt.hora.split(':').map(Number);
                const endMinutes = (h * 60 + m) + duration;
                const nowMinutes = now.getHours() * 60 + now.getMinutes();
                const isPast = isViewingToday && endMinutes <= nowMinutes && (apt.status === 'completed' || apt.status === 'no_show');

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

                return (
                  <div
                    key={apt.id}
                    onClick={() => onAppointmentClick?.(apt)}
                    style={{ opacity: isPast ? 0.45 : 1 }}
                    className={cn(
                      "w-full rounded-2xl border border-border/60 dark:border-white/[0.08] bg-card dark:bg-[#141414] p-4 space-y-3 shadow-xs",
                      "hover:border-foreground/20 active:scale-[0.99] transition-all cursor-pointer relative overflow-hidden"
                    )}
                  >
                    {/* Linha 1: Horário + Duração à esquerda | Status colorido oficial à direita */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[12.5px] font-bold px-2.5 py-0.5 rounded-lg bg-secondary/80 dark:bg-white/[0.08] text-foreground tabular-nums border border-border/30 dark:border-white/[0.06]">
                          {horaFormatted}
                        </span>
                        <span className="text-[12px] text-muted-foreground flex items-center gap-1 font-medium">
                          <Clock className="w-3.5 h-3.5 text-muted-foreground/60" />
                          {duration} min
                        </span>
                      </div>

                      {/* Status com ponto e texto nas cores solicitadas */}
                      <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-secondary/40 dark:bg-white/[0.03] border border-border/30 dark:border-white/[0.06]">
                        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", statusConfig.dot)} />
                        <span className={cn("text-[11.5px] font-semibold", statusConfig.textColor)}>
                          {statusConfig.statusLabel}
                        </span>
                      </div>
                    </div>

                    {/* Linha 2: Nome do Cliente com Destaque Forte + Preço */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[16px] font-bold text-foreground tracking-tight truncate">
                          {clientName}
                        </span>
                        {isWhatsAppAppointment(apt.observacoes) && <WhatsAppBadge />}
                      </div>

                      {/* Preço em destaque */}
                      <span className="text-[15px] font-bold tabular-nums text-foreground shrink-0">
                        {isPlan
                          ? "Plano"
                          : isFree
                            ? "Grátis"
                            : `R$ ${apt.preco.toFixed(2).replace('.', ',')}`}
                      </span>
                    </div>

                    {/* Linha 3: Serviço com Tesoura à esquerda | Método de Pagamento com Ícone à direita */}
                    <div className="flex items-center justify-between pt-2.5 border-t border-border/30 dark:border-white/[0.06] text-xs">
                      <div className="flex items-center gap-1.5 min-w-0 pr-2">
                        <Scissors className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                        <span className="text-muted-foreground font-medium text-[12.5px] truncate">
                          {serviceName}
                        </span>
                      </div>

                      {/* Ícone e Nome do Pagamento */}
                      <div className="flex items-center gap-1.5 shrink-0 px-2.5 py-0.5 rounded-md bg-secondary/50 dark:bg-white/[0.04] border border-border/30 dark:border-white/[0.05]">
                        <PayIcon className="w-3 h-3 text-muted-foreground/70" />
                        <span className="text-[11px] font-medium text-muted-foreground">
                          {paymentBadge.label}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Botão no final dos agendamentos para adicionar novo encaixe */}
              <div className="pt-3 pb-8 flex justify-center">
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
                  className="h-9 px-4 rounded-xl border border-dashed border-border/70 dark:border-white/[0.12] hover:border-foreground/30 text-muted-foreground hover:text-foreground text-[12px] font-medium flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar outro encaixe</span>
                </button>
              </div>
            </div>
          )}
        </div>
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

              <span className="text-[15px] font-bold text-foreground">
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
                        ? "bg-foreground text-background font-bold shadow-sm"
                        : isThisMonth
                        ? "bg-secondary text-foreground ring-1 ring-border"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
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
                className="text-[12px] font-semibold text-foreground dark:text-white hover:underline cursor-pointer"
              >
                Mês atual
              </button>
              <button
                type="button"
                onClick={() => setIsMonthPickerOpen(false)}
                className="text-[12px] font-medium text-muted-foreground hover:text-foreground cursor-pointer"
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
    </div>
  );
}
