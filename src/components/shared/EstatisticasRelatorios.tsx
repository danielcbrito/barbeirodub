import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { STALE_TIMES } from "@/lib/queryConstants";
import {
  format, startOfDay, endOfDay, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, startOfYear, endOfYear,
  subMonths, addMonths, subDays, eachDayOfInterval, eachMonthOfInterval,
  isSameMonth, isAfter,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Users, CalendarCheck, DollarSign, ChevronLeft, ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { CuponsDescontosCard } from "@/components/shared/CuponsDescontosCard";

/* ═══════════════════════════════════════
   Types
   ═══════════════════════════════════════ */

type Period = "hoje" | "semana" | "mes" | "ano";

interface Props {
  barbeiroId?: string | null;
  tenantId?: string | null;
  isGlobal?: boolean;
  basePath?: string;
}

interface DayPoint {
  label: string;
  value: number;
  isToday: boolean;
  isFuture: boolean;
}

interface MetricCard {
  id: string;
  title: string;
  value: string;
  change: number;
  icon: typeof Users;
  color: string;
  chartData: DayPoint[];
  subMetrics: { label: string; value: string; icon?: typeof Users }[];
}

/* ═══════════════════════════════════════
   Component
   ═══════════════════════════════════════ */

export function EstatisticasRelatorios({ barbeiroId, tenantId, isGlobal = false, basePath }: Props) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [period, setPeriod] = useState<Period>("mes");

  // Referência de mês para navegação — padrão: mês atual
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now);

  // Não permitir navegar para o futuro
  const canGoForward = !isSameMonth(selectedMonth, now);
  const canGoBack = true;

  const goToPrevMonth = () => setSelectedMonth((m) => subMonths(m, 1));
  const goToNextMonth = () => {
    if (canGoForward) setSelectedMonth((m) => addMonths(m, 1));
  };

  // Resetar mês ao mudar para "hoje" ou "semana"
  useEffect(() => {
    if (period === "hoje" || period === "semana") {
      setSelectedMonth(now);
    }
  }, [period]);

  // Período atual e anterior
  const { dateRange, prevRange } = useMemo(() => {
    const ref = selectedMonth;
    let start: Date, end: Date, prevStart: Date, prevEnd: Date;

    switch (period) {
      case "hoje":
        start = startOfDay(now);
        end = endOfDay(now);
        prevStart = startOfDay(subDays(now, 1));
        prevEnd = endOfDay(subDays(now, 1));
        break;
      case "semana":
        start = startOfWeek(now, { weekStartsOn: 1 });
        end = endOfWeek(now, { weekStartsOn: 1 });
        prevStart = startOfWeek(subDays(start, 1), { weekStartsOn: 1 });
        prevEnd = endOfWeek(subDays(start, 1), { weekStartsOn: 1 });
        break;
      case "mes":
        start = startOfMonth(ref);
        end = endOfMonth(ref);
        prevStart = startOfMonth(subMonths(ref, 1));
        prevEnd = endOfMonth(subMonths(ref, 1));
        break;
      case "ano":
        start = startOfYear(ref);
        end = endOfYear(ref);
        prevStart = startOfYear(subDays(start, 1));
        prevEnd = endOfYear(subDays(start, 1));
        break;
      default:
        start = startOfMonth(ref);
        end = endOfMonth(ref);
        prevStart = startOfMonth(subMonths(ref, 1));
        prevEnd = endOfMonth(subMonths(ref, 1));
    }

    return { dateRange: { start, end }, prevRange: { start: prevStart, end: prevEnd } };
  }, [period, selectedMonth]);

  // Resolver IDs dos barbeiros do tenant para filtro global
  const { data: tenantBarberIds } = useQuery({
    queryKey: ['tenant-barber-ids', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("barbeiros")
        .select("id")
        .eq("tenant_id", tenantId!)
        .eq("ativo", true)
        .is("deleted_at", null);
      return (data || []).map((b) => b.id);
    },
    enabled: isGlobal && !!tenantId,
    staleTime: STALE_TIMES.PERFIL_BARBEIRO,
  });

  // Query principal de estatísticas
  const monthKey = format(selectedMonth, "yyyy-MM");
  const queryKey = QUERY_KEYS.shared.estatisticas(barbeiroId || null, period, monthKey);

  const isReady = !(isGlobal && tenantId && tenantBarberIds === undefined);

  const { data: statsData, isLoading: loading } = useQuery({
    queryKey,
    queryFn: async () => {
      const resolvedBarberIds = tenantBarberIds || null;
      const startStr = format(dateRange.start, "yyyy-MM-dd");
      const endStr = format(dateRange.end, "yyyy-MM-dd");
      const prevStartStr = format(prevRange.start, "yyyy-MM-dd");
      const prevEndStr = format(prevRange.end, "yyyy-MM-dd");

      let query = supabase
        .from("agendamentos")
        .select("id, data, hora, preco, status, user_id, is_free, payment_method, barbeiro_id")
        .gte("data", prevStartStr)
        .lte("data", endStr)
        .in("status", ["completed", "confirmed", "pending", "no_show"])
        .limit(3000);

      if (barbeiroId) {
        query = query.eq("barbeiro_id", barbeiroId);
      }
      if (!barbeiroId && isGlobal && resolvedBarberIds && resolvedBarberIds.length > 0) {
        query = query.in("barbeiro_id", resolvedBarberIds);
      }

      let prevClientQuery = supabase
        .from("agendamentos")
        .select("user_id")
        .lt("data", prevStartStr)
        .in("status", ["completed", "confirmed", "pending"])
        .limit(5000);

      if (barbeiroId) {
        prevClientQuery = prevClientQuery.eq("barbeiro_id", barbeiroId);
      } else if (isGlobal && resolvedBarberIds && resolvedBarberIds.length > 0) {
        prevClientQuery = prevClientQuery.in("barbeiro_id", resolvedBarberIds);
      }


      let planCashCurrentQuery = supabase
        .from("pagamentos_plano_barbearia")
        .select("valor")
        .gte("created_at", `${startStr}T00:00:00`)
        .lte("created_at", `${endStr}T23:59:59`);

      let planCashPrevQuery = supabase
        .from("pagamentos_plano_barbearia")
        .select("valor")
        .gte("created_at", `${prevStartStr}T00:00:00`)
        .lte("created_at", `${prevEndStr}T23:59:59`);

      if (barbeiroId) {
        planCashCurrentQuery = planCashCurrentQuery.eq("barbeiro_id", barbeiroId);
        planCashPrevQuery = planCashPrevQuery.eq("barbeiro_id", barbeiroId);
      } else if (isGlobal && resolvedBarberIds && resolvedBarberIds.length > 0) {
        planCashCurrentQuery = planCashCurrentQuery.in("barbeiro_id", resolvedBarberIds);
        planCashPrevQuery = planCashPrevQuery.in("barbeiro_id", resolvedBarberIds);
      }

      const planPixCurrentQuery = supabase
        .from("pagamentos")
        .select("valor, assinatura_id")
        .not("assinatura_id", "is", null)
        .is("agendamento_id", null)
        .eq("status", "paid")
        .gte("created_at", `${startStr}T00:00:00`)
        .lte("created_at", `${endStr}T23:59:59`);

      const planPixPrevQuery = supabase
        .from("pagamentos")
        .select("valor, assinatura_id")
        .not("assinatura_id", "is", null)
        .is("agendamento_id", null)
        .eq("status", "paid")
        .gte("created_at", `${prevStartStr}T00:00:00`)
        .lte("created_at", `${prevEndStr}T23:59:59`);

      const subsQuery = barbeiroId
        ? supabase.from("assinaturas").select("id").eq("barbeiro_id", barbeiroId)
        : (resolvedBarberIds && resolvedBarberIds.length > 0
          ? supabase.from("assinaturas").select("id").in("barbeiro_id", resolvedBarberIds)
          : Promise.resolve({ data: null } as any));

      let subsCountCurrentQuery = supabase
        .from("assinaturas")
        .select("id, user_id")
        .gte("created_at", `${startStr}T00:00:00`)
        .lte("created_at", `${endStr}T23:59:59`)
        .in("status", ["active", "pending_cash"]);

      let subsCountPrevQuery = supabase
        .from("assinaturas")
        .select("id, user_id")
        .gte("created_at", `${prevStartStr}T00:00:00`)
        .lte("created_at", `${prevEndStr}T23:59:59`)
        .in("status", ["active", "pending_cash"]);

      if (barbeiroId) {
        subsCountCurrentQuery = subsCountCurrentQuery.eq("barbeiro_id", barbeiroId);
        subsCountPrevQuery = subsCountPrevQuery.eq("barbeiro_id", barbeiroId);
      } else if (resolvedBarberIds && resolvedBarberIds.length > 0) {
        subsCountCurrentQuery = subsCountCurrentQuery.in("barbeiro_id", resolvedBarberIds);
        subsCountPrevQuery = subsCountPrevQuery.in("barbeiro_id", resolvedBarberIds);
      }

      const [aptsRes, prevClientsRes, planCashCurRes, planCashPrevRes, planPixCurRes, planPixPrevRes, subsRes, subsCountCurRes, subsCountPrevRes] = await Promise.all([
        query,
        prevClientQuery,
        planCashCurrentQuery,
        planCashPrevQuery,
        planPixCurrentQuery,
        planPixPrevQuery,
        subsQuery,
        subsCountCurrentQuery,
        subsCountPrevQuery,
      ]);

      const subIdSet = subsRes?.data
        ? new Set((subsRes.data as any[]).map((s: any) => s.id))
        : null;

      const planCashCurrent = (planCashCurRes.data || []).reduce((s: number, a: any) => s + (a.valor || 0), 0);
      const planCashPrev = (planCashPrevRes.data || []).reduce((s: number, a: any) => s + (a.valor || 0), 0);
      const isScopedRevenue = (!!barbeiroId) || (isGlobal && !!tenantId);
      const filteredPixCur = subIdSet
        ? (planPixCurRes.data || []).filter((p: any) => subIdSet.has(p.assinatura_id))
        : (isScopedRevenue ? [] : (planPixCurRes.data || []));
      const filteredPixPrev = subIdSet
        ? (planPixPrevRes.data || []).filter((p: any) => subIdSet.has(p.assinatura_id))
        : (isScopedRevenue ? [] : (planPixPrevRes.data || []));
      const planPixCurrent = filteredPixCur.reduce((s: number, a: any) => s + (a.valor || 0), 0);
      const planPixPrev = filteredPixPrev.reduce((s: number, a: any) => s + (a.valor || 0), 0);

      const uniqueSubsCur = new Set((subsCountCurRes.data || []).map((s: any) => s.user_id)).size;
      const uniqueSubsPrev = new Set((subsCountPrevRes.data || []).map((s: any) => s.user_id)).size;

      return {
        appointments: aptsRes.data || [],
        previousClients: [...new Set((prevClientsRes.data || []).map((c) => c.user_id))],
        planRevenue: { current: planCashCurrent + planPixCurrent, previous: planCashPrev + planPixPrev },
        planSubscribers: { current: uniqueSubsCur, previous: uniqueSubsPrev },
      };
    },
    enabled: isReady,
    staleTime: STALE_TIMES.RELATORIOS,
  });

  const appointments = statsData?.appointments || [];
  const previousClients = statsData?.previousClients || [];
  const planRevenue = statsData?.planRevenue || { current: 0, previous: 0 };
  const planSubscribers = statsData?.planSubscribers || { current: 0, previous: 0 };

  // Filtrar agendamentos
  const currentAppts = useMemo(() => {
    const s = format(dateRange.start, "yyyy-MM-dd");
    const e = format(dateRange.end, "yyyy-MM-dd");
    return appointments.filter((a) => a.data >= s && a.data <= e);
  }, [appointments, dateRange]);

  const prevAppts = useMemo(() => {
    const s = format(prevRange.start, "yyyy-MM-dd");
    const e = format(prevRange.end, "yyyy-MM-dd");
    return appointments.filter((a) => a.data >= s && a.data <= e);
  }, [appointments, prevRange]);

  const calcChange = (current: number, previous: number): number => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  // Gerar pontos do gráfico
  const generateChartPoints = useCallback((filterFn: (a: any) => boolean): DayPoint[] => {
    const todayStr = format(now, "yyyy-MM-dd");

    if (period === "hoje") {
      return Array.from({ length: 8 }, (_, i) => i * 3).map((h) => {
        const hourStr = String(h).padStart(2, "0");
        const count = currentAppts.filter((a) => filterFn(a) && a.hora?.startsWith(hourStr)).length;
        return { label: `${hourStr}h`, value: count, isToday: true, isFuture: h > now.getHours() };
      });
    }

    if (period === "semana" || period === "mes") {
      const days = eachDayOfInterval({ start: dateRange.start, end: dateRange.end });
      return days.map((d) => {
        const dayStr = format(d, "yyyy-MM-dd");
        const count = currentAppts.filter((a) => filterFn(a) && a.data === dayStr).length;
        return {
          label: format(d, period === "semana" ? "EEE" : "d", { locale: ptBR }),
          value: count,
          isToday: dayStr === todayStr,
          isFuture: isAfter(d, now),
        };
      });
    }

    // Ano
    const months = eachMonthOfInterval({ start: dateRange.start, end: dateRange.end });
    return months.map((m) => {
      const mStart = format(startOfMonth(m), "yyyy-MM-dd");
      const mEnd = format(endOfMonth(m), "yyyy-MM-dd");
      const count = currentAppts.filter((a) => filterFn(a) && a.data >= mStart && a.data <= mEnd).length;
      return {
        label: format(m, "MMM", { locale: ptBR }),
        value: count,
        isToday: format(m, "yyyy-MM") === format(now, "yyyy-MM"),
        isFuture: isAfter(m, now),
      };
    });
  }, [currentAppts, period, dateRange, now]);

  // ═══════════ MÉTRICAS ═══════════

  const metrics: MetricCard[] = useMemo(() => {
    const currentClientIds = [...new Set(currentAppts.filter(a => ["completed", "confirmed", "pending"].includes(a.status)).map((a) => a.user_id))];
    const prevClientIds2 = [...new Set(prevAppts.filter(a => ["completed", "confirmed", "pending"].includes(a.status)).map((a) => a.user_id))];
    const totalClients = currentClientIds.length;
    const previousClientsSet = new Set(previousClients);
    const newClients = currentClientIds.filter((id) => !previousClientsSet.has(id)).length;
    const returningClients = currentClientIds.filter((id) => previousClientsSet.has(id)).length;


    const totalReservas = currentAppts.length;
    const confirmed = currentAppts.filter((a) => a.status === "confirmed").length;
    const completed = currentAppts.filter((a) => a.status === "completed").length;
    const cancelled = currentAppts.filter((a) => a.status?.includes("cancelled")).length;
    const noShow = currentAppts.filter((a) => a.status === "no_show").length;

    // Receita de serviços (agendamentos completed — preco já é 0 para gratuitos)
    const paidAppts = currentAppts.filter((a) => a.status === "completed");
    const prevPaidAppts = prevAppts.filter((a) => a.status === "completed");
    const receitaServicos = paidAppts.reduce((sum, a) => sum + Number(a.preco || 0), 0);
    const prevReceitaServicos = prevPaidAppts.reduce((sum, a) => sum + Number(a.preco || 0), 0);

    // Receita total = serviços + planos (cash + PIX de assinaturas)
    const totalReceita = receitaServicos + planRevenue.current;
    const prevTotalReceita = prevReceitaServicos + planRevenue.previous;

    // Sub-métrica de planos = pagamentos de planos cash/PIX
    const receitaPlanos = planRevenue.current;

    return [
      {
        id: "clientes",
        title: "Clientes",
        value: String(totalClients),
        change: calcChange(totalClients, prevClientIds2.length),
        icon: Users,
        color: "rgb(249, 115, 22)",
        chartData: generateChartPoints(() => true),
        subMetrics: [
          { label: "Novos", value: String(newClients) },
          { label: "Recorrentes", value: String(returningClients) },
        ],
      },
      {
        id: "reservas",
        title: "Agendamentos",
        value: String(totalReservas),
        change: calcChange(totalReservas, prevAppts.length),
        icon: CalendarCheck,
        color: "rgb(16, 185, 129)",
        chartData: generateChartPoints(() => true),
        subMetrics: [
          { label: "Confirmados", value: String(confirmed) },
          { label: "Concluídos", value: String(completed) },
          { label: "Cancelados", value: String(cancelled) },
          { label: "No-show", value: String(noShow) },
        ],
      },
      {
        id: "receita",
        title: "Receita",
        value: `R$ ${totalReceita.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`,
        change: calcChange(totalReceita, prevTotalReceita),
        icon: DollarSign,
        color: "hsl(var(--primary))",
        chartData: generateChartPoints((a) => ["completed", "confirmed"].includes(a.status) && !a.is_free),
        subMetrics: [
          { label: "Serviços", value: `R$ ${receitaServicos.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}` },
          { label: "Planos", value: `R$ ${receitaPlanos.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}` },
          { label: "Assinantes", value: String(planSubscribers.current) },
        ],
      },
    ];
  }, [currentAppts, prevAppts, previousClients, generateChartPoints, planRevenue, planSubscribers]);

  // ═══════════ MINI CHART SVG ═══════════

  const MiniChart = ({ data, color }: { data: DayPoint[]; color: string }) => {
    if (!data.length) return null;

    const maxVal = Math.max(...data.map((d) => d.value), 1);
    const w = 300, h = 100, pad = 10;
    const chartW = w - pad * 2, chartH = h - pad * 2;

    const todayIdx = data.findIndex((d) => d.isToday);
    const realData = data.filter((d) => !d.isFuture || d.isToday);
    const futureData = data.filter((d) => d.isFuture);

    const px = (i: number) => pad + (i / Math.max(data.length - 1, 1)) * chartW;
    const py = (v: number) => pad + chartH - (v / maxVal) * chartH;

    const realPath = realData.map((d, i) => {
      const idx = data.indexOf(d);
      return `${i === 0 ? "M" : "L"} ${px(idx)} ${py(d.value)}`;
    }).join(" ");

    const lastRealIdx = todayIdx >= 0 ? todayIdx : data.length - 1;
    const areaPath = realData.map((d, i) => {
      const idx = data.indexOf(d);
      return `${i === 0 ? "M" : "L"} ${px(idx)} ${py(d.value)}`;
    }).join(" ") + ` L ${px(lastRealIdx)} ${h - pad} L ${px(0)} ${h - pad} Z`;

    const futurePath = todayIdx >= 0 && futureData.length > 0
      ? `M ${px(todayIdx)} ${py(data[todayIdx].value)} ` + futureData.map((d) => `L ${px(data.indexOf(d))} ${py(d.value)}`).join(" ")
      : "";

    const gradId = `grad-${color.replace(/[^a-z0-9]/g, "")}`;

    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.18} />
            <stop offset="100%" stopColor={color} stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradId})`} />
        <path d={realPath} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {futurePath && (
          <path d={futurePath} fill="none" stroke={color} strokeWidth={2} strokeDasharray="6 4" opacity={0.45} strokeLinecap="round" />
        )}
        {todayIdx >= 0 && (
          <>
            <circle cx={px(todayIdx)} cy={py(data[todayIdx].value)} r={6} fill="hsl(var(--background))" stroke={color} strokeWidth={2.5} />
            <circle cx={px(todayIdx)} cy={py(data[todayIdx].value)} r={3} fill={color} />
          </>
        )}
      </svg>
    );
  };

  const ChartXLabels = ({ data }: { data: DayPoint[] }) => {
    const step = Math.max(1, Math.floor(data.length / 7));
    const visible = data.filter((_, i) => i % step === 0 || i === data.length - 1);

    return (
      <div className="flex justify-between px-1 mt-1">
        {visible.map((d, i) => (
          <span key={i} className={cn("text-[9px] uppercase", d.isToday ? "font-bold text-foreground" : "text-muted-foreground/50")}>
            {d.isToday ? "Hoje" : d.label}
          </span>
        ))}
      </div>
    );
  };

  // ═══════════ PERIOD TABS ═══════════

  const periods: { id: Period; label: string }[] = [
    { id: "hoje", label: "Hoje" },
    { id: "semana", label: "Semana" },
    { id: "ano", label: format(selectedMonth, "yyyy") },
  ];

  // ═══════════ RENDER ═══════════

  return (
    <div className="pb-28 -mx-3 -mt-3">
      {/* ═══ HEADER PREMIUM — seta curva + título ═══ */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md">
        <div className="flex items-center gap-2 px-4 h-14">
          <button
            onClick={() => {
              if (basePath) navigate(basePath);
              else navigate(-1);
            }}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary/50 active:scale-95 transition-all"
            aria-label="Voltar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
              <path d="M9 14L4 9l5-5" />
              <path d="M4 9h10a4 4 0 0 1 4 4v1" />
            </svg>
          </button>
          <h1 className="text-[19px] font-medium tracking-tight text-foreground flex-1">Relatórios</h1>
        </div>

        {/* Subtitle */}
        <div className="px-4 pb-2">
          <p className="text-[11px] text-muted-foreground/50">
            {isGlobal ? "Desempenho geral da barbearia" : "Acompanhe seu desempenho"}
          </p>
        </div>
        <div className="h-px bg-border/20" />
      </div>

      {/* ═══ NAVEGAÇÃO POR MÊS ═══ */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between">
          <button
            onClick={goToPrevMonth}
            className="w-9 h-9 rounded-xl flex items-center justify-center bg-secondary/40 hover:bg-secondary/60 active:scale-95 transition-all"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="w-4 h-4 text-foreground" />
          </button>

          <div className="text-center">
            <p className="text-[17px] font-semibold text-foreground capitalize">
              {format(selectedMonth, "MMMM", { locale: ptBR })}
            </p>
            <p className="text-[11px] text-muted-foreground/50 mt-px">
              {format(selectedMonth, "yyyy")}
            </p>
          </div>

          <button
            onClick={goToNextMonth}
            disabled={!canGoForward}
            className={cn(
              "w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-95",
              canGoForward
                ? "bg-secondary/40 hover:bg-secondary/60"
                : "bg-secondary/20 opacity-30 cursor-not-allowed"
            )}
            aria-label="Próximo mês"
          >
            <ChevronRight className="w-4 h-4 text-foreground" />
          </button>
        </div>
      </div>

      {/* ═══ PERIOD TABS ═══ */}
      <div className="px-4 pt-2 pb-4">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
          {periods.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={cn(
                "px-4 py-2 rounded-full text-[12px] font-semibold whitespace-nowrap transition-all duration-200 capitalize",
                period === p.id
                  ? "bg-foreground text-background shadow-sm"
                  : "bg-secondary/40 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ LOADING ═══ */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        /* ═══ METRIC CARDS ═══ */
        <div className="px-4 space-y-4">
          <AnimatePresence mode="wait">
            {metrics.map((metric, idx) => (
              <motion.div
                key={`${metric.id}-${period}-${format(selectedMonth, "yyyy-MM")}`}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: idx * 0.06, duration: 0.25 }}
                className="rounded-2xl border border-border/25 bg-card p-5"
              >
                {/* Icon + Title + Badge */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: `${metric.color}15` }}
                    >
                      <metric.icon className="w-4 h-4" style={{ color: metric.color }} />
                    </div>
                    <h3 className="text-[13px] font-semibold text-foreground">{metric.title}</h3>
                  </div>
                  <span className={cn(
                    "text-[10px] font-bold px-2.5 py-1 rounded-full",
                    metric.change > 0
                      ? "bg-emerald-500/10 text-emerald-600"
                      : metric.change < 0
                        ? "bg-red-500/10 text-red-500"
                        : "bg-muted text-muted-foreground"
                  )}>
                    {metric.change >= 0 ? "▲" : "▼"} {Math.abs(metric.change)}%
                  </span>
                </div>

                {/* Value */}
                <p className="text-[28px] font-bold tabular-nums text-foreground leading-none mb-4">
                  {metric.value}
                </p>

                {/* Chart */}
                <div className="h-[110px] mb-1">
                  <MiniChart data={metric.chartData} color={metric.color} />
                </div>
                <ChartXLabels data={metric.chartData} />

                {/* Projeção legenda */}
                <div className="flex items-center justify-end gap-1.5 mt-2 mb-3">
                  <div className="w-5 h-0 border-t-2 border-dashed" style={{ borderColor: metric.color, opacity: 0.45 }} />
                  <span className="text-[9px] italic text-muted-foreground/50">Projeção</span>
                </div>

                {/* Sub Metrics */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 pt-4 border-t border-border/15">
                  {metric.subMetrics.map((sub, si) => (
                    <div key={si} className="flex flex-col">
                      <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">{sub.label}</p>
                      <span className="text-[15px] font-bold tabular-nums text-foreground mt-0.5">{sub.value}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* ═══ EMPTY STATE ═══ */}
          {!loading && currentAppts.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16"
            >
              <CalendarCheck className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-[13px] font-medium text-muted-foreground/50">
                Nenhum agendamento neste período
              </p>
              <p className="text-[11px] text-muted-foreground/30 mt-1">
                Navegue entre meses para ver outros dados
              </p>
            </motion.div>
          )}
        </div>
      )}

      {/* Card de descontos por cupom no mês */}
      {tenantId && (
        <div className="mt-6">
          <CuponsDescontosCard tenantId={tenantId} />
        </div>
      )}
    </div>
  );
}
