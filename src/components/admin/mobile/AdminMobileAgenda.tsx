import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { format, addDays, subDays, isToday, isSameDay, startOfDay } from "date-fns";
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
}

/** Status minimalista: dot + label em texto muted */
const getStatusColorConfig = (status: string, barbeiroConfirmou: boolean | null) => {
  if (status === "completed") {
    return { dot: "bg-emerald-500", statusLabel: "Concluído" };
  }
  if (status === "no_show") {
    return { dot: "bg-orange-500", statusLabel: "Não veio" };
  }
  if (status === "confirmed" || barbeiroConfirmou) {
    return { dot: "bg-blue-500", statusLabel: "Agendado" };
  }
  return { dot: "bg-amber-500", statusLabel: "Pendente" };
};

/** Pagamento minimalista: apenas ícone + label em muted */
const getPaymentBadge = (apt: { tipo_agendamento: string | null; payment_method: string | null; is_free: boolean | null }) => {
  if (apt.tipo_agendamento === "plano") return { icon: Crown, label: "Plano" };
  if (apt.is_free) return { icon: Gift, label: "Grátis" };
  if (apt.payment_method === "pix") return { icon: QrCode, label: "PIX" };
  if (apt.payment_method === "card" || apt.payment_method === "credit_card") return { icon: CreditCard, label: "Cartão" };
  return { icon: Banknote, label: "Dinheiro" };
};

