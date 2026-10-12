import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  Users,
  Scissors,
  Clock,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Eye,
  EyeOff,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format, subDays, startOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { AdminContext } from "@/pages/Admin";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { CreateBankBanner } from "@/components/barber/CreateBankBanner";
import { useWhatsAppStatus } from "@/hooks/useWhatsAppStatus";
import { WhatsAppRequiredBanner } from "@/components/whatsapp/WhatsAppRequiredBanner";
import { SetupCompletionBanner } from "@/components/barber/SetupCompletionBanner";
import { useSetupCompletion } from "@/hooks/useSetupCompletion";
import { useAdminBarbeiroId } from "@/hooks/useAdminBarbeiroId";
import { CampaignPromoBanners } from "@/components/admin/CampaignPromoBanners";
import { readSyncCache, writeSyncCache } from "@/lib/syncQueryCache";


interface AdminDashboardProps {
  adminContext: AdminContext;
  basePath?: string;
  tenantId?: string | null;
}

interface DashboardData {
  todayCount: number;
  yesterdayCount: number;
  pendingCount: number;
  nextAppointment: { hora: string; clientName: string; serviceName: string } | null;
  monthRevenue: number;
  lastMonthRevenue: number;
  monthCuts: number;
  lastMonthCuts: number;
  activeClients: number;
  newClientsWeek: number;
  newClientsMonth: number;
  recentAppointments: Array<{
    id: string;
    data: string;
    hora: string;
    status: string;
    clientName: string;
    serviceName: string;
  }>;
  dailyRevenue: Array<{ label: string; receita: number }>;
}

/** Tooltip personalizado para o gráfico */
const ChartTooltipContent = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/50 bg-card px-3.5 py-2.5 shadow-xl">
      <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
      <p className="text-sm font-bold text-foreground">
        R$ {payload[0].value.toFixed(2)}
      </p>
    </div>
  );
};

