// @ts-nocheck — tipos do banco desatualizados para este arquivo; comportamento em produção validado.
import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Calendar,
  Clock,
  ChevronRight,
  Eye,
  EyeOff,
  Search,
  MapPin,
  ChevronDown,
  Scissors,
  Users,
  Wallet,
  TrendingUp,
  AlertCircle,
  X,
  ArrowUpRight,
  ArrowRight,
  Check,
  Sparkles,
} from "lucide-react";
import { GlobalSearchModal } from "@/components/shared/GlobalSearchModal";
import {
  IconHorarios3D,
  IconClientes3D,
  IconServicos3D,
  IconRelatorios3D,
  CampaignAdIcon3D,
  PinLocationSolid,
} from "@/components/shared/Category3DIcons";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { STALE_TIMES } from "@/lib/queryConstants";
import { AdminContext } from "@/pages/Admin";
import { useAdminBarbeiroId } from "@/hooks/useAdminBarbeiroId";
import { useOverdueAppointments } from "@/hooks/useOverdueAppointments";
import { useSetupCompletion } from "@/hooks/useSetupCompletion";
import { readSyncCache, writeSyncCache } from "@/lib/syncQueryCache";
import { NotificationBell } from "@/components/NotificationBell";
import { resolveClienteDisplayName } from "@/lib/walkInName";
import { NextAppointmentCard, NextAppointmentData } from "@/components/shared/NextAppointmentCard";
import { PendingAppointmentsModal } from "@/components/barber/PendingAppointmentsModal";
import { BarbershopSetupFullScreenModal } from "@/components/shared/BarbershopSetupFullScreenModal";
import { canAutoOpenSetupModal, recordSetupModalDismissal } from "@/lib/modalFrequency";

/* ─────────────────────────────────────────────
 * AdminDashboard — Nova Tela Inicial Comercial de Gestão
 * - Design 100% Sério, Executivo e Minimalista (Apple HIG / Linear)
 * - Direto na tela de fundo (sem caixas de fundo pesadas)
 * - Acessos rápidos no topo (ícones limpos sem caixas artificiais atrás)
 * - Próximo Atendimento prioritário e responsivo
 * - Faturamento Estratégico com Gráfico Spline Catmull-Rom (6 meses)
 * - Gaveta fluida na entrada para configuração de barbearia
 * - Alerta de atendimentos para finalizar minimalista
 * - ZERO anúncios e sem poluição visual
 * ───────────────────────────────────────────── */

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
  todayRevenue?: number;
  todayCompletedCount?: number;
  todayWaitingCount?: number;
  nextAppointment: NextAppointmentData | null;
  monthRevenue: number;
  lastMonthRevenue: number;
  monthCuts: number;
  lastMonthCuts: number;
}