export function AdminMobileAgenda({ onAppointmentClick, onAddClick, barbeiroId, tenantId }: AdminMobileAgendaProps) {
  const getLocalToday = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  };

  const getDateKey = (date: Date) => format(date, 'yyyy-MM-dd');

  /** Chave de cache persistente (localStorage) — hidratação em 0ms como no barbeiro */
  const syncKey = (dateStr: string) => `admin-agenda:${barbeiroId || tenantId || "all"}:${dateStr}`;

  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    return getLocalToday();
  });
  const [carouselDate, setCarouselDate] = useState<Date>(() => {
    return getLocalToday();
  });
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const isInitialScrollDone = useRef(false);
  const visibleDateRef = useRef<string>(format(selectedDate, 'yyyy-MM-dd'));
  const requestSeqRef = useRef(0);
  const scrollCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmaticScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProgrammaticScrollRef = useRef(false);
  const pendingScrollDateRef = useRef<Date | null>(null);
  const hasLoadedOnceRef = useRef(false);
  const appointmentsRef = useRef<MobileAppointment[]>([]);
  // Cache in-memory por dia — evita piscar "spinner + lista vazia" ao trocar de dia
  const cacheRef = useRef<Map<string, MobileAppointment[]>>(new Map());


  const commitAppointments = useCallback((nextAppointments: MobileAppointment[], dateKey?: string) => {
    appointmentsRef.current = nextAppointments;
    setAppointments(nextAppointments);
    if (dateKey) setAppointmentsDateKey(dateKey);
  }, []);

  const clearScrollCommitTimer = useCallback(() => {
    if (scrollCommitTimerRef.current) {
      clearTimeout(scrollCommitTimerRef.current);
      scrollCommitTimerRef.current = null;
    }
  }, []);

  const commitCarouselSelection = useCallback((day: Date, delay = 360) => {
    clearScrollCommitTimer();
    scrollCommitTimerRef.current = setTimeout(() => {
      pendingScrollDateRef.current = null;
      setCarouselDate(prev => (isSameDay(prev, day) ? prev : day));
      setSelectedDate(prev => (isSameDay(prev, day) ? prev : day));
    }, delay);
  }, [clearScrollCommitTimer]);

  // Estabilizar array de dias — hoje SEMPRE no fuso local
  const today = useMemo(() => getLocalToday(), []);
  const allDays = useMemo(() => Array.from({ length: 31 }, (_, i) => addDays(today, i - 15)), [today]);
  const todayIndex = 15;

  const shortDayName = (date: Date) => {
    const names = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
    return names[date.getDay()];
  };

  const getCenteredDayFromScroll = useCallback(() => {
    const el = scrollRef.current;
    const inner = innerRef.current;
    if (!el || !inner) return null;

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

    return allDays[closestIdx] ?? null;
  }, [allDays]);

  // Scroll inicial para o dia de hoje — com pequeno delay para garantir layout
  useEffect(() => {
    const timer = setTimeout(() => {
      const el = scrollRef.current;
      const inner = innerRef.current;
      if (!el || !inner) return;
      const child = inner.children[todayIndex] as HTMLElement;
      if (!child) return;
      el.scrollLeft = child.offsetLeft - el.offsetWidth / 2 + child.offsetWidth / 2;
      // Marcar como feito após o scroll parar
      setTimeout(() => {
        setCarouselDate(today);
        isInitialScrollDone.current = true;
      }, 100);
    }, 50);
    return () => clearTimeout(timer);
  }, [today]);

  // Detectar o dia central durante scroll — usa o container interno
  useEffect(() => {
    const el = scrollRef.current;
    const inner = innerRef.current;
    if (!el || !inner) return;

    let rafId: number;
    const handleScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        // Não alterar seleção até o scroll inicial terminar
        if (!isInitialScrollDone.current) return;
        const closestDay = getCenteredDayFromScroll();
        if (closestDay) {
          // No iPhone, atualizar o estado visual em cada pixel do scroll cria
          // "bolhas"/piscadas. Guardamos o candidato em ref e só confirmamos
          // quando o carrossel realmente parar.
          pendingScrollDateRef.current = closestDay;
          if (!isProgrammaticScrollRef.current) {
            commitCarouselSelection(closestDay);
          }
        }
      });
    };

    const handleScrollEnd = () => {
      if (isProgrammaticScrollRef.current) return;
      const closestDay = getCenteredDayFromScroll() ?? pendingScrollDateRef.current;
      if (closestDay) {
        clearScrollCommitTimer();
        pendingScrollDateRef.current = null;
        setCarouselDate(prev => (isSameDay(prev, closestDay) ? prev : closestDay));
        setSelectedDate(prev => (isSameDay(prev, closestDay) ? prev : closestDay));
      }
    };

    const handleTouchEnd = () => {
      if (isProgrammaticScrollRef.current) return;
      const closestDay = getCenteredDayFromScroll() ?? pendingScrollDateRef.current;
      if (closestDay) commitCarouselSelection(closestDay, 420);
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    el.addEventListener("scrollend", handleScrollEnd, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });
    el.addEventListener("pointerup", handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("scroll", handleScroll);
      el.removeEventListener("scrollend", handleScrollEnd);
      el.removeEventListener("touchend", handleTouchEnd);
      el.removeEventListener("pointerup", handleTouchEnd);
      cancelAnimationFrame(rafId);
      clearScrollCommitTimer();
    };
  }, [clearScrollCommitTimer, commitCarouselSelection, getCenteredDayFromScroll]);

  const scrollToDate = useCallback((date: Date) => {
    const el = scrollRef.current;
    const inner = innerRef.current;
    if (!el || !inner) return;
    const idx = allDays.findIndex(d => isSameDay(d, date));
    if (idx < 0) return;
    const child = inner.children[idx] as HTMLElement;
    if (!child) return;
    isProgrammaticScrollRef.current = true;
    if (programmaticScrollTimerRef.current) clearTimeout(programmaticScrollTimerRef.current);
    el.scrollTo({ left: child.offsetLeft - el.offsetWidth / 2 + child.offsetWidth / 2, behavior: "smooth" });
    programmaticScrollTimerRef.current = setTimeout(() => {
      isProgrammaticScrollRef.current = false;
      pendingScrollDateRef.current = null;
      setCarouselDate(date);
    }, 420);
  }, [allDays]);

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
      // Spinner cheio apenas no primeiro carregamento real.
      // Depois disso, mantém a lista/estado atual até o novo dia chegar para não piscar no iPhone.
      if (visible && !silent && !cacheRef.current.has(dateStr) && !hasLoadedOnceRef.current) {
        setLoading(true);
      }

      let appointmentsWithDetails: MobileAppointment[] | null = null;

      /* ── Caminho rápido: 1 única RPC agregada (igual ao app do barbeiro) ── */
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
        if (error) throw error;

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

      // Grava no cache SEMPRE (mesmo silent) — pré-fetch popula os dias adjacentes
      cacheRef.current.set(dateStr, appointmentsWithDetails);
      writeSyncCache(syncKey(dateStr), appointmentsWithDetails);

      // Só sobrescreve a lista visível se ainda for o dia atual
      if (visible && visibleDateRef.current === dateStr && requestSeqRef.current === requestId) {
        commitAppointments(appointmentsWithDetails, dateStr);
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

  useEffect(() => {
    const dateStr = getDateKey(selectedDate);
    const cached =
      cacheRef.current.get(dateStr) ||
      readSyncCache<MobileAppointment[]>(syncKey(dateStr))?.data;

    if (cached) {
      // Mostra imediatamente e revalida em background (sem piscar)
      cacheRef.current.set(dateStr, cached);
      commitAppointments(cached, dateStr);
      setLoading(false);
      hasLoadedOnceRef.current = true;
      visibleDateRef.current = dateStr;
      loadAppointments(selectedDate, { silent: true, visible: true });
    } else {
      // Sem cache: NÃO limpa lista pra evitar flash — só mostra spinner se realmente vazio
      loadAppointments(selectedDate, { visible: true });
    }


    // Prefetch silencioso do dia anterior e do próximo
    const prev = subDays(selectedDate, 1);
    const next = addDays(selectedDate, 1);
    [prev, next].forEach((d) => {
      const key = getDateKey(d);
      if (!cacheRef.current.has(key)) {
        // fire-and-forget silent
        loadAppointments(d, { silent: true, visible: false });
      }
    });

    const channelConfig = barbeiroId
      ? { event: '*', schema: 'public', table: 'agendamentos', filter: `barbeiro_id=eq.${barbeiroId}` }
      : { event: '*', schema: 'public', table: 'agendamentos' };

    // Debounce global — evita double-load quando realtime + agenda-refresh
    // (ex.: ao finalizar atendimento no iPhone) disparam juntos.
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleSilentRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        cacheRef.current.delete(getDateKey(selectedDate));
        loadAppointments(selectedDate, { silent: true, visible: true });
      }, 250);
    };

    const channel = supabase
      .channel(`mobile-agenda-v2-${barbeiroId || 'all'}`)
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
  }, [selectedDate, loadAppointments, barbeiroId]);
  const selectedDateKey = getDateKey(selectedDate);
  const isShowingSelectedDate = appointmentsDateKey === selectedDateKey;



  return (
    <div className="flex flex-col" style={{ height: 'calc(100dvh - 56px)' }}>
      {/* ══════ HEADER FIXO (fora do scroll) ══════ */}
      <div className="flex-shrink-0 px-3 sm:px-5 pt-3 pb-2 z-20">
        {/* ══════ NAVEGAÇÃO DIAS (SWIPE CARROSSEL) ══════ */}
        <div className="mb-0">
          {/* Header: mês/ano sempre visível + botão Hoje alinhado à esquerda */}
          <div className="h-8 flex items-center justify-between mb-2 px-1">
            <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest">
              {format(carouselDate, "MMMM yyyy", { locale: ptBR })}
            </span>
            <button
              onClick={() => {
                clearScrollCommitTimer();
                setCarouselDate(today);
                setSelectedDate(today);
                scrollToDate(today);
              }}
              className={cn(
                "px-3 py-1 text-[10px] font-semibold rounded-lg bg-primary/10 text-primary active:scale-95 transition-opacity duration-200",
                isToday(carouselDate) ? "opacity-0 pointer-events-none" : "opacity-100"
              )}
            >
              ← Hoje
            </button>
          </div>

          {/* Carrossel nativo — scroll suave, sem tremor */}
          <div className="relative">
            <div
              ref={scrollRef}
              className="overflow-x-auto scrollbar-hide"
              style={{ 
                WebkitOverflowScrolling: "touch",
                scrollSnapType: "x mandatory",
              }}
            >
              <div ref={innerRef} className="flex items-end" style={{ paddingLeft: "calc(50% - 24px)", paddingRight: "calc(50% - 24px)" }}>
                {allDays.map((day) => {
                  const isSelected = isSameDay(day, carouselDate);
                  const dayIsToday = isToday(day);

                  return (
                    <div
                      key={day.toISOString()}
                      className="flex-shrink-0 w-12"
                      style={{ scrollSnapAlign: "center" }}
                    >
                      <button
                        onClick={() => {
                          clearScrollCommitTimer();
                          setCarouselDate(day);
                          setSelectedDate(day);
                          scrollToDate(day);
                        }}
                        className="w-full flex flex-col items-center gap-1 py-1 active:scale-95"
                        style={{
                          transform: isSelected ? "translateY(-5px)" : "translateY(0px)",
                          transition: "transform 200ms ease-out",
                        }}
                      >
                        <span className={cn(
                          "text-[9px] font-semibold uppercase leading-none tracking-wider",
                          isSelected ? "text-foreground" : "text-muted-foreground/40"
                        )}>
                          {shortDayName(day)}
                        </span>

                        {/* Círculo do dia — tamanho fixo, elevação via translateY */}
                        <div
                          className={cn(
                            "w-10 h-10 flex items-center justify-center rounded-full will-change-transform",
                            isSelected
                              ? "bg-foreground shadow-md shadow-foreground/20"
                              : "",
                            dayIsToday && !isSelected && "ring-1 ring-primary/30"
                          )}
                          style={{
                            transform: isSelected ? "scale(1.08)" : "scale(1)",
                            // Sem transição de background-color/box-shadow para evitar "bolhas cinzas"
                            // acumuladas ao arrastar rápido no iPhone (múltiplos dias fazendo fade ao mesmo tempo)
                            transition: "transform 200ms ease-out",
                          }}
                        >
                          <span
                            className={cn(
                              "font-bold leading-none",
                              isSelected ? "text-background" : "text-foreground"
                            )}
                            style={{
                              fontSize: isSelected ? "17px" : "13px",
                              transition: "font-size 200ms ease-out",
                            }}
                          >
                            {format(day, "d")}
                          </span>
                        </div>

                        {/* Dot indicador — espaço fixo */}
                        <div className="h-1.5 flex items-center justify-center">
                          {isSelected && (
                            <div className="w-1 h-1 rounded-full bg-primary" />
                          )}
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

      {/* ══════ ÁREA SCROLLÁVEL com fade-mask no topo ══════ */}
      <div className="flex-1 min-h-0 relative">
        {/* Fade mask superior — cards "entram" por baixo */}
        <div 
          className="absolute top-0 left-0 right-0 h-6 z-10 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, hsl(var(--background)), transparent)" }}
        />

        <div className="h-full overflow-y-auto overscroll-contain pb-20 pt-1">
          {!isShowingSelectedDate ? (
            <div className="px-3 sm:px-4 pt-3 pb-8 space-y-2.5 animate-pulse">
              <div className="h-3 w-28 mx-auto rounded-full bg-muted/40" />
              {[0, 1, 2].map((item) => (
                <div key={item} className="rounded-lg border border-border/50 bg-card/70 p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="h-3 w-32 rounded-full bg-muted/50" />
                    <div className="h-4 w-20 rounded bg-muted/40" />
                  </div>
                  <div className="h-3 w-44 rounded-full bg-muted/40" />
                  <div className="flex items-center justify-between">
                    <div className="h-3 w-28 rounded-full bg-muted/40" />
                    <div className="h-3 w-16 rounded-full bg-muted/50" />
                  </div>
                </div>
              ))}
            </div>
          ) : loading && !hasLoadedOnceRef.current && appointments.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : appointments.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center h-52 text-center px-8"
            >
              <Calendar className="w-7 h-7 text-muted-foreground/30 mb-3" strokeWidth={1.5} />
              <p className="text-[15px] font-semibold text-muted-foreground">
                {isToday(selectedDate) ? "Nenhum agendamento para hoje." : "Nenhum agendamento neste dia."}
              </p>
              <p className="text-[13px] text-[#4B5563] mt-1.5 max-w-[260px]">
                {isToday(selectedDate)
                  ? "Seus horários livres estão visíveis para clientes e podem ser reservados a qualquer momento."
                  : "Navegue pelo calendário ou adicione um agendamento manual."}
              </p>
            </div>
          ) : (
            <div className="px-3 sm:px-4 pt-2 pb-8 space-y-2.5">
              {/* Contador discreto */}
              <div className="flex items-center justify-center mb-1">
                <span className="text-[10px] font-semibold text-muted-foreground/60 tracking-widest uppercase tabular-nums">
                  {appointments.length} agendamento{appointments.length > 1 ? 's' : ''}
                </span>
              </div>

            {appointments.map((apt, idx) => {
              const statusConfig = getStatusColorConfig(apt.status, apt.barbeiro_confirmou);
              const paymentBadge = getPaymentBadge(apt);
              const PayIcon = paymentBadge.icon;
              const duration = apt.duracao || apt.servico?.duracao_minutos || 30;
              const horaFormatted = apt.hora.substring(0, 5);

              /* ── Visual hierarchy ── */
              const now = new Date();
              const isViewingToday = isToday(selectedDate);
              const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
              const aptEndMinutes = (() => {
                const [h, m] = apt.hora.split(':').map(Number);
                return (h * 60 + m) + duration;
              })();
              const nowMinutes = now.getHours() * 60 + now.getMinutes();
              const isPast = isViewingToday && aptEndMinutes <= nowMinutes && (apt.status === 'completed' || apt.status === 'no_show');
              
              /* Find the NEXT upcoming appointment today */
              const isNextUp = isViewingToday && !isPast && apt.hora >= currentTimeStr
                && apt.status !== 'completed' && apt.status !== 'no_show'
                && idx === appointments.findIndex(a => 
                  a.hora >= currentTimeStr 
                  && a.status !== 'completed' 
                  && a.status !== 'no_show'
                );

              return (
                <div
                  key={apt.id}
                  onClick={() => onAppointmentClick?.(apt)}
                  style={{ opacity: isPast ? 0.45 : 1 }}
                  className={cn(
                    "rounded-xl p-3.5 border bg-card border-border/60",
                    "active:scale-[0.99] transition-transform duration-150 cursor-pointer",
                    isNextUp && "ring-1 ring-foreground/15"
                  )}
                >
                  {/* Header: Serviço + Status */}
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Scissors className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
                      <span className="text-[13px] font-semibold text-foreground truncate">
                        {(() => {
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
                        })()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className={cn("w-1.5 h-1.5 rounded-full", statusConfig.dot)} />
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {statusConfig.statusLabel}
                      </span>
                      {isNextUp && (
                        <span className="text-[10px] font-medium text-muted-foreground/70 ml-1">· agora</span>
                      )}
                    </div>
                  </div>

                  {/* Cliente */}
                  <div className="flex items-center gap-2 mb-2.5">
                    <User className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
                    <span className="text-[13px] text-muted-foreground font-medium truncate">
                      {apt.profile?.nome || "Cliente"}
                    </span>
                    {isWhatsAppAppointment(apt.observacoes) && <WhatsAppBadge />}
                  </div>


                  {/* Footer: Hora + Duração + Pagamento + Preço */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground/70">
                      <span className="font-mono font-semibold tabular-nums text-foreground">{horaFormatted}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {duration}min
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <PayIcon className="w-3 h-3" />
                        {paymentBadge.label}
                      </span>
                    </div>
                    <span className={cn(
                      "text-[13px] font-semibold tabular-nums",
                      apt.is_free ? "text-muted-foreground/50 line-through" : "text-foreground"
                    )}>
                      {(apt.tipo_agendamento === "plano" || apt.payment_method === "plano")
                        ? "Plano"
                        : apt.is_free
                          ? "Grátis"
                          : `R$ ${apt.preco.toFixed(2).replace('.', ',')}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>
      </div>

      {/* ══════ FAB ELEGANTE ══════ */}
      <button
        onClick={() => {
          setSelectedSlotTime("09:00");
          setManualBookingOpen(true);
        }}
        className={cn(
          "fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom)+1.75rem)] right-4 z-30",
          "w-12 h-12 rounded-full",
          "bg-foreground text-background",
          "flex items-center justify-center",
          "shadow-[0_0_10px_2px_hsl(var(--foreground)/0.12)]",
          "active:scale-90 transition-all duration-200"
        )}
      >
        <Plus className="w-5 h-5" />
      </button>

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