export function AdminDashboard({ adminContext, basePath = "/admin", tenantId = null }: AdminDashboardProps) {
  const scopeKey = `admin-dashboard:${adminContext.barbeiroId || tenantId || "global"}`;
  const cachedDash = readSyncCache<DashboardData>(scopeKey);
  const [data, setData] = useState<DashboardData | null>(cachedDash?.data ?? null);
  const [loading, setLoading] = useState(!cachedDash?.data);
  const [showChart, setShowChart] = useState(false);
  const [revenueVisible, setRevenueVisible] = useState(true);
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { barbeiroId: adminBarbeiroId } = useAdminBarbeiroId(adminContext.userId);
  const effectiveBarbeiroId = adminContext.barbeiroId || adminBarbeiroId;
  const { isConnected: whatsAppConnected, isLoading: whatsAppLoading } = useWhatsAppStatus(effectiveBarbeiroId);

  const [tenantBarberIds, setTenantBarberIds] = useState<string[] | null>(null);
  const setupCompletion = useSetupCompletion({
    userId: adminContext.userId,
    barbeiroId: effectiveBarbeiroId || "",
    basePath,
    personalDataOptional: true,
    routeOverrides: {
      dados_gerais: `${basePath}/dados-empresa`,
      servicos: `${basePath}/servicos/cortes`,
    },
  });

  useEffect(() => {
    if (adminContext.isAdmin || !tenantId) {
      setTenantBarberIds(null);
      return;
    }

    (async () => {
      const { data } = await supabase
        .from("barbeiros")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("ativo", true)
        .is("deleted_at", null);

      setTenantBarberIds((data || []).map((b: any) => b.id));
    })();
  }, [adminContext.isAdmin, tenantId]);

  useEffect(() => {
    if (!adminContext.isAdmin && tenantId && tenantBarberIds === null) return;

    loadData();

    const channelConfig = adminContext.barbeiroId
      ? { event: "*" as const, schema: "public" as const, table: "agendamentos", filter: `barbeiro_id=eq.${adminContext.barbeiroId}` }
      : { event: "*" as const, schema: "public" as const, table: "agendamentos" };

    const channelId = adminContext.barbeiroId || tenantId || 'global';
    const channel = supabase
      .channel(`admin-dash-realtime-${channelId}`)
      .on("postgres_changes", channelConfig as any, () => loadData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [adminContext.barbeiroId, adminContext.isAdmin, tenantId, tenantBarberIds]);

  /**
   * Caminho rápido: UMA chamada ao banco (RPC agregada) — mesma
   * estratégia usada no app do barbeiro. Se falhar, cai no caminho legado.
   */
  const loadData = async () => {
    try {
      const { data: fast, error } = await supabase.rpc("get_admin_dashboard_fast", {
        p_barbeiro_id: adminContext.barbeiroId,
        p_tenant_id: adminContext.barbeiroId ? null : tenantId,
      });

      if (error || !fast || typeof fast !== "object") throw error || new Error("empty");

      const raw = fast as Record<string, any>;
      const parsed: DashboardData = {
        todayCount: Number(raw.todayCount) || 0,
        yesterdayCount: Number(raw.yesterdayCount) || 0,
        pendingCount: Number(raw.pendingCount) || 0,
        nextAppointment: raw.nextAppointment
          ? {
              hora: String(raw.nextAppointment.hora ?? ""),
              clientName: String(raw.nextAppointment.clientName ?? "Cliente"),
              serviceName: String(raw.nextAppointment.serviceName ?? "Serviço"),
            }
          : null,
        monthRevenue: Number(raw.monthRevenue) || 0,
        lastMonthRevenue: Number(raw.lastMonthRevenue) || 0,
        monthCuts: Number(raw.monthCuts) || 0,
        lastMonthCuts: Number(raw.lastMonthCuts) || 0,
        activeClients: Number(raw.activeClients) || 0,
        newClientsWeek: Number(raw.newClientsWeek) || 0,
        newClientsMonth: Number(raw.newClientsMonth) || 0,
        recentAppointments: Array.isArray(raw.recentAppointments)
          ? raw.recentAppointments.map((a: any) => ({
              id: String(a.id),
              data: String(a.data),
              hora: String(a.hora ?? ""),
              status: String(a.status ?? "pending"),
              clientName: String(a.clientName ?? "Cliente"),
              serviceName: String(a.serviceName ?? "Serviço"),
            }))
          : [],
        dailyRevenue: Array.isArray(raw.dailyRevenue)
          ? raw.dailyRevenue.map((d: any) => ({
              label: format(new Date(`${String(d.date).slice(0, 10)}T12:00:00`), "EEE", { locale: ptBR }),
              receita: Number(d.receita) || 0,
            }))
          : [],
      };

      setData(parsed);
      writeSyncCache(scopeKey, parsed);
      setLoading(false);
    } catch (err) {
      console.debug("[AdminDashboard] fast path indisponível, usando fallback:", err);
      await loadDataLegacy();
    }
  };

  const loadDataLegacy = async () => {
    try {

      const today = format(new Date(), "yyyy-MM-dd");
      const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
      const firstDayOfMonth = format(startOfMonth(new Date()), "yyyy-MM-dd");
      const firstDayLastMonth = format(startOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd");
      const lastDayLastMonth = format(subDays(startOfMonth(new Date()), 1), "yyyy-MM-dd");
      const weekAgo = format(subDays(new Date(), 7), "yyyy-MM-dd");
      // Sempre filtrar por barbeiroId quando o admin também é barbeiro
      // Isso garante que o dashboard mostre APENAS os agendamentos do próprio barbeiro,
      // mesmo que ele seja tenant_admin (proprietário da barbearia + barbeiro).
      // Quando NÃO há barbeiroId vinculado (admin puro sem perfil de barbeiro),
      // aí sim mostra a barbearia inteira.
      const bId = adminContext.barbeiroId || null;
      const isOwnBarberScope = !!bId; // tenant_admin que também é barbeiro → escopo individual
      const isTenantScope = !adminContext.isAdmin && !!tenantId && !isOwnBarberScope;
      const scopedBarberIds = isTenantScope ? (tenantBarberIds || []) : [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const addFilter = (q: any, column = "barbeiro_id") => {
        if (isOwnBarberScope) {
          return q.eq(column, bId);
        }
        if (isTenantScope) {
          if (scopedBarberIds.length === 0) {
            return q.eq(column, "00000000-0000-0000-0000-000000000000");
          }
          return q.in(column, scopedBarberIds);
        }
        return bId ? q.eq(column, bId) : q;
      };

      // Parallel queries (inclui receita de planos)
      const [
        todayRes, yesterdayRes, pendingRes, nextAptRes,
        monthRevenueRes, lastMonthRevenueRes, monthCutsRes, lastMonthCutsRes,
        clientsRes, newWeekRes, newMonthRes, recentRes,
        planCashMonthRes, planCashLastMonthRes,
        planPixMonthRes, planPixLastMonthRes,
        barberSubsRes,
        prevWeekAptsRes, prevMonthAptsRes,
      ] = await Promise.all([
        addFilter(supabase.from("agendamentos").select("*", { count: "exact", head: true }).eq("data", today).in("status", ["pending", "confirmed", "completed"])),
        addFilter(supabase.from("agendamentos").select("*", { count: "exact", head: true }).eq("data", yesterday).in("status", ["pending", "confirmed", "completed"])),
        addFilter(supabase.from("assinaturas").select("*", { count: "exact", head: true }).eq("payment_method", "cash").or("status.in.(suspended,pending_cash),and(status.eq.active,cash_payment_confirmed.eq.false)")),
        addFilter(supabase.from("agendamentos").select("hora, user_id, servico_id").eq("data", today).in("status", ["pending", "confirmed"]).gte("hora", format(new Date(), "HH:mm")).order("hora", { ascending: true }).limit(1)),
        addFilter(supabase.from("agendamentos").select("preco").gte("data", firstDayOfMonth).eq("status", "completed").limit(1000)),
        addFilter(supabase.from("agendamentos").select("preco").gte("data", firstDayLastMonth).lte("data", lastDayLastMonth).eq("status", "completed").limit(1000)),
        addFilter(supabase.from("agendamentos").select("*", { count: "exact", head: true }).gte("data", firstDayOfMonth).eq("status", "completed")),
        addFilter(supabase.from("agendamentos").select("*", { count: "exact", head: true }).gte("data", firstDayLastMonth).lte("data", lastDayLastMonth).eq("status", "completed")),
        isTenantScope || bId
          ? addFilter(supabase.from("agendamentos").select("user_id").in("status", ["confirmed", "completed"]).limit(2000))
          : supabase.from("profiles").select("*", { count: "exact", head: true }).eq("blocked", false),
        // Novos clientes: basear em agendamentos do barbeiro para ser "certeiro"
        addFilter(supabase.from("agendamentos").select("user_id, data").gte("data", weekAgo).in("status", ["confirmed", "completed"]).limit(1000)),
        addFilter(supabase.from("agendamentos").select("user_id, data").gte("data", firstDayOfMonth).in("status", ["confirmed", "completed"]).limit(1000)),
        addFilter(supabase.from("agendamentos").select("id, data, hora, status, user_id, servico_id").order("data", { ascending: false }).order("hora", { ascending: false }).limit(5)),
        // Pagamentos de planos cash (confirmados na barbearia) - mês atual
        addFilter(supabase.from("pagamentos_plano_barbearia").select("valor").gte("created_at", `${firstDayOfMonth}T00:00:00`)),
        // Pagamentos de planos cash - mês anterior
        addFilter(supabase.from("pagamentos_plano_barbearia").select("valor").gte("created_at", `${firstDayLastMonth}T00:00:00`).lte("created_at", `${lastDayLastMonth}T23:59:59`)),
        // Pagamentos de planos PIX (gateway) - mês atual
        supabase.from("pagamentos").select("valor, assinatura_id").not("assinatura_id", "is", null).is("agendamento_id", null).eq("status", "paid").gte("created_at", `${firstDayOfMonth}T00:00:00`),
        // Pagamentos de planos PIX (gateway) - mês anterior
        supabase.from("pagamentos").select("valor, assinatura_id").not("assinatura_id", "is", null).is("agendamento_id", null).eq("status", "paid").gte("created_at", `${firstDayLastMonth}T00:00:00`).lte("created_at", `${lastDayLastMonth}T23:59:59`),
        // Assinaturas vinculadas ao escopo (para filtrar PIX de planos por barbearia)
        isTenantScope
          ? supabase.from("assinaturas").select("id").in("barbeiro_id", scopedBarberIds.length ? scopedBarberIds : ["00000000-0000-0000-0000-000000000000"])
          : (bId
            ? supabase.from("assinaturas").select("id").eq("barbeiro_id", bId)
            : Promise.resolve({ data: null } as any)),
        // Também precisamos dos agendamentos ANTERIORES para saber se o cliente é novo
        addFilter(supabase.from("agendamentos").select("user_id").lt("data", weekAgo).in("status", ["confirmed", "completed"]).limit(2000)),
        addFilter(supabase.from("agendamentos").select("user_id").lt("data", firstDayOfMonth).in("status", ["confirmed", "completed"]).limit(2000)),
      ]);

      // Next appointment
      let nextAppointment = null;
      if (nextAptRes.data && nextAptRes.data.length > 0) {
        const apt = nextAptRes.data[0];
        const [pRes, sRes] = await Promise.all([
          supabase.from("profiles").select("nome").eq("id", apt.user_id).single(),
          supabase.from("servicos").select("nome").eq("id", apt.servico_id).single(),
        ]);
        nextAppointment = {
          hora: apt.hora,
          clientName: pRes.data?.nome || "Cliente",
          serviceName: sRes.data?.nome || "Serviço",
        };
      }

      // Recent with details
      const recentAppointments = await Promise.all(
        (recentRes.data || []).map(async (apt) => {
          const [p, s] = await Promise.all([
            supabase.from("profiles").select("nome").eq("id", apt.user_id).single(),
            supabase.from("servicos").select("nome").eq("id", apt.servico_id).single(),
          ]);
          return {
            id: apt.id, data: apt.data, hora: apt.hora,
            status: apt.status || "pending",
            clientName: p.data?.nome || "Cliente",
            serviceName: s.data?.nome || "Serviço",
          };
        })
      );

      // Revenue chart (7 days)
      const revenueData = [];
      for (let i = 6; i >= 0; i--) {
        const date = subDays(new Date(), i);
        const dateStr = format(date, "yyyy-MM-dd");
        const q = addFilter(supabase.from("agendamentos").select("preco").eq("data", dateStr).eq("status", "completed"));
        const { data: dayApts } = await q;
        revenueData.push({
          label: format(date, "EEE", { locale: ptBR }),
          receita: (dayApts || []).reduce((sum: number, a: any) => sum + (a.preco || 0), 0),
        });
      }

      // Receita de serviços (agendamentos completed)
      const aptMonthRevenue = (monthRevenueRes.data || []).reduce((s: number, a: any) => s + (a.preco || 0), 0);
      const aptLastMonthRevenue = (lastMonthRevenueRes.data || []).reduce((s: number, a: any) => s + (a.preco || 0), 0);

      // Filtrar PIX de planos por barbeiro (isolamento multi-tenant)
      const barberSubIdSet = barberSubsRes?.data
        ? new Set((barberSubsRes.data as any[]).map((s: any) => s.id))
        : null;

      // Receita de planos (cash + PIX filtrado por barbeiro)
      const planCashMonth = (planCashMonthRes.data || []).reduce((s: number, a: any) => s + (a.valor || 0), 0);
      const planCashLastMonth = (planCashLastMonthRes.data || []).reduce((s: number, a: any) => s + (a.valor || 0), 0);
      const isScopedRevenue = isTenantScope || !!bId;
      const filteredPixMonth = barberSubIdSet
        ? (planPixMonthRes.data || []).filter((p: any) => barberSubIdSet.has(p.assinatura_id))
        : (isScopedRevenue ? [] : (planPixMonthRes.data || []));
      const filteredPixLastMonth = barberSubIdSet
        ? (planPixLastMonthRes.data || []).filter((p: any) => barberSubIdSet.has(p.assinatura_id))
        : (isScopedRevenue ? [] : (planPixLastMonthRes.data || []));
      const planPixMonth = filteredPixMonth.reduce((s: number, a: any) => s + (a.valor || 0), 0);
      const planPixLastMonth = filteredPixLastMonth.reduce((s: number, a: any) => s + (a.valor || 0), 0);

      // Receita total = serviços + planos
      const monthRevenue = aptMonthRevenue + planCashMonth + planPixMonth;
      const lastMonthRevenue = aptLastMonthRevenue + planCashLastMonth + planPixLastMonth;

      const activeClients = isTenantScope || bId
        ? new Set((clientsRes.data || []).map((a: any) => a.user_id)).size
        : (clientsRes as any).count || 0;

      // Calcular novos clientes de forma certeira: clientes que agendaram no período mas nunca antes (com este barbeiro)
      const prevWeekUserIds = new Set((prevWeekAptsRes.data || []).map((a: any) => a.user_id));
      const currentWeekUserIds = new Set((newWeekRes.data || []).map((a: any) => a.user_id));
      const newClientsWeek = Array.from(currentWeekUserIds).filter(id => !prevWeekUserIds.has(id)).length;

      const prevMonthUserIds = new Set((prevMonthAptsRes.data || []).map((a: any) => a.user_id));
      const currentMonthUserIds = new Set((newMonthRes.data || []).map((a: any) => a.user_id));
      const newClientsMonth = Array.from(currentMonthUserIds).filter(id => !prevMonthUserIds.has(id)).length;

      setData({
        todayCount: todayRes.count || 0,
        yesterdayCount: yesterdayRes.count || 0,
        pendingCount: pendingRes.count || 0,
        nextAppointment,
        monthRevenue,
        lastMonthRevenue,
        monthCuts: monthCutsRes.count || 0,
        lastMonthCuts: lastMonthCutsRes.count || 0,
        activeClients,
        newClientsWeek,
        newClientsMonth,

        recentAppointments,
        dailyRevenue: revenueData,
      });
      setLoading(false);
    } catch (error) {
      console.error("Error loading admin dashboard:", error);
      setLoading(false);
    }
  };

  const todayDiff = useMemo(() => data ? data.todayCount - data.yesterdayCount : 0, [data]);
  const revenueGrowth = useMemo(() => {
    if (!data || data.lastMonthRevenue === 0) return 0;
    return Math.round(((data.monthRevenue - data.lastMonthRevenue) / data.lastMonthRevenue) * 100);
  }, [data]);
  const cutsDiff = useMemo(() => data ? data.monthCuts - data.lastMonthCuts : 0, [data]);

  const statusLabels: Record<string, { label: string; color: string }> = {
    pending: { label: "Pendente", color: "text-amber-400" },
    confirmed: { label: "Confirmado", color: "text-emerald-400" },
    completed: { label: "Concluído", color: "text-sky-400" },
    cancelled_by_admin: { label: "Cancelado", color: "text-red-400" },
    cancelled_by_user: { label: "Cancelado", color: "text-red-400" },
    no_show: { label: "Faltou", color: "text-muted-foreground" },
  };

  if (loading) {
    return (
      <div className="space-y-5 p-1">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  if (!data) return null;

  const todayFormatted = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR });

  // ═══════════════════════════════════════
  // MOBILE LAYOUT - Strategic Command Center
  // ═══════════════════════════════════════
  if (isMobile) {
    return (
      <div className="pt-5 pb-6 px-4 space-y-5 animate-fade-in">

        {/* Banner de configuração */}
        <SetupCompletionBanner
          percentage={setupCompletion.percentage}
          steps={setupCompletion.steps}
          loading={setupCompletion.loading}
          variant="compact"
        />

        {/* Header simples */}
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-medium capitalize">
            {todayFormatted}
          </p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-foreground leading-none tabular-nums">
              {data.todayCount}
            </span>
            <span className="text-sm text-muted-foreground">
              agendamento{data.todayCount !== 1 ? "s" : ""} hoje
            </span>
            {todayDiff !== 0 && (
              <span className={cn(
                "inline-flex items-center gap-0.5 text-[11px] font-medium ml-1",
                todayDiff > 0 ? "text-emerald-500" : "text-red-500"
              )}>
                {todayDiff > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {todayDiff > 0 ? "+" : ""}{todayDiff}
              </span>
            )}
        </div>

        {/* Banner moved to bottom */}
        </div>

        {/* Próximo atendimento — compacto */}
        {data.nextAppointment && (
          <div className="flex items-center gap-3 rounded-xl bg-card border border-border px-4 py-3">
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Próximo</span>
              <p className="text-sm font-semibold text-foreground truncate mt-0.5">{data.nextAppointment.clientName}</p>
              <p className="text-xs text-muted-foreground truncate">{data.nextAppointment.serviceName}</p>
            </div>
            <span className="text-base font-bold text-foreground font-mono shrink-0">
              {data.nextAppointment.hora}
            </span>
          </div>
        )}

        {/* Card de confirmações pendentes removido do dashboard */}


        {/* Banners de WhatsApp e Carteira removidos — o PendingSetupModal cuida disso */}

        {/* Performance — 2 métricas compactas */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-2">Resumo do mês</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-card border border-border px-4 py-3">
              <div className="flex items-center gap-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Receita</p>
                <button onClick={() => setRevenueVisible(!revenueVisible)} className="ml-auto p-0.5 rounded-full hover:bg-foreground/[0.06] transition-colors">
                  {revenueVisible ? <Eye className="w-3 h-3 text-muted-foreground" /> : <EyeOff className="w-3 h-3 text-muted-foreground" />}
                </button>
              </div>
              <p className="text-lg font-bold text-foreground tabular-nums mt-0.5">
                {revenueVisible ? `R$ ${data.monthRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "R$ ••••"}
              </p>
              {revenueVisible && revenueGrowth !== 0 && (
                <span className={cn(
                  "inline-flex items-center gap-0.5 text-[10px] font-medium",
                  revenueGrowth > 0 ? "text-emerald-500" : "text-red-500"
                )}>
                  {revenueGrowth > 0 ? "+" : ""}{revenueGrowth}%
                </span>
              )}
            </div>
            <div className="rounded-xl bg-card border border-border px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Cortes</p>
              <p className="text-lg font-bold text-foreground tabular-nums mt-0.5">{data.monthCuts}</p>
              {cutsDiff !== 0 && (
                <span className={cn(
                  "inline-flex items-center gap-0.5 text-[10px] font-medium",
                  cutsDiff > 0 ? "text-emerald-500" : "text-red-500"
                )}>
                  {cutsDiff > 0 ? "+" : ""}{cutsDiff}
                </span>
              )}
            </div>
          </div>
        </div>

        <CampaignPromoBanners basePath={basePath} />

        {/* Atividade recente */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-2">Atividade recente</p>
          <div className="space-y-1">
            {data.recentAppointments.map((apt) => {
              const statusInfo = statusLabels[apt.status] || statusLabels.pending;
              const dotColor = apt.status === "pending" ? "bg-amber-400"
                : apt.status === "confirmed" ? "bg-emerald-400"
                : apt.status === "completed" ? "bg-sky-400"
                : apt.status?.startsWith("cancelled") ? "bg-red-400"
                : "bg-muted-foreground";
              return (
                <div key={apt.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-card transition-colors">
                  <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    <span className="text-[11px] font-semibold text-muted-foreground">
                      {apt.clientName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">{apt.clientName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {apt.serviceName} · {new Date(`${apt.data}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} {apt.hora}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={cn("w-1.5 h-1.5 rounded-full", dotColor)} />
                    <span className="text-[10px] text-muted-foreground font-medium">{statusInfo.label}</span>
                  </div>
                </div>
              );
            })}
            {data.recentAppointments.length === 0 && (
              <div className="text-center py-8">
                <Calendar className="w-6 h-6 text-muted-foreground mx-auto mb-1.5" />
                <p className="text-xs text-muted-foreground">Nenhuma atividade</p>
              </div>
            )}
          </div>
        </div>

        {/* Banner de ativação removido — o PendingSetupModal cuida disso */}
      </div>
    );
  }

  // ═══════════════════════════════════════
  // DESKTOP LAYOUT - Preservado com melhorias
  // ═══════════════════════════════════════
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-[0.2em] font-medium capitalize mb-1">
            {todayFormatted}
          </p>
          <div className="flex items-baseline gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {data.todayCount}
            </h1>
            <span className="text-base text-muted-foreground">
              agendamento{data.todayCount !== 1 ? "s" : ""} hoje
            </span>
            {todayDiff !== 0 && (
              <span className={cn(
                "flex items-center gap-1 text-xs font-semibold",
                todayDiff > 0 ? "text-emerald-400" : "text-red-400"
              )}>
                {todayDiff > 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                {todayDiff > 0 ? "+" : ""}{todayDiff} vs ontem
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Sistema operacional
          </span>
      </div>

      {/* Banner de ativação removido — o PendingSetupModal cuida disso */}
      </div>

      {/* Next + Pending row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.nextAppointment && (
          <div className="rounded-2xl border border-primary/20 bg-primary/[0.06] p-5 space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.2em] text-primary/70 font-semibold">Próximo cliente</p>
              <span className="text-xl font-bold text-primary font-mono">{data.nextAppointment.hora}</span>
            </div>
            <p className="text-base font-semibold text-foreground">{data.nextAppointment.clientName}</p>
            <p className="text-sm text-muted-foreground">{data.nextAppointment.serviceName}</p>
          </div>
        )}
        {/* Card de confirmações pendentes removido do dashboard */}

      </div>

      {/* Performance Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-border/40 bg-card/60 p-5 space-y-2">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium">Receita do Mês</p>
          <p className="text-2xl font-bold text-foreground tracking-tight">
            R$ {data.monthRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
          {revenueGrowth !== 0 && (
            <div className={cn("flex items-center gap-1 text-xs font-semibold", revenueGrowth > 0 ? "text-emerald-400" : "text-red-400")}>
              {revenueGrowth > 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
              <span>{revenueGrowth > 0 ? "+" : ""}{revenueGrowth}% vs mês anterior</span>
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-border/40 bg-card/60 p-5 space-y-2">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium">Cortes do Mês</p>
          <p className="text-2xl font-bold text-foreground tracking-tight">{data.monthCuts}</p>
          {cutsDiff !== 0 && (
            <div className={cn("flex items-center gap-1 text-xs font-semibold", cutsDiff > 0 ? "text-emerald-400" : "text-red-400")}>
              {cutsDiff > 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
              <span>{cutsDiff > 0 ? "+" : ""}{cutsDiff}</span>
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-border/40 bg-card/60 p-5 space-y-2">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium">Clientes Ativos</p>
          <p className="text-2xl font-bold text-foreground tracking-tight">{data.activeClients}</p>
          {data.newClientsWeek > 0 && (
            <div className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>+{data.newClientsWeek} esta semana</span>
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-border/40 bg-card/60 p-5 space-y-2">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium">Novos no Mês</p>
          <p className="text-2xl font-bold text-foreground tracking-tight">{data.newClientsMonth}</p>
          <p className="text-xs text-muted-foreground">novos clientes</p>
        </div>
      </div>

      {/* Revenue Chart - Desktop */}
      <div className="rounded-2xl border border-border/40 bg-card/60 p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">Receita · Últimos 7 dias</p>
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.dailyRevenue}>
              <defs>
                <linearGradient id="adminDesktopGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `R$${v}`} />
              <Tooltip content={<ChartTooltipContent />} />
              <Area type="monotone" dataKey="receita" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#adminDesktopGrad)" dot={false} activeDot={{ r: 4, fill: "hsl(var(--primary))" }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <CampaignPromoBanners basePath={basePath} />

      {/* Recent Appointments - Desktop */}
      <div className="space-y-3">
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">Atividade Recente</p>
        <div className="space-y-2">
          {data.recentAppointments.map((apt) => {
            const statusInfo = statusLabels[apt.status] || statusLabels.pending;
            return (
              <div key={apt.id} className="flex items-center gap-3.5 rounded-xl border border-border/30 bg-card/40 px-5 py-3.5">
                <div className="w-9 h-9 rounded-full bg-secondary/80 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-muted-foreground">
                    {apt.clientName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{apt.clientName}</p>
                  <p className="text-xs text-muted-foreground">
                    {apt.serviceName} · {new Date(`${apt.data}T12:00:00`).toLocaleDateString("pt-BR")} às {apt.hora}
                  </p>
                </div>
                <span className={cn("text-[10px] font-semibold uppercase tracking-wider", statusInfo.color)}>
                  {statusInfo.label}
                </span>
              </div>
            );
          })}
          {data.recentAppointments.length === 0 && (
            <div className="text-center py-8">
              <Calendar className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Nenhuma atividade recente</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
