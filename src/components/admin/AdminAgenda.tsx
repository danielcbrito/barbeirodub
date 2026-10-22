import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, addDays, isToday, isSameDay, startOfWeek } from "date-fns";
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
  X,
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
import { extractWalkInName, isWhatsAppAppointment, extractWhatsAppName } from "@/lib/walkInName";
import { WhatsAppBadge } from "@/components/shared/WhatsAppBadge";
import { extractDebtFromAppointment } from "@/lib/barberCancellationFee";
import { readSyncCache, writeSyncCache } from "@/lib/syncQueryCache";
import { fetchAgendaDia } from "@/lib/fetchers/agendaFetchers";
import { AdminContext } from "@/pages/Admin";
import { getStoredAgendaDate, saveAgendaSelectedDate } from "@/lib/agendaDatePersistence";
import { useIsMobile } from "@/hooks/use-mobile";
import { AdminMobileAgenda } from "./mobile/AdminMobileAgenda";
import { canAutoOpenOverdueModal, recordOverdueModalDismissal } from "@/lib/modalFrequency";
import { ConfirmAttendanceModal } from "./ConfirmAttendanceModal";
import { CancelAllAppointmentsModal } from "./CancelAllAppointmentsModal";
import { MobileManualBookingModal } from "./mobile/MobileManualBookingModal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdminBarbeiroId } from "@/hooks/useAdminBarbeiroId";
import { useOverdueAppointments } from "@/hooks/useOverdueAppointments";
import { PendingAppointmentsModal } from "@/components/barber/PendingAppointmentsModal";

export interface TimelineAppointment {
  id: string;
  data: string;
  hora: string;
  status: string;
  preco: number;
  observacoes: string | null;
  barbeiro_confirmou: boolean | null;
  cliente_confirmou: boolean | null;
  ponto_liberado: boolean | null;
  user_id: string;
  servico_id: string;
  is_free: boolean | null;
  payment_method: string | null;
  tipo_agendamento: string | null;
  profile: { nome: string; cpf?: string } | null;
  servico: { nome: string; duracao_minutos: number } | null;
  pagamentos: Array<{ metodo: string; status: string; valor: number }>;
}

interface AdminAgendaProps {
  adminContext: AdminContext;
  tenantId?: string | null;
}

/** Status color config — same as mobile */
const getStatusColorConfig = (status: string, barbeiroConfirmou: boolean | null) => {
  if (status === "completed") {
    return {
      bg: "bg-emerald-500/6",
      border: "dark:border-emerald-500/15 border-emerald-400/40",
      accent: "dark:border-l-emerald-500 border-l-emerald-500",
      statusBadge: "dark:bg-emerald-500/10 dark:text-emerald-400 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60",
      statusLabel: "CONCLUÍDO",
      lightBg: "dark:bg-transparent bg-emerald-50/50",
    };
  }
  if (status === "no_show" || status === "nao_veio" || status === "faltou") {
    return {
      bg: "bg-zinc-500/6",
      border: "dark:border-zinc-500/15 border-zinc-400/40",
      accent: "dark:border-l-zinc-500 border-l-zinc-500",
      statusBadge: "dark:bg-zinc-500/10 dark:text-zinc-400 bg-zinc-50 text-zinc-700 ring-1 ring-zinc-200/60",
      statusLabel: "NÃO VEIO",
      lightBg: "dark:bg-transparent bg-zinc-50/50",
    };
  }
  if (status === "confirmed" || barbeiroConfirmou) {
    return {
      bg: "bg-blue-500/6",
      border: "dark:border-blue-500/15 border-blue-400/40",
      accent: "dark:border-l-blue-500 border-l-blue-500",
      statusBadge: "dark:bg-blue-500/10 dark:text-blue-400 bg-blue-50 text-blue-700 ring-1 ring-blue-200/60",
      statusLabel: "AGENDADO",
      lightBg: "dark:bg-transparent bg-blue-50/50",
    };
  }
  return {
    bg: "bg-amber-500/6",
    border: "dark:border-amber-500/15 border-amber-400/40",
    accent: "dark:border-l-amber-500 border-l-amber-500",
    statusBadge: "dark:bg-amber-500/10 dark:text-amber-400 bg-amber-50 text-amber-700 ring-1 ring-amber-200/60",
    statusLabel: "PENDENTE",
    lightBg: "dark:bg-transparent bg-amber-50/50",
  };
};