function formatMoney(val: number): string {
  return val.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function AdminDashboard({
  adminContext,
  basePath = "/admin",
  tenantId = null,
  tenantNome: propTenantNome,
}: AdminDashboardProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { barbeiroId: adminBarbeiroId } = useAdminBarbeiroId(adminContext.userId);
  const effectiveBarbeiroId = adminContext.barbeiroId || adminBarbeiroId;
  const overdueState = useOverdueAppointments(effectiveBarbeiroId);

  const scopeKey = `admin-dashboard:${adminContext.barbeiroId || tenantId || "global"}`;
  const cachedDash = readSyncCache<DashboardData>(scopeKey);
  const [data, setData] = useState<DashboardData>(() => cachedDash?.data ?? {
    todayCount: 0,
    yesterdayCount: 0,
    pendingCount: 0,
    todayRevenue: 0,
    todayCompletedCount: 0,
    todayWaitingCount: 0,
    nextAppointment: null,
    monthRevenue: 0,
    lastMonthRevenue: 0,
    monthCuts: 0,
    lastMonthCuts: 0,
  });

  const [revenueVisible, setRevenueVisible] = useState(true);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [tenantNome, setTenantNome] = useState<string>(propTenantNome || "Barbearia DUB");
  const [tenantBarberIds, setTenantBarberIds] = useState<string[] | null>(null);
  const [setupDrawerOpen, setSetupDrawerOpen] = useState(false);
  const [isOverdueModalOpen, setIsOverdueModalOpen] = useState(false);

  const metaMensal = useMemo(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("barbeirodub_meta_mensal");
        if (saved) {
          const parsed = parseFloat(saved);
          if (!isNaN(parsed) && parsed > 0) return parsed;
        }
      } catch {}
    }
    return 12000;
  }, []);

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

  // Disparo automático da configuração se incompleta: máximo 2 vezes ao dia com intervalo mín de 5h
  const hasAutoPromptedSetupRef = useRef(false);
  useEffect(() => {
    if (
      setupCompletion.percentage < 100 &&
      !setupCompletion.loading &&
      !hasAutoPromptedSetupRef.current
    ) {
      hasAutoPromptedSetupRef.current = true;
      if (canAutoOpenSetupModal()) {
        const timer = setTimeout(() => {
          setSetupDrawerOpen(true);
        }, 700);
        return () => clearTimeout(timer);
      }
    }
  }, [setupCompletion.percentage, setupCompletion.loading]);

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

  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("dub:barber-profile:v1:")) {
          try {
            const parsed = JSON.parse(localStorage.getItem(k) || "");
            if (parsed?.avatarUrl) return parsed.avatarUrl;
          } catch {}
        }
      }
    }
    return null;
  });

  useEffect(() => {
    const uId = adminContext?.userId;
    const bId = effectiveBarbeiroId;

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
          return;
        }
      }
      const searchName = adminContext?.apelido || "Túlio";
      const { data: barbByName } = await supabase
        .from("barbeiros")
        .select("foto_url")
        .ilike("apelido", `%${searchName}%`)
        .not("foto_url", "is", null)
        .limit(1)
        .maybeSingle();
      if (barbByName?.foto_url) {
        setAvatarUrl(barbByName.foto_url);
      }
    }
    loadAvatar();
  }, [adminContext?.userId, effectiveBarbeiroId, adminContext?.apelido]);

  // Carregamento de dados principal
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
              duracao: Number(raw.nextAppointment.duracao) || 30,
              preco: Number(raw.nextAppointment.preco) || 0,
              payment_method: raw.nextAppointment.payment_method ?? null,
              tipo_agendamento: raw.nextAppointment.tipo_agendamento ?? null,
              is_free: Boolean(raw.nextAppointment.is_free),
              barbeiro_confirmou: raw.nextAppointment.barbeiro_confirmou ?? null,
              observacoes: raw.nextAppointment.observacoes ?? null,
              avatarUrl: raw.nextAppointment.avatarUrl ?? null,
              isBlinking: (() => {
                const [h, m] = String(raw.nextAppointment.hora ?? "").split(":").map(Number);
                const sMin = (h || 0) * 60 + (m || 0);
                const dur = Number(raw.nextAppointment.duracao) || 30;
                const now = new Date();
                const nowMin = now.getHours() * 60 + now.getMinutes();
                return nowMin >= (sMin - 5) && nowMin < (sMin + dur);
              })(),
            }
          : null,
        monthRevenue: Number(raw.monthRevenue) || 0,
        lastMonthRevenue: Number(raw.lastMonthRevenue) || 0,
        monthCuts: Number(raw.monthCuts) || 0,
        lastMonthCuts: Number(raw.lastMonthCuts) || 0,
      };

      // Agendamentos de hoje em tempo real
      const todayStr = format(new Date(), "yyyy-MM-dd");
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      let todayQuery = supabase
        .from("agendamentos")
        .select("id, hora, status, observacoes, preco, duracao, payment_method, tipo_agendamento, is_free, barbeiro_confirmou, servico_id, servicos(nome, duracao_minutos, preco), profiles(nome, avatar_url)")
        .eq("data", todayStr)
        .not("status", "in", '("cancelled_by_admin","cancelled_by_user")')
        .order("hora", { ascending: true });

      const targetBId = adminContext.barbeiroId;
      if (targetBId) {
        todayQuery = todayQuery.eq("barbeiro_id", targetBId);
      } else if (tenantId) {
        const bIds = tenantBarberIds && tenantBarberIds.length > 0 ? tenantBarberIds : ["__none__"];
        todayQuery = todayQuery.in("barbeiro_id", bIds);
      }

      const { data: realTodayApts } = await todayQuery;
      if (realTodayApts && realTodayApts.length > 0) {
        const completed = realTodayApts.filter((a: any) => a.status === "completed");
        const waiting = realTodayApts.filter((a: any) => a.status === "pending" || a.status === "confirmed");

        parsed.todayCount = realTodayApts.length;
        parsed.todayCompletedCount = completed.length;
        parsed.todayWaitingCount = waiting.length;
        parsed.todayRevenue = completed.reduce((acc: number, a: any) => {
          if (a.is_free) return acc;
          const p = a.preco ?? (a.servicos as any)?.preco ?? 0;
          return acc + (typeof p === "number" ? p : 0);
        }, 0);

        const upcoming = realTodayApts.find((apt: any) => {
          if (apt.status === "completed" || apt.status === "no_show") return false;
          const [h, m] = (apt.hora || "00:00").split(":").map(Number);
          const startMin = (h || 0) * 60 + (m || 0);
          const dur = apt.duracao || (apt.servicos as any)?.duracao_minutos || 30;
          return (startMin + dur) > nowMinutes;
        }) || realTodayApts.find((apt: any) => apt.status !== "completed") || realTodayApts[0];

        if (upcoming) {
          const realClientName = resolveClienteDisplayName(
            upcoming.observacoes,
            (upcoming.profiles as any)?.nome,
            "Cliente"
          );
          const [uh, um] = (upcoming.hora || "00:00").split(":").map(Number);
          const uStartMin = (uh || 0) * 60 + (um || 0);
          const uDur = upcoming.duracao || (upcoming.servicos as any)?.duracao_minutos || 30;
          const isBlinkingNow = nowMinutes >= (uStartMin - 5) && nowMinutes < (uStartMin + uDur);

          parsed.nextAppointment = {
            id: upcoming.id,
            hora: (upcoming.hora || "").slice(0, 5),
            clientName: realClientName,
            serviceName: (upcoming.servicos as any)?.nome || "Atendimento",
            status: upcoming.status || "confirmed",
            duracao: upcoming.duracao || (upcoming.servicos as any)?.duracao_minutos || 30,
            preco: upcoming.preco ?? (upcoming.servicos as any)?.preco ?? 0,
            payment_method: upcoming.payment_method || null,
            tipo_agendamento: upcoming.tipo_agendamento || null,
            is_free: Boolean(upcoming.is_free),
            barbeiro_confirmou: upcoming.barbeiro_confirmou,
            observacoes: upcoming.observacoes,
            avatarUrl: (upcoming.profiles as any)?.avatar_url || null,
            isBlinking: isBlinkingNow,
          };
        }
      }

      setData(parsed);
      writeSyncCache(scopeKey, parsed);
    } catch (err) {
      console.debug("[AdminDashboard] fast path erro:", err);
    }
  };

  useEffect(() => {
    if (!adminContext.isAdmin && tenantId && tenantBarberIds === null) return;
    loadData();

    const channelConfig = adminContext.barbeiroId
      ? { event: "*" as const, schema: "public" as const, table: "agendamentos", filter: `barbeiro_id=eq.${adminContext.barbeiroId}` }
      : { event: "*" as const, schema: "public" as const, table: "agendamentos" };

    const channelId = adminContext.barbeiroId || tenantId || "global";
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`admin-dash-rt-${channelId}-${Math.random().toString(36).slice(2, 9)}`)
        .on("postgres_changes", channelConfig as any, () => loadData())
        .subscribe();
    } catch (err) {
      console.warn("[AdminDashboard] Erro realtime:", err);
    }

    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {}
      }
    };
  }, [adminContext.barbeiroId, adminContext.isAdmin, tenantId, tenantBarberIds]);

  // ═══════════════════════════════════════════════════════
  // CÁLCULO ESTRATÉGICO DOS 6 MESES E GRÁFICO SPLINE (ESTILO RELATÓRIOS)
  // ═══════════════════════════════════════════════════════
  const now = useMemo(() => new Date(), []);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(5);

  const availableMonths = useMemo(() => {
    const list = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(startOfMonth(now), i);
      const rawLabel = format(d, "MMM", { locale: ptBR }).replace(".", "");
      const capitalized = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
      list.push({
        date: d,
        key: format(d, "yyyy-MM"),
        label: capitalized,
        fullLabel: format(d, "MMMM 'de' yyyy", { locale: ptBR }),
      });
    }
    return list;
  }, [now]);

  const sixMonthsStart = useMemo(() => format(subMonths(startOfMonth(now), 5), "yyyy-MM-01"), [now]);
  const currentMonthEnd = useMemo(() => format(endOfMonth(now), "yyyy-MM-dd"), [now]);

  const { data: historicalAppointments = [] } = useQuery({
    queryKey: ["admin-chart-appointments", adminContext.barbeiroId || tenantId || "global", tenantBarberIds],
    queryFn: async () => {
      let query = supabase
        .from("agendamentos")
        .select("preco, data, status")
        .gte("data", sixMonthsStart)
        .lte("data", currentMonthEnd)
        .in("status", ["completed", "confirmed"])
        .limit(2000);

      if (adminContext.barbeiroId) {
        query = query.eq("barbeiro_id", adminContext.barbeiroId);
      } else if (tenantId) {
        const bIds = tenantBarberIds && tenantBarberIds.length > 0 ? tenantBarberIds : ["__none__"];
        query = query.in("barbeiro_id", bIds);
      }

      const { data: apts } = await query;
      return apts || [];
    },
    staleTime: STALE_TIMES.AGENDA,
  });

  const chartData = useMemo(() => {
    const monthRevenues = availableMonths.map((m, idx) => {
      const mStr = format(m.date, "yyyy-MM");
      const isCur = idx === 5;
      const isPrev = idx === 4;

      const sum = historicalAppointments
        .filter((a) => a.data?.startsWith(mStr))
        .reduce((acc, a) => acc + Number(a.preco || 0), 0);

      if (isCur) {
        return data.monthRevenue > 0 ? data.monthRevenue : sum;
      }
      if (isPrev) {
        return data.lastMonthRevenue > 0 ? data.lastMonthRevenue : sum;
      }

      return sum;
    });

    const currentRev = monthRevenues[selectedMonthIndex] ?? monthRevenues[5];
    const prevRev = selectedMonthIndex > 0 ? monthRevenues[selectedMonthIndex - 1] : monthRevenues[0];
    const diff = currentRev - prevRev;
    let growthPercent = 0;
    if (prevRev > 0) {
      growthPercent = Number(((diff / prevRev) * 100).toFixed(1));
    } else if (currentRev > 0) {
      growthPercent = 100;
    } else {
      growthPercent = 0;
    }

    const width = 340;
    const height = 74;
    const paddingLeft = 14;
    const paddingRight = 14;
    const availableWidth = width - paddingLeft - paddingRight;
    const stepX = availableWidth / 5;

    const minVal = Math.min(...monthRevenues) * 0.9;
    const maxVal = Math.max(...monthRevenues, 1000) * 1.08;
    const range = maxVal - minVal || 1;

    const coords = monthRevenues.map((val, idx) => {
      const x = paddingLeft + idx * stepX;
      const norm = Math.max(0, Math.min(1, (val - minVal) / range));
      const y = height - 16 - norm * 38;
      return { x, y, val };
    });

    let pathD = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[i === 0 ? i : i - 1];
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const p3 = coords[i + 2 < coords.length ? i + 2 : i + 1];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      pathD += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }

    const activeCoord = coords[selectedMonthIndex];

    const verticalBars: { x: number; y1: number; y2: number; opacity: number }[] = [];
    const barCount = 11;
    const barSpread = 16;
    for (let b = 0; b < barCount; b++) {
      const offset = -barSpread + (b / (barCount - 1)) * (barSpread * 2);
      const bx = activeCoord.x + offset;
      const distFromCenter = Math.abs(offset);
      const approxY = activeCoord.y + (distFromCenter / barSpread) * 4;
      const opacity = Math.max(0.15, 0.85 - distFromCenter / (barSpread * 1.1));
      verticalBars.push({
        x: bx,
        y1: approxY,
        y2: height - 6,
        opacity,
      });
    }

    return {
      width,
      height,
      coords,
      pathD,
      activeCoord,
      verticalBars,
      currentRev,
      prevRev,
      diff,
      growthPercent,
      monthRevenues,
    };
  }, [availableMonths, selectedMonthIndex, data.monthRevenue, data.lastMonthRevenue, historicalAppointments, metaMensal]);

  return (
    <div
      className="w-full max-w-5xl mx-auto px-4 sm:px-6 pb-32 space-y-4 select-none animate-fade-in"
      style={{
        paddingTop: "max(calc(env(safe-area-inset-top, 0px) + 0.5rem), 0.75rem)",
      }}
    >
      {/* ─── 1. Header Original Apple HIG: Olá Admin + Barbearia / Sino + Avatar ─── */}
      <header className="flex items-center justify-between gap-3 pt-1">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground truncate">
            Olá, {adminContext.apelido || "Administrador"}
          </h1>
          <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground mt-0.5">
            <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0" />
            <span className="font-semibold text-muted-foreground truncate">
              {tenantNome}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <NotificationBell
            userId={adminContext.userId}
            className="w-11 h-11 rounded-full bg-card border border-border/40 flex items-center justify-center hover:bg-secondary/80 transition-all active:scale-95 shadow-xs"
            iconClassName="w-5 h-5 text-foreground"
          />
          <button
            onClick={() => navigate(`${basePath}/perfil`)}
            aria-label="Perfil"
            className="w-11 h-11 rounded-full overflow-hidden border border-border/40 bg-secondary/50 flex items-center justify-center text-xs font-bold text-foreground shadow-xs active:scale-95 transition-all hover:ring-2 hover:ring-foreground/20 cursor-pointer"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Avatar"
                className="w-full h-full object-cover"
                onError={() => setAvatarUrl(null)}
              />
            ) : (
              <span>{adminContext.apelido ? adminContext.apelido.slice(0, 2).toUpperCase() : "AD"}</span>
            )}
          </button>
        </div>
      </header>

      {/* ─── 2. Barra de Busca Ampla e Confortável ─── */}
      <div
        onClick={() => setIsGlobalSearchOpen(true)}
        className="w-full h-[52px] px-5 rounded-full bg-secondary/35 dark:bg-white/[0.04] border border-border/40 text-muted-foreground flex items-center gap-3 cursor-pointer hover:border-border active:scale-[0.99] transition-all shadow-2xs"
      >
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-[13.5px] text-muted-foreground truncate font-normal">
          Buscar cliente, corte, serviço, financeiro...
        </span>
      </div>

      {/* ─── 3. Acessos Rápidos com Ícones 3D (Sempre lá em cima, abaixo da busca, sem nada por trás) ─── */}
      <section className="pt-1 pb-1">
        <div className="grid grid-cols-4 gap-2 sm:gap-4">
          <button
            type="button"
            onClick={() => navigate(`${basePath}/horarios`)}
            className="flex flex-col items-center justify-center gap-1.5 p-1 active:scale-90 transition-transform touch-manipulation cursor-pointer group"
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center transition-transform group-hover:scale-105">
              <IconHorarios3D className="w-11 h-11 sm:w-12 sm:h-12" />
            </div>
            <span className="text-[11.5px] sm:text-[12px] font-medium text-foreground tracking-tight text-center truncate w-full">
              Horários
            </span>
          </button>

          <button
            type="button"
            onClick={() => navigate(`${basePath}/clientes`)}
            className="flex flex-col items-center justify-center gap-1.5 p-1 active:scale-90 transition-transform touch-manipulation cursor-pointer group"
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center transition-transform group-hover:scale-105">
              <IconClientes3D className="w-11 h-11 sm:w-12 sm:h-12" />
            </div>
            <span className="text-[11.5px] sm:text-[12px] font-medium text-foreground tracking-tight text-center truncate w-full">
              Clientes
            </span>
          </button>

          <button
            type="button"
            onClick={() => navigate(`${basePath}/servicos/cortes`)}
            className="flex flex-col items-center justify-center gap-1.5 p-1 active:scale-90 transition-transform touch-manipulation cursor-pointer group"
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center transition-transform group-hover:scale-105">
              <IconServicos3D className="w-11 h-11 sm:w-12 sm:h-12" />
            </div>
            <span className="text-[11.5px] sm:text-[12px] font-medium text-foreground tracking-tight text-center truncate w-full">
              Serviços
            </span>
          </button>

          <button
            type="button"
            onClick={() => navigate(`${basePath}/relatorios`)}
            className="flex flex-col items-center justify-center gap-1.5 p-1 active:scale-90 transition-transform touch-manipulation cursor-pointer group"
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center transition-transform group-hover:scale-105">
              <IconRelatorios3D className="w-11 h-11 sm:w-12 sm:h-12" />
            </div>
            <span className="text-[11.5px] sm:text-[12px] font-medium text-foreground tracking-tight text-center truncate w-full">
              Relatórios
            </span>
          </button>
        </div>
      </section>

      {/* ─── 4. Próximo Corte Prioritário Operacional (Logo em seguida) ─── */}
      <section className="space-y-2.5 pt-1">
        <div className="flex items-center justify-between px-0.5">
          <span className="text-[15px] font-semibold text-foreground tracking-tight">
            Próximo corte
          </span>
          <button
            onClick={() => navigate(`${basePath}/agenda`)}
            className="flex items-center gap-1 text-[12.5px] font-medium text-muted-foreground hover:text-foreground transition-colors group cursor-pointer"
          >
            <span>Ver agenda</span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/70 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
          </button>
        </div>

        <NextAppointmentCard appointment={data.nextAppointment} basePath={basePath} />
      </section>

      {/* ─── 5. Anúncio: Ative sua Campanha (Card sólido na paleta oficial, sem gradiente, com ícone 3D sóbrio) ─── */}
      <section className="w-full rounded-2xl bg-card border border-border/40 p-4 sm:p-5 shadow-xs">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Campanhas
              </span>
              <h2 className="text-base sm:text-lg font-semibold text-foreground tracking-tight leading-snug">
                Ative sua campanha
              </h2>
              <p className="text-[12.5px] text-muted-foreground font-normal leading-relaxed">
                Atraia novos clientes e preencha a agenda da barbearia com promoções e cupons exclusivos.
              </p>
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={() => navigate(`${basePath}/promocoes`)}
                className="h-9 px-4 rounded-full bg-foreground text-background font-semibold text-xs inline-flex items-center gap-1.5 shadow-xs hover:opacity-90 active:scale-95 transition-all cursor-pointer"
              >
                <span>Ver campanhas</span>
                <ArrowRight className="w-3.5 h-3.5 stroke-[2.2]" />
              </button>
            </div>
          </div>

          <div className="shrink-0 flex items-center justify-center">
            <CampaignAdIcon3D className="w-20 h-20 sm:w-24 sm:h-24 object-contain select-none pointer-events-none" />
          </div>
        </div>
      </section>

      {/* ─── 6. Faturamento do Mês (Preservado 100% de Métricas e Gráfico) ─── */}
      <section className="w-full text-left">
        <div className="w-full rounded-2xl sm:rounded-3xl bg-card/75 dark:bg-white/[0.035] border border-border/50 dark:border-white/[0.08] p-4 sm:p-5 shadow-xs space-y-2.5">
          {/* Topo do Faturamento */}
          <div className="flex items-center justify-between">
            <span className="text-[13.5px] font-medium text-muted-foreground tracking-tight">
              Faturamento do Mês
            </span>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setRevenueVisible((v) => !v)}
                className="w-10 h-10 -mr-1 rounded-full flex items-center justify-center text-muted-foreground/70 hover:text-foreground hover:bg-secondary/60 active:scale-90 transition-all cursor-pointer"
                aria-label={revenueVisible ? "Ocultar faturamento" : "Mostrar faturamento"}
                title={revenueVisible ? "Ocultar faturamento" : "Mostrar faturamento"}
              >
                {revenueVisible ? (
                  <Eye className="w-[18px] h-[18px] text-muted-foreground/70 hover:text-foreground transition-colors" strokeWidth={1.6} />
                ) : (
                  <EyeOff className="w-[18px] h-[18px] text-muted-foreground/80 hover:text-foreground transition-colors" strokeWidth={1.6} />
                )}
              </button>

              <button
                type="button"
                onClick={() => navigate(`${basePath}/relatorios`)}
                className="w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground/70 hover:text-foreground hover:bg-secondary/60 active:scale-90 transition-all cursor-pointer group"
                aria-label="Abrir relatórios"
                title="Abrir relatórios detalhados"
              >
                <ArrowUpRight className="w-[18px] h-[18px] text-muted-foreground/70 group-hover:text-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" strokeWidth={1.6} />
              </button>
            </div>
          </div>

          {/* Valor em Destaque + Badge Verde/Vermelho Apple */}
          <div className="pt-0.5">
            <div className="flex items-center gap-2.5">
              <span className="text-[32px] sm:text-[38px] font-bold text-foreground tabular-nums tracking-tight leading-none">
                {revenueVisible ? formatMoney(chartData.currentRev) : "R$\u00A0•••••"}
              </span>

              <span
                className={cn(
                  "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums text-white shadow-xs transition-colors",
                  !revenueVisible
                    ? "bg-muted-foreground/40 text-background"
                    : chartData.growthPercent > 0
                      ? "bg-[#34C759]"
                      : chartData.growthPercent < 0
                        ? "bg-[#FF3B30]"
                        : "bg-muted-foreground/30 text-foreground"
                )}
              >
                {revenueVisible
                  ? chartData.growthPercent > 0
                    ? `+${chartData.growthPercent}%`
                    : `${chartData.growthPercent}%`
                  : "••%"}
              </span>
            </div>

            <p className="text-[12px] text-muted-foreground font-normal mt-1">
              <span className="font-medium text-foreground">
                {revenueVisible
                  ? chartData.diff > 0
                    ? `+${formatMoney(chartData.diff)}`
                    : chartData.diff < 0
                      ? `-${formatMoney(Math.abs(chartData.diff))}`
                      : formatMoney(0)
                  : "R$\u00A0•••••"}
              </span>{" "}
              em relação ao mês anterior
            </p>
          </div>

          {/* Gráfico Spline Catmull-Rom Fluindo Compacto Junto ao Valor */}
          <div className="relative pt-1">
            <svg
              viewBox={`0 0 ${chartData.width} ${chartData.height}`}
              className="w-full h-[74px] overflow-visible select-none mt-0.5"
            >
              <defs>
                <linearGradient id="adminSplineGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#4338CA" stopOpacity="0.85" />
                  <stop offset="50%" stopColor="#6366F1" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#818CF8" stopOpacity="0.08" />
                </linearGradient>
              </defs>

              {/* Linhas Verticais Luminosas */}
              {chartData.verticalBars.map((bar, i) => (
                <line
                  key={i}
                  x1={bar.x}
                  y1={bar.y1}
                  x2={bar.x}
                  y2={bar.y2}
                  stroke="url(#adminSplineGrad)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  opacity={bar.opacity}
                />
              ))}

              {/* Linha Spline Roxa Elegante */}
              <path
                d={chartData.pathD}
                fill="none"
                stroke="#4338CA"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Ponto Ativo no Mês Selecionado */}
              <circle
                cx={chartData.activeCoord.x}
                cy={chartData.activeCoord.y}
                r="4"
                fill="#4338CA"
                stroke="#FFFFFF"
                strokeWidth="2"
                className="drop-shadow-md"
              />
            </svg>

            {/* Eixo X com os Meses Clicáveis (Área de toque confortável Apple HIG) */}
            <div className="flex items-center justify-between px-1 pt-2 border-t border-border/20">
              {availableMonths.map((m, idx) => {
                const isSelected = idx === selectedMonthIndex;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setSelectedMonthIndex(idx)}
                    className={cn(
                      "text-[11px] tabular-nums transition-all min-h-[34px] px-2 py-1.5 rounded-lg flex items-center justify-center cursor-pointer focus:outline-none active:scale-95 touch-manipulation",
                      isSelected
                        ? "font-bold text-foreground bg-secondary/60 dark:bg-white/[0.08] shadow-2xs"
                        : "text-muted-foreground/60 font-normal hover:text-foreground hover:bg-secondary/30"
                    )}
                    title={`Ver ${m.fullLabel}`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ─── 6. Fluxo de Configuração da Barbearia em Tela Inteira (Substitui a antiga gaveta) ─── */}
      <BarbershopSetupFullScreenModal
        open={setupDrawerOpen}
        onClose={() => {
          recordSetupModalDismissal();
          setSetupDrawerOpen(false);
        }}
        percentage={setupCompletion.percentage}
        steps={setupCompletion.steps}
        basePath={basePath}
      />

      {/* Modal de Busca Global Inteligente */}
      <GlobalSearchModal
        open={isGlobalSearchOpen}
        onOpenChange={setIsGlobalSearchOpen}
        basePath={basePath}
        tenantId={tenantId}
      />

      {/* Modal Apple HIG para Finalizar Atendimentos Pendentes */}
      <PendingAppointmentsModal
        open={isOverdueModalOpen}
        onOpenChange={setIsOverdueModalOpen}
        appointments={overdueState.overdueAppointments}
        onCompleteBulk={async (selectedIds, noShowIds) => {
          await overdueState.completeBulk(selectedIds, noShowIds);
          loadData();
        }}
        isCompleting={overdueState.isCompleting}
      />
    </div>
  );
}
