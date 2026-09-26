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
  Search,
  Building2,
  MapPin,
  ChevronDown,
  UserX,
} from "lucide-react";
import {
  IconBarbearia3D,
  IconHorarios3D,
  IconClientes3D,
  IconServicos3D,
  PinLocationSolid,
} from "@/components/shared/Category3DIcons";
import { GlobalSearchModal } from "@/components/shared/GlobalSearchModal";
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
import { NotificationBell } from "@/components/NotificationBell";
import { resolveClienteDisplayName } from "@/lib/walkInName";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

interface AdminDashboardProps {
  adminContext: AdminContext;
  basePath?: string;
  tenantId?: string | null;
  tenantNome?: string;
}

interface DashboardData {
  todayCount: number;
  yesterdayCount: number;
  pendingCount: number;
  nextAppointment: { id?: string; hora: string; clientName: string; serviceName: string; status?: string; avatarUrl?: string | null } | null;
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

export function AdminDashboard({ adminContext, basePath = "/admin", tenantId = null, tenantNome: propTenantNome }: AdminDashboardProps) {
  const scopeKey = `admin-dashboard:${adminContext.barbeiroId || tenantId || "global"}`;
  const cachedDash = readSyncCache<DashboardData>(scopeKey);
  const [data, setData] = useState<DashboardData | null>(cachedDash?.data ?? null);
  const [loading, setLoading] = useState(!cachedDash?.data);
  const [showChart, setShowChart] = useState(false);
  const [revenueVisible, setRevenueVisible] = useState(true);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [tenantNome, setTenantNome] = useState<string>(propTenantNome || "Barbearia DUB");
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (propTenantNome) {
      setTenantNome(propTenantNome);
      return;
    }
    const tId = tenantId || adminContext.tenantId;
    if (!tId) return;
    supabase
      .from("tenants")
      .select("nome")
      .eq("id", tId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.nome) setTenantNome(data.nome);
      });
  }, [propTenantNome, tenantId, adminContext.tenantId]);
  const { barbeiroId: adminBarbeiroId } = useAdminBarbeiroId(adminContext.userId);
  const effectiveBarbeiroId = adminContext.barbeiroId || adminBarbeiroId;
  const { isConnected: whatsAppConnected, isLoading: whatsAppLoading } = useWhatsAppStatus(effectiveBarbeiroId);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    const uId = adminContext?.userId;
    const bId = effectiveBarbeiroId;
    if (!uId && !bId) return;

    async function loadAvatar() {
      if (uId) {
        const { data: prof } = await supabase.from("profiles").select("avatar_url").eq("id", uId).maybeSingle();
        if (prof?.avatar_url) {
          setAvatarUrl(prof.avatar_url);
          return;
        }
      }
      if (bId) {
        const { data: barb } = await supabase.from("barbeiros").select("foto_url").eq("id", bId).maybeSingle();
        if (barb?.foto_url) {
          setAvatarUrl(barb.foto_url);
        }
      }
    }
    loadAvatar();
  }, [adminContext?.userId, effectiveBarbeiroId]);

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
              id: raw.nextAppointment.id ? String(raw.nextAppointment.id) : undefined,
              hora: String(raw.nextAppointment.hora ?? ""),
              clientName: String(raw.nextAppointment.clientName ?? "Cliente"),
              serviceName: String(raw.nextAppointment.serviceName ?? "Serviço"),
              status: String(raw.nextAppointment.status ?? "confirmed"),
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

      // Busca agendamento mais próximo de hoje para garantir id e nome real de cliente (ex: encaixe manual / walk-in)
      const todayStr = format(new Date(), "yyyy-MM-dd");
      const nowTimeStr = format(new Date(), "HH:mm");
      let nextAptQuery = supabase
        .from("agendamentos")
        .select("id, hora, status, observacoes, servico_id, servicos(nome), profiles(nome, avatar_url)")
        .eq("data", todayStr)
        .in("status", ["pending", "confirmed"])
        .gte("hora", nowTimeStr)
        .order("hora", { ascending: true })
        .limit(1);

      if (adminContext.barbeiroId) {
        nextAptQuery = nextAptQuery.eq("barbeiro_id", adminContext.barbeiroId);
      } else if (!adminContext.isAdmin && tenantId && tenantBarberIds && tenantBarberIds.length > 0) {
        nextAptQuery = nextAptQuery.in("barbeiro_id", tenantBarberIds);
      }

      const { data: realNextApts } = await nextAptQuery;
      if (realNextApts && realNextApts.length > 0) {
        const apt = realNextApts[0];
        const realClientName = resolveClienteDisplayName(
          apt.observacoes,
          (apt.profiles as any)?.nome,
          "Cliente"
        );
        parsed.nextAppointment = {
          id: apt.id,
          hora: (apt.hora || "").slice(0, 5),
          clientName: realClientName,
          serviceName: (apt.servicos as any)?.nome || "Atendimento",
          status: apt.status || "confirmed",
          avatarUrl: (apt.profiles as any)?.avatar_url || null,
        };
      }

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
        addFilter(supabase.from("agendamentos").select("id, hora, status, observacoes, user_id, servico_id").eq("data", today).in("status", ["pending", "confirmed"]).gte("hora", format(new Date(), "HH:mm")).order("hora", { ascending: true }).limit(1)),
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
        addFilter(supabase.from("agendamentos").select("id, data, hora, status, observacoes, user_id, servico_id").order("data", { ascending: false }).order("hora", { ascending: false }).limit(5)),
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
        const realClientName = resolveClienteDisplayName(
          apt.observacoes,
          pRes.data?.nome,
          "Cliente"
        );
        nextAppointment = {
          id: apt.id,
          hora: (apt.hora || "").slice(0, 5),
          clientName: realClientName,
          serviceName: sRes.data?.nome || "Serviço",
          status: apt.status || "confirmed",
        };
      }

      // Recent with details
      const recentAppointments = await Promise.all(
        (recentRes.data || []).map(async (apt: any) => {
          const [p, s] = await Promise.all([
            supabase.from("profiles").select("nome").eq("id", apt.user_id).single(),
            supabase.from("servicos").select("nome").eq("id", apt.servico_id).single(),
          ]);
          return {
            id: apt.id, data: apt.data, hora: (apt.hora || "").slice(0, 5),
            status: apt.status || "pending",
            clientName: resolveClienteDisplayName(apt.observacoes, p.data?.nome, "Cliente"),
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

  const handleUpdateAppointmentStatus = async (
    appointmentId?: string,
    newStatus?: "completed" | "no_show" | "cancelled_by_admin"
  ) => {
    if (!appointmentId || !newStatus) return;

    try {
      const updates: Record<string, any> = { status: newStatus };
      if (newStatus === "completed") {
        updates.barbeiro_confirmou = true;
      } else if (newStatus === "no_show") {
        updates.barbeiro_confirmou = false;
        updates.ponto_liberado = false;
      }

      const { error } = await supabase
        .from("agendamentos")
        .update(updates)
        .eq("id", appointmentId);

      if (error) throw error;

      if (newStatus === "completed") {
        toast.success("Atendimento concluído com sucesso!");
      } else if (newStatus === "no_show") {
        toast.info("Agendamento marcado como falta.");
      } else if (newStatus === "cancelled_by_admin") {
        toast.success("Agendamento cancelado.");
      }

      loadData();
    } catch (err: any) {
      console.error("Erro ao atualizar status do agendamento:", err);
      toast.error("Não foi possível atualizar o agendamento.");
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

  const todayDate = new Date();
  const dayOfWeek = format(todayDate, "EEEE", { locale: ptBR });
  const dayNumber = format(todayDate, "d");
  const monthName = format(todayDate, "MMMM", { locale: ptBR });
  const formattedDateToday = format(todayDate, "d 'de' MMM, yyyy", { locale: ptBR });
  const todayFormatted = format(todayDate, "EEEE, d 'de' MMMM", { locale: ptBR });

  // ═══════════════════════════════════════
  // MOBILE LAYOUT - Fiel à Referência de Design
  // ═══════════════════════════════════════
  if (isMobile) {
    return (
      <div className="w-full max-w-lg mx-auto space-y-4 pb-32 pt-1 animate-fade-in">
        {/* 1. Header (Hello + Localização / Sino + Avatar) */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground truncate">
              Olá, {adminContext.apelido || "Administrador"}
            </h1>
            <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground mt-0.5">
              <PinLocationSolid className="w-[18px] h-[18px] shrink-0" />
              <span className="font-semibold text-foreground/90 truncate">
                {tenantNome || "Barbearia DUB"}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <NotificationBell
              userId={adminContext.userId}
              className="w-11 h-11 rounded-full bg-white dark:bg-zinc-800 shadow-[0_2px_10px_rgba(0,0,0,0.04)] border border-white/90 dark:border-white/10 flex items-center justify-center hover:bg-zinc-50 transition-all active:scale-95"
              iconClassName="w-5 h-5 text-zinc-900 fill-zinc-900 dark:text-white dark:fill-white"
            />
            <button
              onClick={() => navigate(`${basePath}/perfil`)}
              aria-label="Perfil"
              className="w-11 h-11 rounded-full overflow-hidden border-2 border-white dark:border-white/20 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-foreground shadow-[0_2px_10px_rgba(0,0,0,0.04)] active:scale-95 transition-all hover:ring-2 hover:ring-foreground/20"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span>{adminContext.apelido ? adminContext.apelido.slice(0, 2).toUpperCase() : "AD"}</span>
              )}
            </button>
          </div>
        </div>

        {/* 2. Barra de Busca Arredondada Confortável e Larga (Fiel ao Mockup) */}
        <div
          onClick={() => setIsGlobalSearchOpen(true)}
          className="w-full h-12 px-4 rounded-full bg-white dark:bg-zinc-900 border border-white/90 dark:border-white/10 text-muted-foreground flex items-center gap-3 cursor-pointer hover:border-zinc-300 dark:hover:border-white/20 active:scale-[0.99] transition-all shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
        >
          <Search className="w-5 h-5 text-zinc-900 dark:text-white stroke-[2.2] shrink-0" />
          <span className="text-[13.5px] text-zinc-400 truncate font-normal">
            Buscar cliente, corte, serviço, financeiro...
          </span>
        </div>

        {/* 3. Grid Acesso Rápido — 4 Itens (Barbearia, Horários, Clientes, Serviços) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <button
            onClick={() => navigate(`${basePath}/dados-empresa`)}
            className="flex items-center gap-3 p-3 rounded-[20px] bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-[0_2px_10px_rgba(0,0,0,0.03)] hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700 active:scale-[0.98] transition-all group min-h-[64px]"
          >
            <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <IconBarbearia3D className="w-7 h-7" />
            </div>
            <span className="text-[13.5px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight leading-tight truncate">
              Barbearia
            </span>
          </button>

          <button
            onClick={() => navigate(`${basePath}/horarios`)}
            className="flex items-center gap-3 p-3 rounded-[20px] bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-[0_2px_10px_rgba(0,0,0,0.03)] hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700 active:scale-[0.98] transition-all group min-h-[64px]"
          >
            <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <IconHorarios3D className="w-7 h-7" />
            </div>
            <span className="text-[13.5px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight leading-tight truncate">
              Horários
            </span>
          </button>

          <button
            onClick={() => navigate(`${basePath}/clientes`)}
            className="flex items-center gap-3 p-3 rounded-[20px] bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-[0_2px_10px_rgba(0,0,0,0.03)] hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700 active:scale-[0.98] transition-all group min-h-[64px]"
          >
            <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <IconClientes3D className="w-7 h-7" />
            </div>
            <span className="text-[13.5px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight leading-tight truncate">
              Clientes
            </span>
          </button>

          <button
            onClick={() => navigate(`${basePath}/servicos/cortes`)}
            className="flex items-center gap-3 p-3 rounded-[20px] bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-[0_2px_10px_rgba(0,0,0,0.03)] hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700 active:scale-[0.98] transition-all group min-h-[64px]"
          >
            <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <IconServicos3D className="w-7 h-7" />
            </div>
            <span className="text-[13.5px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight leading-tight truncate">
              Serviços
            </span>
          </button>
        </div>

        {/* 4. Próximo Atendimento: Minimalista, Estratégico com Título e Status Padrão */}
        <div>
          <div className="flex items-center justify-between px-1 mb-2">
            <span className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">
              Próximo corte
            </span>
            <button
              onClick={() => navigate(`${basePath}/agenda`)}
              className="flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground hover:text-foreground transition-colors group"
            >
              <span>Ver agenda</span>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/70 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
            </button>
          </div>
          {data.nextAppointment ? (
            <div
              onClick={() => {
                if (data.nextAppointment?.id) {
                  navigate(`${basePath}/agendamento/${data.nextAppointment.id}`);
                } else {
                  navigate(`${basePath}/agenda`);
                }
              }}
              className="w-full rounded-2xl border border-border/60 dark:border-white/[0.08] bg-card p-3.5 sm:p-4 flex items-center gap-3.5 shadow-xs hover:border-border active:scale-[0.99] transition-all cursor-pointer"
            >
              {/* Horário minimalista e limpo */}
              <div className="w-[54px] h-[54px] rounded-xl bg-secondary/70 dark:bg-secondary/50 border border-border/50 flex flex-col items-center justify-center shrink-0">
                <span className="text-[16px] font-bold font-mono text-foreground leading-tight tracking-tight">
                  {data.nextAppointment.hora}
                </span>
                <span className="text-[9.5px] font-semibold text-muted-foreground uppercase tracking-wider leading-none mt-0.5">
                  Hoje
                </span>
              </div>

              {/* Nome do cliente (sem ícone verde) e corte com status */}
              <div className="min-w-0 flex-1">
                <p className="text-[15px] sm:text-[15.5px] font-bold text-foreground truncate tracking-tight">
                  {data.nextAppointment.clientName || "Cliente"}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                  <span className="text-[12.5px] text-muted-foreground truncate">
                    {data.nextAppointment.serviceName || "Atendimento"}
                  </span>
                  <span className="text-muted-foreground/30">•</span>
                  <span className="text-[11.5px] font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                    {data.nextAppointment.status === "completed"
                      ? "Concluído"
                      : data.nextAppointment.status === "confirmed"
                      ? "Agendado"
                      : "Pendente"}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div
              onClick={() => navigate(`${basePath}/agenda`)}
              className="w-full rounded-2xl border border-border/60 dark:border-white/[0.08] bg-card p-4 sm:p-4.5 flex items-center gap-3.5 shadow-xs hover:border-border active:scale-[0.99] transition-all cursor-pointer"
            >
              <div className="w-[52px] h-[52px] rounded-xl bg-secondary/80 dark:bg-secondary/60 border border-border/50 flex items-center justify-center shrink-0">
                <Calendar className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-foreground truncate">
                  Sem agendamentos nas próximas horas
                </p>
                <p className="text-[12px] text-muted-foreground truncate mt-0.5">
                  Toque para abrir a agenda do dia
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 5. Card Faturamento 100% Sério e Minimalista (Com cor apenas nas letras) */}
        <div
          onClick={() => navigate(`${basePath}/financeiro`)}
          className="w-full rounded-2xl border border-border/60 dark:border-white/[0.08] bg-card p-4 sm:p-4.5 shadow-xs hover:border-border transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-medium text-muted-foreground">
              Faturamento do mês
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setRevenueVisible((v) => !v);
              }}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
              aria-label={revenueVisible ? "Ocultar receita" : "Mostrar receita"}
            >
              {revenueVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex items-baseline gap-2.5 mt-2 flex-wrap">
            <span className="text-2xl sm:text-3xl font-black tracking-tight text-foreground tabular-nums">
              {revenueVisible
                ? `R$ ${(data?.monthRevenue ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                : "R$\u00A0••••"}
            </span>
            {revenueVisible && revenueGrowth !== 0 && (
              <span
                className={cn(
                  "text-[12.5px] font-semibold tabular-nums",
                  revenueGrowth > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                )}
              >
                {revenueGrowth > 0 ? `+${revenueGrowth}%` : `${revenueGrowth}%`} vs mês anterior
              </span>
            )}
          </div>
        </div>

        {/* Banner de configuração */}
        <SetupCompletionBanner
          percentage={setupCompletion.percentage}
          steps={setupCompletion.steps}
          loading={setupCompletion.loading}
          variant="compact"
        />

        {/* Campanhas Hero - Modelo Limpo e Moderno */}
        <CampaignPromoBanners basePath={basePath} tenantId={tenantId || adminContext.tenantId} />

        {/* Modal de Busca Global Inteligente no Mobile */}
        <GlobalSearchModal
          open={isGlobalSearchOpen}
          onOpenChange={setIsGlobalSearchOpen}
          basePath={basePath}
          tenantId={tenantId}
        />
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

      <CampaignPromoBanners basePath={basePath} tenantId={tenantId || adminContext.tenantId} />

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

      {/* Modal de Busca Global Inteligente */}
      <GlobalSearchModal
        open={isGlobalSearchOpen}
        onOpenChange={setIsGlobalSearchOpen}
        basePath={basePath}
        tenantId={tenantId}
      />
    </div>
  );
}