/** Payment badge — same as mobile */
const getPaymentBadge = (apt: { tipo_agendamento: string | null; payment_method: string | null; is_free: boolean | null }) => {
  if (apt.tipo_agendamento === "plano") {
    return { icon: Crown, label: "Plano", cls: "dark:text-purple-400 text-purple-600 dark:bg-purple-500/10 bg-purple-500/15" };
  }
  if (apt.is_free) {
    return { icon: Gift, label: "Grátis", cls: "dark:text-fuchsia-400 text-fuchsia-600 dark:bg-fuchsia-500/10 bg-fuchsia-500/15" };
  }
  if (apt.payment_method === "pix") {
    return { icon: QrCode, label: "PIX", cls: "dark:text-cyan-400 text-cyan-600 dark:bg-cyan-500/10 bg-cyan-500/15" };
  }
  if (apt.payment_method === "card" || apt.payment_method === "credit_card") {
    return { icon: CreditCard, label: "Cartão", cls: "dark:text-blue-400 text-blue-600 dark:bg-blue-500/10 bg-blue-500/15" };
  }
  return { icon: Banknote, label: "Dinheiro", cls: "dark:text-green-400 text-green-600 dark:bg-green-500/10 bg-green-500/15" };
};

export function AdminAgenda({ adminContext, tenantId }: AdminAgendaProps) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();
  const { barbeiroId: adminBarbeiroId } = useAdminBarbeiroId(adminContext.userId);
  const effectiveBarbeiroId = adminContext.barbeiroId || adminBarbeiroId;
  const overdueState = useOverdueAppointments(effectiveBarbeiroId, { enabled: !isMobile });
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


  const initialDate = useMemo(() => getStoredAgendaDate(location.state?.selectedDate), [location.state?.selectedDate]);
  const [selectedDate, setSelectedDate] = useState<Date>(() => initialDate);

  useEffect(() => {
    if (location.state?.selectedDate) {
      const parsed = getStoredAgendaDate(location.state.selectedDate);
      setSelectedDate(parsed);
    }
  }, [location.state?.selectedDate]);

  useEffect(() => {
    saveAgendaSelectedDate(selectedDate);
  }, [selectedDate]);

  const syncKey = (dateStr: string) =>
    `admin-agenda-desktop:${effectiveBarbeiroId || tenantId || "all"}:${dateStr}`;
  const initialKey = format(initialDate, "yyyy-MM-dd");
  const [appointments, setAppointments] = useState<TimelineAppointment[]>(
    () => readSyncCache<TimelineAppointment[]>(syncKey(initialKey))?.data || []
  );
  const [loading, setLoading] = useState(
    () => !readSyncCache<TimelineAppointment[]>(syncKey(initialKey))
  );
  const [confirmModalAppointment, setConfirmModalAppointment] = useState<TimelineAppointment | null>(null);
  const [cancelAllModalOpen, setCancelAllModalOpen] = useState(false);
  const [manualBookingModalOpen, setManualBookingModalOpen] = useState(false);
  const [selectedEmptySlot, setSelectedEmptySlot] = useState({ date: "", time: "" });
  const [filterService, setFilterService] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [services, setServices] = useState<Array<{ id: string; nome: string }>>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [tenantBarberIds, setTenantBarberIds] = useState<string[] | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const isInitialScrollDone = useRef(false);
  const isInitialLoad = useRef(true);
  const currentDateRef = useRef<string>("");

  // Estabilizar array de dias — hoje SEMPRE no fuso local
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);
  const allDays = useMemo(() => Array.from({ length: 31 }, (_, i) => addDays(today, i - 15)), [today]);
  const todayIndex = 15;
  const isTenantScope = !adminContext.isAdmin && !!tenantId;

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

  useEffect(() => {
    if (!isTenantScope || !tenantId) {
      setTenantBarberIds(null);
      return;
    }

    (async () => {
      const { data, error } = await supabase
        .from("barbeiros")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("ativo", true)
        .is("deleted_at", null);

      if (error) {
        console.error("Erro ao carregar barbeiros do tenant:", error);
        setTenantBarberIds([]);
        return;
      }

      setTenantBarberIds((data || []).map((barber) => barber.id));
    })();
  }, [isTenantScope, tenantId]);

  // Load appointments for selected date
  const loadAppointments = useCallback(async (date: Date, silent = false) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    currentDateRef.current = dateStr;
    try {
      if (!silent) setLoading(true);

      /* ── Caminho rápido: RPC agregada única (mesmo motor do app do barbeiro) ── */
      if (!isTenantScope && adminContext.barbeiroId) {
        try {
          const fast = await fetchAgendaDia(adminContext.barbeiroId, dateStr);
          if (currentDateRef.current !== dateStr) return;
          const visible = fast.filter((a) =>
            ["pending", "confirmed", "completed", "no_show"].includes(a.status)
          ) as unknown as TimelineAppointment[];
          setAppointments(visible);
          writeSyncCache(syncKey(dateStr), visible);
          if (isInitialLoad.current) isInitialLoad.current = false;
          return;
        } catch (e) {
          console.warn("[AdminAgenda] bundle falhou, usando fallback", e);
        }
      }



      /* Select apenas campos usados nos cards + batch fetching em vez de N+1 */
      let query = supabase
        .from("agendamentos")
        .select("id, data, hora, duracao, status, preco, observacoes, barbeiro_confirmou, cliente_confirmou, ponto_liberado, user_id, servico_id, barbeiro_id, is_free, payment_method, tipo_agendamento, remarcacao_solicitada, motivo_remarcacao")
        .eq("data", dateStr)
        .neq("status", "excluido")
        .order("hora", { ascending: true });

      if (isTenantScope) {
        if (!tenantBarberIds?.length) {
          setAppointments([]);
          if (isInitialLoad.current) isInitialLoad.current = false;
          return;
        }

        query = query.in("barbeiro_id", tenantBarberIds);
      } else if (adminContext.barbeiroId) {
        query = query.eq("barbeiro_id", adminContext.barbeiroId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Race condition guard
      if (currentDateRef.current !== dateStr) return;

      const agendamentos = data || [];
      if (!agendamentos.length) {
        setAppointments([]);
        if (isInitialLoad.current) isInitialLoad.current = false;
        return;
      }

      /* ── Batch fetch em vez de N+1 (3 queries em vez de 3N) ── */
      const userIds = [...new Set(agendamentos.map((a) => a.user_id))];
      const servicoIds = [...new Set(agendamentos.map((a) => a.servico_id))];
      const aptIds = agendamentos.map((a) => a.id);

      const [profilesRes, servicosRes, pagamentosRes] = await Promise.all([
        supabase.from("profiles").select("id, nome, cpf").in("id", userIds),
        supabase.from("servicos").select("id, nome, duracao_minutos").in("id", servicoIds),
        supabase.from("pagamentos").select("agendamento_id, metodo, status, valor").in("agendamento_id", aptIds),
      ]);

      const profilesMap = new Map((profilesRes.data || []).map((p) => [p.id, p]));
      const servicosMap = new Map((servicosRes.data || []).map((s) => [s.id, s]));
      const pagamentosMap = new Map<string, Array<{ metodo: string; status: string; valor: number }>>();
      for (const p of pagamentosRes.data || []) {
        const key = p.agendamento_id as string;
        const arr = pagamentosMap.get(key) || [];
        arr.push({ metodo: p.metodo, status: p.status, valor: p.valor });
        pagamentosMap.set(key, arr);
      }

      const appointmentsWithDetails = agendamentos.map((apt) => {
        const profile = profilesMap.get(apt.user_id);
        const servico = servicosMap.get(apt.servico_id);
        // Encaixe walk-in ou WhatsApp: nome real digitado fica em observacoes
        const walkInName = extractWalkInName(apt.observacoes);
        const whatsAppName = extractWhatsAppName(apt.observacoes);
        const displayName = whatsAppName || walkInName || profile?.nome || null;
        return {
          ...apt,
          profile: displayName
            ? { nome: displayName, cpf: profile?.cpf || undefined }
            : profile
            ? { nome: profile.nome, cpf: profile.cpf }
            : null,
          servico: servico ? { nome: servico.nome, duracao_minutos: servico.duracao_minutos } : null,
          pagamentos: pagamentosMap.get(apt.id) || [],
        };
      });

      // Race condition guard again
      if (currentDateRef.current !== dateStr) return;

      setAppointments(appointmentsWithDetails as TimelineAppointment[]);
      writeSyncCache(syncKey(dateStr), appointmentsWithDetails);
      if (isInitialLoad.current) isInitialLoad.current = false;
    } catch (error) {
      console.error("Error loading appointments:", error);
      if (!silent) toast.error("Erro ao carregar agendamentos");
    } finally {
      if (currentDateRef.current === dateStr) {
        setLoading(false);
      }
    }
  }, [adminContext.barbeiroId, isTenantScope, tenantBarberIds]);

  useEffect(() => {
    loadServices();
  }, []);

  useEffect(() => {
    if (isTenantScope && tenantBarberIds === null) return;

    // Hidratação instantânea do cache do dia (0ms, sem flash de lista vazia)
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const cached = readSyncCache<TimelineAppointment[]>(syncKey(dateStr))?.data;
    if (cached) {
      setAppointments(cached);
      setLoading(false);
      loadAppointments(selectedDate, true);
    } else {
      loadAppointments(selectedDate);
    }

    const channelConfig = isTenantScope
      ? { event: '*' as const, schema: 'public' as const, table: 'agendamentos' as const }
      : adminContext.barbeiroId
      ? { event: '*' as const, schema: 'public' as const, table: 'agendamentos' as const, filter: `barbeiro_id=eq.${adminContext.barbeiroId}` }
      : { event: '*' as const, schema: 'public' as const, table: 'agendamentos' as const };

    if (isMobile) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      const channelId = `admin-agenda-desktop-v3-${isTenantScope ? tenantId : (adminContext.barbeiroId || 'all')}-${Math.random().toString(36).slice(2, 9)}`;
      channel = supabase
        .channel(channelId)
        .on('postgres_changes', channelConfig as any, (payload) => {
          loadAppointments(selectedDate, true);
          if (payload.eventType === 'INSERT') {
            toast.success("Novo agendamento recebido!");
          }
        })
        .subscribe();
    } catch (err) {
      console.warn('[AdminAgenda] Erro ao conectar canal Realtime:', err);
    }

    const pollingInterval = setInterval(() => {
      loadAppointments(selectedDate, true);
    }, 15000);

    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {}
      }
      clearInterval(pollingInterval);
    };
  }, [selectedDate, loadAppointments, adminContext.barbeiroId, isTenantScope, tenantBarberIds, tenantId]);

  // Check for appointments that need confirmation - ONLY for TODAY
  useEffect(() => {
    const checkAppointmentCompletion = () => {
      const now = new Date();
      const currentDateStr = format(now, 'yyyy-MM-dd');
      const todaysAppointments = appointments.filter(apt => apt?.data === currentDateStr);

      todaysAppointments.forEach(apt => {
        if (!apt || !apt.hora) return;
        if (apt.status === 'completed' || apt.status === 'cancelled_by_admin' ||
            apt.status === 'cancelled_by_user' || apt.status === 'no_show') return;

        const [hours, minutes] = (apt.hora || "00:00").split(':').map(Number);
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

  const loadServices = async () => {
    try {
      const { data, error } = await supabase
        .from("servicos")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      setServices(data || []);
    } catch (error) {
      console.error("Error loading services:", error);
    }
  };

  const filteredAppointments = appointments.filter(apt => {
    if (filterService !== "all" && apt.servico_id !== filterService) return false;
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

      setAppointments((prev) =>
        prev.map((apt) =>
          idsToComplete.includes(apt.id)
            ? { ...apt, status: "completed", barbeiro_confirmou: true }
            : apt
        )
      );

      await overdueState.completeBulk(idsToComplete);
      await loadAppointments(selectedDate, true);
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
      <AdminMobileAgenda
        onAppointmentClick={(apt) => {
          saveAgendaSelectedDate(apt.data || selectedDate);
          navigate(`/admin/agendamento/${apt.id}`, { state: { appointment: apt as any } });
        }}
        barbeiroId={effectiveBarbeiroId}
        tenantId={tenantId}
      />
    );
  }

  // ========== DESKTOP — MOBILE-INSPIRED DESIGN ==========
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

            {/* Filters Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all",
                showFilters
                  ? "bg-primary/10 text-primary"
                  : "dark:bg-foreground/5 bg-foreground/5 text-muted-foreground dark:hover:bg-foreground/10 hover:bg-foreground/10"
              )}
            >
              <Filter className="w-4 h-4" />
              Filtros
            </button>

            {/* Cancel All */}
            {filteredAppointments.length > 0 && (
              <button
                onClick={() => setCancelAllModalOpen(true)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all"
              >
                <X className="w-4 h-4" />
                Cancelar Todos
              </button>
            )}
          </div>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="flex flex-wrap gap-3 p-4 mb-4 rounded-xl dark:bg-foreground/[0.02] bg-foreground/[0.02] border dark:border-foreground/5 border-foreground/5 overflow-hidden">
            <Select value={filterService} onValueChange={setFilterService}>
              <SelectTrigger className="w-[200px] dark:bg-foreground/5 bg-foreground/5 dark:border-foreground/10 border-foreground/10">
                <SelectValue placeholder="Serviço" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os serviços</SelectItem>
                {services.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[200px] dark:bg-foreground/5 bg-foreground/5 dark:border-foreground/10 border-foreground/10">
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

        {/* ══════ DATE CAROUSEL — Desktop adapted ══════ */}
        <div className="mb-0">
          {/* Botão Hoje — sempre presente, opacity controla visibilidade */}
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

          {/* Carrossel de datas — Desktop: items maiores */}
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

      {/* ══════ APPOINTMENT LIST — Desktop card grid ══════ */}
      <div className="flex-1 min-h-0 px-6 pb-8">
        {loading ? (
          <div className="flex items-center justify-center h-52">
            <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : filteredAppointments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-20 h-20 rounded-2xl bg-secondary/30 flex items-center justify-center mb-5">
              <Calendar className="w-9 h-9 text-muted-foreground/40" />
            </div>
            <p className="text-foreground font-semibold text-base">Nenhum agendamento</p>
            <p className="text-sm text-muted-foreground mt-1.5">
              {isToday(selectedDate) ? "Dia livre — aproveite!" : "Sem compromissos neste dia"}
            </p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="flex items-center gap-3 mb-4">
              <span className="text-sm font-semibold text-foreground">
                {filteredAppointments.length} agendamento{filteredAppointments.length > 1 ? 's' : ''}
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
                const duration = (apt as any).duracao || apt.servico?.duracao_minutos || 30;
                const rawHora = apt.hora || "00:00";
                const horaFormatted = rawHora.slice(0, 5);

                const isCompleted = apt.status === "completed" || apt.status === "no_show";
                const debtInfo = extractDebtFromAppointment(apt);

                return (
                  <div
                    key={apt.id}
                    onClick={() => {
                      saveAgendaSelectedDate(apt.data || selectedDate);
                      navigate(`/admin/agendamento/${apt.id}`, { state: { appointment: apt } });
                    }}
                    style={{ opacity: isCompleted ? 0.48 : 1 }}
                    className={cn(
                      "rounded-2xl border-l-[3px] p-4 border transition-all cursor-pointer backdrop-blur-xl backdrop-saturate-[180%]",
                      isCompleted
                        ? "dark:bg-white/[0.02] bg-card/35 border-border/20 dark:border-white/[0.04] shadow-none"
                        : "border-border/40 dark:border-white/[0.08] bg-card/75 dark:bg-white/[0.04] hover:bg-card/90 dark:hover:bg-white/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.03),inset_0_1px_1px_rgba(255,255,255,0.4)] dark:shadow-[0_2px_16px_rgba(0,0,0,0.25),inset_0_1px_1px_rgba(255,255,255,0.06)] active:scale-[0.99]",
                      statusConfig.border, statusConfig.accent, statusConfig.lightBg
                    )}
                  >
                    {/* Header: Serviço + Status */}
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Scissors className="w-4 h-4 dark:text-muted-foreground/50 text-foreground/40 flex-shrink-0" />
                        <span className="text-sm font-semibold text-foreground truncate">
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
                      <span className={cn(
                        "flex-shrink-0 px-2.5 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase",
                        statusConfig.statusBadge
                      )}>
                        {statusConfig.statusLabel}
                      </span>
                    </div>

                    {/* Cliente */}
                    <div className="flex items-center gap-2.5 mb-3">
                      <User className="w-4 h-4 dark:text-muted-foreground/50 text-foreground/40 flex-shrink-0" />
                      <span className="text-sm dark:text-muted-foreground text-foreground/80 font-medium truncate">
                        {apt.profile?.nome || "Cliente"}
                      </span>
                      {isWhatsAppAppointment(apt.observacoes) && <WhatsAppBadge />}
                      {debtInfo.hasDebt && (
                        <span className="px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25 text-[10px] font-semibold tabular-nums shrink-0">
                          + R$ {debtInfo.debtAmount.toFixed(2).replace(".", ",")} taxa
                        </span>
                      )}
                    </div>

                    {/* Footer: Hora + Duração + Pagamento + Preço */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-xs dark:text-muted-foreground/50 text-foreground/50">
                        <span className="font-mono font-bold tabular-nums text-foreground text-sm">{horaFormatted}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {duration}min
                        </span>
                        {apt.tipo_agendamento !== "plano" && apt.payment_method !== "plano" && (
                          <span className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium",
                            paymentBadge.cls
                          )}>
                            <PayIcon className="w-3.5 h-3.5" />
                            {paymentBadge.label}
                          </span>
                        )}
                      </div>
                      {(apt.tipo_agendamento === "plano" || apt.payment_method === "plano") ? (
                        <div className="flex items-center gap-1 bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded-full text-[10px] font-bold">
                          <Crown className="w-2.5 h-2.5 fill-purple-400/20" />
                          PLANO
                        </div>
                      ) : (
                        <div className="text-right">
                          <span className={cn(
                            "text-sm font-semibold tabular-nums block",
                            apt.is_free ? "text-muted-foreground/40 line-through" : "text-foreground"
                          )}>
                            {apt.is_free
                              ? "Grátis"
                              : `R$ ${typeof apt.preco === "number" && !isNaN(apt.preco) ? apt.preco.toFixed(2).replace('.', ',') : "0,00"}`}
                          </span>
                          {debtInfo.hasDebt && (
                            <span className="text-[9.5px] text-amber-600 dark:text-amber-400 font-medium block tabular-nums">
                              Com taxa inclusa
                            </span>
                          )}
                        </div>
                      )}
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
          setSelectedEmptySlot({ date: format(selectedDate, 'yyyy-MM-dd'), time: "" });
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
        onUpdate={() => loadAppointments(selectedDate)}
      />

      <CancelAllAppointmentsModal
        open={cancelAllModalOpen}
        onOpenChange={setCancelAllModalOpen}
        date={selectedDate}
        appointmentsCount={filteredAppointments.length}
        onSuccess={() => loadAppointments(selectedDate)}
      />

      <MobileManualBookingModal
        open={manualBookingModalOpen}
        onOpenChange={setManualBookingModalOpen}
        date={selectedEmptySlot.date}
        initialTime={selectedEmptySlot.time}
        onSuccess={() => loadAppointments(selectedDate)}
        skipValidation={true}
        barbeiroId={effectiveBarbeiroId || undefined}
        tenantId={tenantId}
      />

      {/* Modal de confirmação em lote de agendamentos pendentes */}
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
