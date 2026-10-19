import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STALE_TIMES } from "@/lib/queryConstants";
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  addMonths,
  isSameMonth,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Sparkles,
  ChevronRight as ChevronIcon,
  RefreshCw,
  X,
  FileDown,
  MessageCircle,
  Download,
  Target,
  Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* ═══════════════════════════════════════
   Tipos
   ═══════════════════════════════════════ */

interface Props {
  barbeiroId?: string | null;
  tenantId?: string | null;
  isGlobal?: boolean;
  basePath?: string;
}

/* ═══════════════════════════════════════
   Formatadores de Moeda Brasileira (R$)
   ═══════════════════════════════════════ */
function formatMoney(val: number): string {
  return val.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatShortMoney(val: number): string {
  if (val >= 1000) {
    return `R$ ${(val / 1000).toFixed(1).replace(".", ",")}k`;
  }
  return formatMoney(val);
}

/* ═══════════════════════════════════════
   Tela Principal de Relatórios
   Design 100% Minimalista e Fiel à Referência
   ═══════════════════════════════════════ */
export function EstatisticasRelatorios({
  barbeiroId,
  tenantId,
  isGlobal = false,
  basePath,
}: Props) {
  const navigate = useNavigate();
  const now = useMemo(() => new Date(), []);

  // Referência do mês selecionado — padrão: mês atual
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => startOfMonth(now));
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [monthMenuOpen, setMonthMenuOpen] = useState(false);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [tempGoalInput, setTempGoalInput] = useState("");
  const [metaMensal, setMetaMensal] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("barbeirodub_meta_mensal");
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
    } catch {
      // fallback
    }
    return 12000;
  });

  // Janela dos 6 meses encerrando no mês atual
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

  // Resolver IDs de barbeiros do tenant para relatórios globais
  const { data: tenantBarberIds } = useQuery({
    queryKey: ["tenant-barber-ids", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data } = await supabase
        .from("barbeiros")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("ativo", true)
        .is("deleted_at", null);
      return (data || []).map((b) => b.id);
    },
    enabled: isGlobal && !!tenantId,
    staleTime: STALE_TIMES.PERFIL_BARBEIRO,
  });

  // Janela de datas do mês selecionado
  const sixMonthsStart = useMemo(
    () => format(subMonths(startOfMonth(selectedMonth), 5), "yyyy-MM-01"),
    [selectedMonth]
  );
  const currentMonthStart = useMemo(
    () => format(startOfMonth(selectedMonth), "yyyy-MM-dd"),
    [selectedMonth]
  );
  const currentMonthEnd = useMemo(
    () => format(endOfMonth(selectedMonth), "yyyy-MM-dd"),
    [selectedMonth]
  );
  const prevMonthStart = useMemo(
    () => format(startOfMonth(subMonths(selectedMonth, 1)), "yyyy-MM-dd"),
    [selectedMonth]
  );
  const prevMonthEnd = useMemo(
    () => format(endOfMonth(subMonths(selectedMonth, 1)), "yyyy-MM-dd"),
    [selectedMonth]
  );

  const isReady = !(isGlobal && tenantId && tenantBarberIds === undefined);

  // ═══════════════════════════════════════════════════════
  // QUERY PRINCIPAL DE DADOS CONSOLIDADOS
  // ═══════════════════════════════════════════════════════
  const { data: dashboardData, isLoading: loading, refetch } = useQuery({
    queryKey: [
      "relatorios-fintech-dub",
      barbeiroId || null,
      tenantId || null,
      isGlobal,
      format(selectedMonth, "yyyy-MM"),
    ],
    queryFn: async () => {
      const resolvedBarberIds = tenantBarberIds || null;

      // 1. Agendamentos
      let aptsQuery = supabase
        .from("agendamentos")
        .select("id, preco, status, data, hora, is_free, user_id, servico_id, observacoes, servico:servicos(nome)")
        .gte("data", sixMonthsStart)
        .lte("data", currentMonthEnd)
        .limit(10000);

      if (barbeiroId) {
        aptsQuery = aptsQuery.eq("barbeiro_id", barbeiroId);
      } else if (isGlobal && resolvedBarberIds && resolvedBarberIds.length > 0) {
        aptsQuery = aptsQuery.in("barbeiro_id", resolvedBarberIds);
      }

      // 2. Histórico de clientes
      let prevClientsQuery = supabase
        .from("agendamentos")
        .select("user_id")
        .lt("data", currentMonthStart)
        .in("status", ["completed", "confirmed", "pending"])
        .limit(10000);

      if (barbeiroId) {
        prevClientsQuery = prevClientsQuery.eq("barbeiro_id", barbeiroId);
      } else if (isGlobal && resolvedBarberIds && resolvedBarberIds.length > 0) {
        prevClientsQuery = prevClientsQuery.in("barbeiro_id", resolvedBarberIds);
      }

      // 3. Pagamentos de planos em balcão/dinheiro
      let planCashQuery = supabase
        .from("pagamentos_plano_barbearia")
        .select("valor, created_at")
        .gte("created_at", `${sixMonthsStart}T00:00:00`)
        .lte("created_at", `${currentMonthEnd}T23:59:59`);

      if (barbeiroId) {
        planCashQuery = planCashQuery.eq("barbeiro_id", barbeiroId);
      } else if (isGlobal && resolvedBarberIds && resolvedBarberIds.length > 0) {
        planCashQuery = planCashQuery.in("barbeiro_id", resolvedBarberIds);
      }

      // 4. Assinaturas vinculadas para filtro de PIX
      const subsQuery = barbeiroId
        ? supabase.from("assinaturas").select("id").eq("barbeiro_id", barbeiroId)
        : resolvedBarberIds && resolvedBarberIds.length > 0
        ? supabase.from("assinaturas").select("id").in("barbeiro_id", resolvedBarberIds)
        : Promise.resolve({ data: null } as any);

      // 5. Pagamentos de planos via PIX
      const planPixQuery = supabase
        .from("pagamentos")
        .select("valor, assinatura_id, created_at")
        .not("assinatura_id", "is", null)
        .is("agendamento_id", null)
        .eq("status", "paid")
        .gte("created_at", `${sixMonthsStart}T00:00:00`)
        .lte("created_at", `${currentMonthEnd}T23:59:59`);

      // 6. Assinaturas ativas no momento
      let activeSubsQuery = supabase
        .from("assinaturas")
        .select("id, user_id, valor_mensal, status")
        .in("status", ["active", "pending_cash"]);

      if (barbeiroId) {
        activeSubsQuery = activeSubsQuery.eq("barbeiro_id", barbeiroId);
      } else if (resolvedBarberIds && resolvedBarberIds.length > 0) {
        activeSubsQuery = activeSubsQuery.in("barbeiro_id", resolvedBarberIds);
      }

      // 7. Avaliações reais dos clientes
      let reviewsQuery: any = supabase
        .from("barbeiro_avaliacoes")
        .select("rating, created_at")
        .limit(1000);
      if (barbeiroId) {
        reviewsQuery = reviewsQuery.eq("barber_id", barbeiroId);
      } else if (resolvedBarberIds && resolvedBarberIds.length > 0) {
        reviewsQuery = reviewsQuery.in("barber_id", resolvedBarberIds);
      }

      const [
        aptsRes,
        prevClientsRes,
        planCashRes,
        subsRes,
        planPixRes,
        activeSubsRes,
        reviewsRes,
      ] = await Promise.all([
        aptsQuery,
        prevClientsQuery,
        planCashQuery,
        subsQuery,
        planPixQuery,
        activeSubsQuery,
        reviewsQuery.then((r: any) => r).catch(() => ({ data: [] })),
      ]);

      const subIdSet = subsRes?.data
        ? new Set((subsRes.data as any[]).map((s: any) => s.id))
        : null;

      const isScoped = !!barbeiroId || (isGlobal && !!tenantId);
      const allPix = (planPixRes.data || []).filter((p: any) =>
        subIdSet ? subIdSet.has(p.assinatura_id) : isScoped ? false : true
      );

      const allCash = planCashRes.data || [];
      const allAppointments = aptsRes.data || [];
      const allReviews = (reviewsRes?.data as any[]) || [];
      const previousClientIdsSet = new Set(
        (prevClientsRes.data || []).map((c) => c.user_id)
      );

      return {
        allAppointments,
        allCashPlans: allCash,
        allPixPlans: allPix,
        activeSubscriptions: activeSubsRes.data || [],
        allReviews,
        previousClientIdsSet,
      };
    },
    enabled: isReady,
    staleTime: STALE_TIMES.RELATORIOS,
  });

  // Agendamentos do mês selecionado
  const currentMonthAppts = useMemo(() => {
    if (!dashboardData?.allAppointments) return [];
    return dashboardData.allAppointments.filter(
      (a) => a.data >= currentMonthStart && a.data <= currentMonthEnd
    );
  }, [dashboardData?.allAppointments, currentMonthStart, currentMonthEnd]);

  // Agendamentos do mês anterior
  const prevMonthAppts = useMemo(() => {
    if (!dashboardData?.allAppointments) return [];
    return dashboardData.allAppointments.filter(
      (a) => a.data >= prevMonthStart && a.data <= prevMonthEnd
    );
  }, [dashboardData?.allAppointments, prevMonthStart, prevMonthEnd]);

  // ═══════════════════════════════════════════════════════
  // CÁLCULOS: RECEITA & CRESCIMENTO
  // ═══════════════════════════════════════════════════════
  const servicesRevCur = useMemo(() => {
    return currentMonthAppts
      .filter((a) => a.status === "completed")
      .reduce((s, a) => s + Number(a.preco || 0), 0);
  }, [currentMonthAppts]);

  const servicesRevPrev = useMemo(() => {
    return prevMonthAppts
      .filter((a) => a.status === "completed")
      .reduce((s, a) => s + Number(a.preco || 0), 0);
  }, [prevMonthAppts]);

  const plansRevCur = useMemo(() => {
    const cash = (dashboardData?.allCashPlans || [])
      .filter((p) => p.created_at >= `${currentMonthStart}T00:00:00` && p.created_at <= `${currentMonthEnd}T23:59:59`)
      .reduce((s, p) => s + Number(p.valor || 0), 0);

    const pix = (dashboardData?.allPixPlans || [])
      .filter((p) => p.created_at >= `${currentMonthStart}T00:00:00` && p.created_at <= `${currentMonthEnd}T23:59:59`)
      .reduce((s, p) => s + Number(p.valor || 0), 0);

    return cash + pix;
  }, [dashboardData?.allCashPlans, dashboardData?.allPixPlans, currentMonthStart, currentMonthEnd]);

  const plansRevPrev = useMemo(() => {
    const cash = (dashboardData?.allCashPlans || [])
      .filter((p) => p.created_at >= `${prevMonthStart}T00:00:00` && p.created_at <= `${prevMonthEnd}T23:59:59`)
      .reduce((s, p) => s + Number(p.valor || 0), 0);

    const pix = (dashboardData?.allPixPlans || [])
      .filter((p) => p.created_at >= `${prevMonthStart}T00:00:00` && p.created_at <= `${prevMonthEnd}T23:59:59`)
      .reduce((s, p) => s + Number(p.valor || 0), 0);

    return cash + pix;
  }, [dashboardData?.allCashPlans, dashboardData?.allPixPlans, prevMonthStart, prevMonthEnd]);

  const totalRevenueCur = servicesRevCur + plansRevCur;
  const totalRevenuePrev = servicesRevPrev + plansRevPrev;
  const revenueDelta = totalRevenueCur - totalRevenuePrev;
  const revenueGrowthPercent = useMemo(() => {
    if (totalRevenuePrev === 0) return totalRevenueCur > 0 ? 100 : 0;
    const pct = ((totalRevenueCur - totalRevenuePrev) / totalRevenuePrev) * 100;
    return Number(pct.toFixed(1));
  }, [totalRevenueCur, totalRevenuePrev]);

  // ═══════════════════════════════════════════════════════
  // AGENDAMENTOS & TAXAS OPERACIONAIS
  // ═══════════════════════════════════════════════════════
  const totalAppointmentsCount = currentMonthAppts.length;
  const completedApptsCount = useMemo(
    () => currentMonthAppts.filter((a) => a.status === "completed").length,
    [currentMonthAppts]
  );
  const confirmedApptsCount = useMemo(
    () => currentMonthAppts.filter((a) => a.status === "confirmed").length,
    [currentMonthAppts]
  );
  const cancelledApptsCount = useMemo(
    () => currentMonthAppts.filter((a) => a.status?.includes("cancelled")).length,
    [currentMonthAppts]
  );
  const noShowApptsCount = useMemo(
    () => currentMonthAppts.filter((a) => a.status === "no_show").length,
    [currentMonthAppts]
  );

  const completionRate = useMemo(() => {
    if (totalAppointmentsCount === 0) return 0;
    return Math.round((completedApptsCount / totalAppointmentsCount) * 100);
  }, [completedApptsCount, totalAppointmentsCount]);

  const averageTicket = useMemo(() => {
    return completedApptsCount > 0 ? servicesRevCur / completedApptsCount : 0;
  }, [completedApptsCount, servicesRevCur]);

  // ═══════════════════════════════════════════════════════
  // CÁLCULO ESTRATÉGICO DO SCORE DO BARBEIRO (BANCO DE DADOS)
  // Mapeia: Conclusão de Cortes, Avaliações Reais, Evolução e Volume
  // Verde (>= 80): Excelente | Laranja (60 a 79): Muito Bom | Vermelho (< 60): Atenção
  // ═══════════════════════════════════════════════════════
  const scoreAnalytics = useMemo(() => {
    // 1. Taxa de Conclusão de Cortes (até 40 pontos)
    let completionPts = 36;
    if (totalAppointmentsCount > 0) {
      completionPts = Math.min(40, Math.round((completedApptsCount / totalAppointmentsCount) * 40));
    }

    // 2. Avaliações Reais dos Clientes (até 25 pontos)
    const reviews: any[] = (dashboardData as any)?.allReviews || [];
    let ratingPts = 24; // Padrão de entrada para novos barbeiros (~4.8)
    let avgRating = 4.8;
    if (reviews.length > 0) {
      const sum = reviews.reduce((acc: number, r: any) => acc + (Number(r.rating) || 5), 0);
      avgRating = Number((sum / reviews.length).toFixed(1));
      ratingPts = Math.min(25, Math.round((avgRating / 5) * 25));
    }

    // 3. Progresso e Crescimento de Faturamento & Agendamentos (até 20 pontos)
    let growthPts = 16;
    if (revenueGrowthPercent >= 10) growthPts = 20;
    else if (revenueGrowthPercent >= 0) growthPts = 17;
    else if (revenueGrowthPercent >= -10) growthPts = 13;
    else if (revenueGrowthPercent >= -25) growthPts = 9;
    else growthPts = 5;

    // 4. Volume e Consistência Operacional (até 15 pontos)
    let volumePts = 12;
    if (completedApptsCount >= 40) volumePts = 15;
    else if (completedApptsCount >= 20) volumePts = 13;
    else if (completedApptsCount >= 8) volumePts = 11;
    else if (completedApptsCount > 0) volumePts = 9;

    const totalScore = Math.max(0, Math.min(100, completionPts + ratingPts + growthPts + volumePts));

    // Perímetro do semicírculo com R = 142 (π * 142 ≈ 446.1px)
    const trackLength = 446.1;
    const fillDashoffset = trackLength * (1 - totalScore / 100);

    if (totalScore >= 80) {
      return {
        score: totalScore,
        tier: "excelente" as const,
        title: "Excelente!",
        solidColor: "#34C759", // Verde Apple sólido
        badgeBg: "bg-[#34C759] text-white",
        textColor: "text-[#34C759]",
        trackLength,
        fillDashoffset,
      };
    } else if (totalScore >= 60) {
      return {
        score: totalScore,
        tier: "moderado" as const,
        title: "Muito Bom!",
        solidColor: "#FF9500", // Laranja Apple sólido
        badgeBg: "bg-[#FF9500] text-white",
        textColor: "text-[#FF9500]",
        trackLength,
        fillDashoffset,
      };
    } else {
      return {
        score: totalScore,
        tier: "critico" as const,
        title: "Atenção!",
        solidColor: "#FF3B30", // Vermelho Apple sólido
        badgeBg: "bg-[#FF3B30] text-white",
        textColor: "text-[#FF3B30]",
        trackLength,
        fillDashoffset,
      };
    }
  }, [
    completedApptsCount,
    totalAppointmentsCount,
    (dashboardData as any)?.allReviews,
    revenueGrowthPercent,
  ]);

  // ═══════════════════════════════════════════════════════
  // CÁLCULO DOS 6 MESES E CURVA SPLINE (IMAGEM 2)
  // ═══════════════════════════════════════════════════════
  const chartPointsData = useMemo(() => {
    const allApts = dashboardData?.allAppointments || [];
    const allCash = dashboardData?.allCashPlans || [];
    const allPix = dashboardData?.allPixPlans || [];

    const monthRevenues = availableMonths.map((m) => {
      const mStart = format(startOfMonth(m.date), "yyyy-MM-dd");
      const mEnd = format(endOfMonth(m.date), "yyyy-MM-dd");

      const sRev = allApts
        .filter((a) => a.data >= mStart && a.data <= mEnd && a.status === "completed")
        .reduce((s, a) => s + Number(a.preco || 0), 0);

      const cPlan = allCash
        .filter((p) => p.created_at >= `${mStart}T00:00:00` && p.created_at <= `${mEnd}T23:59:59`)
        .reduce((s, p) => s + Number(p.valor || 0), 0);

      const pPlan = allPix
        .filter((p) => p.created_at >= `${mStart}T00:00:00` && p.created_at <= `${mEnd}T23:59:59`)
        .reduce((s, p) => s + Number(p.valor || 0), 0);

      return sRev + cPlan + pPlan;
    });

    const effectiveValues = monthRevenues;

    const width = 340;
    const height = 150;
    const paddingLeft = 20;
    const paddingRight = 28;
    const availableWidth = width - paddingLeft - paddingRight;
    const stepX = availableWidth / 5;

    const minVal = Math.min(...effectiveValues);
    const maxVal = Math.max(...effectiveValues);
    const range = maxVal - minVal || 1;

    const coords = effectiveValues.map((val, idx) => {
      const x = paddingLeft + idx * stepX;
      const norm = (val - minVal) / range;
      const y = 110 - norm * 70;
      return { x, y, val };
    });

    // Curva Bézier Catmull-Rom
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

    // Índice do mês selecionado
    let activeIndex = availableMonths.findIndex((m) => isSameMonth(m.date, selectedMonth));
    if (activeIndex < 0) activeIndex = 5;

    const activeCoord = coords[activeIndex];

    // Barras verticais luminosas
    const verticalBars: { x: number; y1: number; y2: number; opacity: number }[] = [];
    const barCount = 17;
    const barSpread = 22;
    for (let b = 0; b < barCount; b++) {
      const offset = -barSpread + (b / (barCount - 1)) * (barSpread * 2);
      const bx = activeCoord.x + offset;
      const distFromCenter = Math.abs(offset);
      const approxY = activeCoord.y + (distFromCenter / barSpread) * 8;
      const opacity = Math.max(0.2, 0.95 - distFromCenter / (barSpread * 1.1));
      verticalBars.push({
        x: bx,
        y1: approxY,
        y2: 135,
        opacity,
      });
    }

    return {
      width,
      height,
      coords,
      pathD,
      activeCoord,
      activeIndex,
      verticalBars,
      monthRevenues,
    };
  }, [availableMonths, selectedMonth, dashboardData?.allAppointments, dashboardData?.allCashPlans, dashboardData?.allPixPlans]);

  // ═══════════════════════════════════════════════════════
  // AÇÕES: WHATSAPP, PDF, CSV, REFRESH
  // ═══════════════════════════════════════════════════════

  // Compartilhar resumo direto no WhatsApp
  const handleShareWhatsApp = useCallback(() => {
    const mesNome = format(selectedMonth, "MMMM 'de' yyyy", { locale: ptBR });
    const text =
      `💈 *Relatório Barbearia DUB - ${mesNome.toUpperCase()}*\n\n` +
      `💰 *Faturamento Total:* ${formatMoney(totalRevenueCur)}\n` +
      `📈 *Evolução:* ${revenueGrowthPercent >= 0 ? `+${revenueGrowthPercent}%` : `${revenueGrowthPercent}%`}\n\n` +
      `✂️ *Atendimentos:* ${totalAppointmentsCount} no total\n` +
      `✅ *Concluídos:* ${completedApptsCount}\n` +
      `⏱️ *Confirmados:* ${confirmedApptsCount}\n` +
      `❌ *Cancelados / No-show:* ${cancelledApptsCount + noShowApptsCount}\n` +
      `🎯 *Taxa de Conclusão:* ${completionRate}%\n` +
      `💵 *Ticket Médio:* ${formatMoney(averageTicket)}\n\n` +
      `_Sistema Barbearia DUB_`;

    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
    toast.success("Abrindo WhatsApp para compartilhar!");
  }, [
    selectedMonth,
    totalRevenueCur,
    revenueGrowthPercent,
    totalAppointmentsCount,
    completedApptsCount,
    confirmedApptsCount,
    cancelledApptsCount,
    noShowApptsCount,
    completionRate,
    averageTicket,
  ]);

  // Baixar / Imprimir PDF
  const handleDownloadPDF = useCallback(() => {
    toast.info("Preparando relatório em PDF...");
    setTimeout(() => {
      window.print();
    }, 250);
  }, []);

  // Exportar Relatório CSV
  const handleExportCSV = useCallback(() => {
    try {
      const rows = [
        ["ID", "Data", "Hora", "Cliente ID", "Serviço", "Valor", "Status"],
        ...currentMonthAppts.map((a: any) => [
          a.id,
          a.data,
          a.hora || "",
          a.user_id || "",
          a.servico?.nome || "Serviço",
          Number(a.preco || 0).toFixed(2),
          a.status,
        ]),
      ];
      const csvContent =
        "data:text/csv;charset=utf-8," +
        rows.map((e) => e.join(",")).join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute(
        "download",
        `relatorio_dub_${format(selectedMonth, "yyyy_MM")}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Relatório baixado com sucesso!");
    } catch {
      toast.error("Erro ao gerar exportação.");
    }
  }, [currentMonthAppts, selectedMonth]);

  // Atualizar dados do servidor
  const handleRefresh = async () => {
    toast.info("Atualizando dados...");
    await refetch();
    toast.success("Dados sincronizados!");
  };

  // ═══════════════════════════════════════════════════════
  // RENDERIZAÇÃO PRINCIPAL
  // ═══════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-background text-foreground pb-32 w-full select-none">
      {/* ═══ HEADER APPLE HIG: VOLTAR E TÍTULO CENTRAL (SEM OS 3 PONTINHOS) ═══ */}
      <header
        className="sticky top-0 z-30 bg-background/95 backdrop-blur-xl border-b border-border/15 w-full"
        style={{
          paddingTop: "max(var(--app-safe-top, env(safe-area-inset-top, 0px)), 12px)",
          paddingBottom: "12px",
        }}
      >
        <div className="max-w-md mx-auto px-4 flex items-center justify-between">
          {/* Botão Voltar Circular */}
          <button
            type="button"
            onClick={() => {
              if (basePath) navigate(basePath);
              else navigate(-1);
            }}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-card border border-border/30 shadow-xs hover:bg-secondary active:scale-95 transition-all text-foreground cursor-pointer shrink-0"
            aria-label="Voltar"
          >
            <ChevronLeft className="w-5 h-5 stroke-[2]" />
          </button>

          {/* Título Central */}
          <div className="text-center">
            <h1 className="text-[17px] font-semibold tracking-tight text-foreground leading-tight">
              Relatórios
            </h1>
          </div>

          {/* Espaçador invisível para manter o título perfeitamente centrado */}
          <div className="w-10 h-10 shrink-0 pointer-events-none" />
        </div>
      </header>

      {/* ═══ CONTEÚDO PRINCIPAL (100% MINIMALISTA, SEM QUADRADOS PESADOS) ═══ */}
      <main className="max-w-md mx-auto px-4 pt-3 space-y-6 w-full">
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[360px] gap-2.5">
            <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
            <span className="text-[13px] text-muted-foreground">
              Carregando dados estratégicos...
            </span>
          </div>
        ) : (
          <>
            {/* ═════════════════════════════════════════════════════════════
               CARD 1: GAUGE CIRCULAR DINÂMICO DE SCORE (IA / BANCO DE DADOS)
               (Verde = Excelente, Laranja = Muito Bom, Vermelho = Atenção)
               ═════════════════════════════════════════════════════════════ */}
            <section className="w-full relative pt-2 pb-1">
              <div className="relative flex flex-col items-center justify-center w-full">
                {/* SVG do Arco Circular com Amplo Raio e Distância Generosa do Texto */}
                <svg
                  viewBox="0 0 340 215"
                  className="w-full max-w-[340px] mx-auto h-auto select-none overflow-visible"
                >
                  {/* Trilha de fundo suave da barra de score */}
                  <path
                    d="M 28 175 A 142 142 0 0 1 312 175"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="28"
                    strokeLinecap="round"
                    className="text-secondary/40 dark:text-secondary/25"
                  />

                  {/* Barra Dinâmica do Score: Cor Sólida Pura (Verde, Laranja ou Vermelha) */}
                  <path
                    d="M 28 175 A 142 142 0 0 1 312 175"
                    fill="none"
                    stroke={scoreAnalytics.solidColor}
                    strokeWidth="28"
                    strokeLinecap="round"
                    strokeDasharray={scoreAnalytics.trackLength}
                    strokeDashoffset={scoreAnalytics.fillDashoffset}
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>

                {/* Conteúdo Central com Distância Ampla e Arejada da Barra */}
                <div className="absolute inset-x-0 top-[78px] flex flex-col items-center justify-center text-center pointer-events-none">
                  {/* Rótulo: Score */}
                  <span className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider">
                    Score
                  </span>

                  {/* Título de Status Dinâmico */}
                  <span className="text-[32px] sm:text-[36px] font-bold text-foreground tracking-tight leading-none mt-1.5">
                    {scoreAnalytics.title}
                  </span>

                  {/* Badge com Pontuação Real do Score */}
                  <div
                    className={cn(
                      "mt-2.5 inline-flex items-center px-3.5 py-0.5 rounded-full text-[12px] font-semibold tabular-nums shadow-xs",
                      scoreAnalytics.badgeBg
                    )}
                  >
                    {scoreAnalytics.score} pts
                  </div>
                </div>
              </div>

              {/* Pílula de Otimização AI: Em Breve (Translúcida, Minimalista e Desabilitada) */}
              <div className="mt-4">
                <div className="p-3.5 px-4 bg-secondary/30 rounded-full border border-border/25 flex items-center justify-between opacity-60 select-none cursor-default">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-foreground/80 text-background flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4 fill-current" />
                    </div>
                    <span className="text-[12px] font-medium text-foreground/80 truncate">
                      Diagnóstico inteligente com IA
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-foreground/10 text-foreground/70 dark:bg-white/10 dark:text-white/70 shrink-0 ml-2">
                    Em breve
                  </span>
                </div>
              </div>
            </section>

            {/* ═════════════════════════════════════════════════════════════
               CARD 2: FATURAMENTO TOTAL COM GRÁFICO SPLINE E BASES ROXAS
               (100% em Português do Brasil, R$ e navegação ativa de meses)
               ═════════════════════════════════════════════════════════════ */}
            <section className="w-full text-left pt-2">
              {/* Topo: Título + Seletor de Mês */}
              <div className="flex items-center justify-between relative">
                <span className="text-[15px] font-semibold text-foreground">
                  Faturamento Total
                </span>

                <button
                  type="button"
                  onClick={() => setMonthMenuOpen((prev) => !prev)}
                  className="px-3 py-1 rounded-full border border-border/40 text-[12px] font-medium text-foreground bg-secondary/35 hover:bg-secondary/60 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                  title="Selecionar Mês"
                >
                  <span className="capitalize">{format(selectedMonth, "MMM", { locale: ptBR }).replace(".", "")}</span>
                  <ChevronIcon className="w-3.5 h-3.5 rotate-90 text-muted-foreground" />
                </button>

                {/* Dropdown de Seleção de Mês */}
                {monthMenuOpen && (
                  <div className="absolute right-0 top-9 w-44 bg-card border border-border/50 rounded-2xl shadow-xl py-1 z-40 text-left text-[12.5px] animate-in fade-in zoom-in-95 duration-150">
                    {availableMonths.map((m) => {
                      const isSel = isSameMonth(m.date, selectedMonth);
                      return (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => {
                            setSelectedMonth(m.date);
                            setMonthMenuOpen(false);
                          }}
                          className={cn(
                            "w-full px-3.5 py-2 text-left capitalize flex items-center justify-between transition-colors",
                            isSel ? "font-bold text-foreground bg-secondary/70" : "text-muted-foreground hover:bg-secondary"
                          )}
                        >
                          <span>{m.fullLabel}</span>
                          {isSel && <div className="w-1.5 h-1.5 rounded-full bg-[#00C26F]" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Valor Principal + Badge Verde + Subtítulo em Reais */}
              <div className="mt-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="text-[32px] sm:text-[36px] font-bold text-foreground tabular-nums tracking-tight leading-none">
                    {formatMoney(totalRevenueCur)}
                  </span>

                  <span
                    className={cn(
                      "inline-flex items-center px-2.5 py-0.5 rounded-full text-white text-[11.5px] font-semibold tabular-nums shadow-xs transition-colors",
                      revenueGrowthPercent > 0
                        ? "bg-[#00C26F]"
                        : revenueGrowthPercent < 0
                          ? "bg-[#FF3B30]"
                          : "bg-muted-foreground/30 text-foreground"
                    )}
                  >
                    {revenueGrowthPercent > 0 ? `+${revenueGrowthPercent}%` : `${revenueGrowthPercent}%`}
                  </span>
                </div>

                <p className="text-[12px] text-muted-foreground font-normal mt-1">
                  <span className="font-medium text-foreground">
                    {revenueDelta > 0
                      ? `+${formatMoney(revenueDelta)}`
                      : revenueDelta < 0
                        ? `-${formatMoney(Math.abs(revenueDelta))}`
                        : formatMoney(0)}
                  </span>{" "}
                  em relação ao mês anterior
                </p>
              </div>

              {/* Gráfico com Linha Roxa, Base de Linhas Verticais e Tooltip */}
              <div className="relative mt-5 pt-2">
                {/* Tooltip Flutuante estilo Imagem 2 (Protegido contra overflow) */}
                <div
                  className="absolute z-20 pointer-events-none"
                  style={{
                    left: `${(chartPointsData.activeCoord.x / chartPointsData.width) * 100}%`,
                    top: `${(chartPointsData.activeCoord.y / chartPointsData.height) * 100}%`,
                    transform:
                      chartPointsData.activeIndex >= 4
                        ? "translate(-85%, -115%)"
                        : chartPointsData.activeIndex <= 1
                        ? "translate(-15%, -115%)"
                        : "translate(-50%, -115%)",
                  }}
                >
                  <div className="bg-card/95 backdrop-blur-md border border-border/50 shadow-2xl rounded-2xl p-2.5 px-3 min-w-[145px] text-left">
                    <span className="text-[11.5px] font-semibold text-foreground block leading-tight capitalize truncate">
                      {format(selectedMonth, "MMMM 'de' yyyy", { locale: ptBR })}
                    </span>

                    <div className="flex items-center justify-between text-[11px] mt-1.5 gap-2">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="w-2 h-2 rounded-full bg-[#4338CA] shrink-0" />
                        <span>Valor</span>
                      </div>
                      <span className="font-semibold text-foreground tabular-nums whitespace-nowrap">
                        {formatMoney(totalRevenueCur)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] mt-1 gap-2">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="w-2 h-2 rounded-xs rotate-45 border border-muted-foreground/60 shrink-0" />
                        <span>Meta</span>
                      </div>
                      <span className="font-semibold text-foreground tabular-nums whitespace-nowrap">
                        {formatMoney(metaMensal)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* SVG do Gráfico Spline */}
                <svg
                  viewBox={`0 0 ${chartPointsData.width} ${chartPointsData.height}`}
                  className="w-full h-auto overflow-visible select-none"
                >
                  <defs>
                    <linearGradient id="barCombGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#4338CA" stopOpacity="0.9" />
                      <stop offset="50%" stopColor="#6366F1" stopOpacity="0.5" />
                      <stop offset="100%" stopColor="#818CF8" stopOpacity="0.1" />
                    </linearGradient>
                  </defs>

                  {/* Efeito: Base Roxa de Barras Verticais Luminosas */}
                  {chartPointsData.verticalBars.map((bar, i) => (
                    <line
                      key={i}
                      x1={bar.x}
                      y1={bar.y1}
                      x2={bar.x}
                      y2={bar.y2}
                      stroke="url(#barCombGrad)"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      opacity={bar.opacity}
                    />
                  ))}

                  {/* Linha Spline Curva Roxa */}
                  <path
                    d={chartPointsData.pathD}
                    fill="none"
                    stroke="#4338CA"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Ponto Ativo no Mês de Referência */}
                  <circle
                    cx={chartPointsData.activeCoord.x}
                    cy={chartPointsData.activeCoord.y}
                    r="5"
                    fill="#4338CA"
                    stroke="#FFFFFF"
                    strokeWidth="2.5"
                    className="drop-shadow-md"
                  />
                </svg>

                {/* Eixo X com os Meses Clicáveis para Alternância Dinâmica */}
                <div className="flex items-center justify-between px-2 pt-1">
                  {availableMonths.map((m, idx) => {
                    const isSelected = idx === chartPointsData.activeIndex;
                    return (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => setSelectedMonth(m.date)}
                        className={cn(
                          "text-[11.5px] tabular-nums transition-all p-1 cursor-pointer focus:outline-none",
                          isSelected
                            ? "font-bold text-foreground scale-105"
                            : "text-muted-foreground/60 font-normal hover:text-foreground"
                        )}
                        title={`Ver ${m.fullLabel}`}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sub-Card Dividido: Serviços & Plano em Reais (Minimalista e Limpo) */}
              <div className="bg-secondary/35 rounded-2xl p-4 mt-5 border border-border/30 grid grid-cols-2 gap-4">
                {/* Coluna Serviços */}
                <div>
                  <span className="text-[12px] font-medium text-muted-foreground block">
                    Serviços
                  </span>
                  <div className="text-[20px] font-bold text-foreground tabular-nums tracking-tight mt-0.5">
                    {formatMoney(servicesRevCur)}
                  </div>
                </div>

                {/* Coluna Plano */}
                <div>
                  <span className="text-[12px] font-medium text-muted-foreground block">
                    Plano
                  </span>
                  <div className="text-[20px] font-bold text-foreground tabular-nums tracking-tight mt-0.5">
                    {formatMoney(plansRevCur)}
                  </div>
                </div>
              </div>

              {/* Seção "Defina sua meta" (Nativa, bem distanciada de Serviços/Plano) */}
              <div className="w-full mt-12 text-left">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="text-[17px] font-semibold text-foreground tracking-tight">
                      Defina sua meta
                    </h3>
                    {/* Descrição bem espaçada do título */}
                    <p className="text-[13px] text-muted-foreground mt-4 leading-relaxed max-w-[280px]">
                      Defina um objetivo financeiro mensal para acompanhar o progresso das suas metas.
                    </p>
                  </div>
                  {/* Coroa sem nada por trás */}
                  <span className="text-[26px] leading-none shrink-0 select-none pt-0.5" aria-hidden="true">
                    👑
                  </span>
                </div>

                {/* Botão bem distanciado da descrição */}
                <button
                  type="button"
                  onClick={() => {
                    setTempGoalInput(metaMensal ? metaMensal.toString() : "12000");
                    setGoalModalOpen(true);
                  }}
                  className="w-full mt-8 h-12 rounded-xl bg-foreground text-background font-medium text-[14px] flex items-center justify-center gap-1.5 hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer shadow-xs"
                >
                  + Definir Meta
                </button>
              </div>
            </section>

            {/* ═════════════════════════════════════════════════════════════
               CARD 3: CORTES E ATENDIMENTOS (DESEMPENHO OPERACIONAL)
               (Bem distanciado da seção de meta)
               ═════════════════════════════════════════════════════════════ */}
            <section className="w-full text-left mt-14 pt-4 border-t border-border/15">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-[15px] font-semibold text-foreground tracking-tight">
                    Cortes & Atendimentos
                  </h3>
                  <span className="text-[11.5px] text-muted-foreground">
                    Taxa de realização e presença no período
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[16px] font-bold text-foreground tabular-nums">
                    {totalAppointmentsCount}
                  </span>
                  <span className="text-[10.5px] text-muted-foreground block">total</span>
                </div>
              </div>

              {/* Grid dos 4 Status */}
              <div className="grid grid-cols-4 gap-2 pt-3 border-t border-border/20 text-center">
                <div>
                  <span className="text-[10.5px] text-muted-foreground font-medium block">
                    Confirmados
                  </span>
                  <span className="text-[15px] font-semibold text-foreground tabular-nums mt-0.5 block">
                    {confirmedApptsCount}
                  </span>
                </div>

                <div className="border-l border-border/20 pl-1">
                  <span className="text-[10.5px] text-muted-foreground font-medium block">
                    Concluídos
                  </span>
                  <span className="text-[15px] font-semibold text-[#00C26F] tabular-nums mt-0.5 block">
                    {completedApptsCount}
                  </span>
                </div>

                <div className="border-l border-border/20 pl-1">
                  <span className="text-[10.5px] text-muted-foreground font-medium block">
                    Cancelados
                  </span>
                  <span className="text-[15px] font-semibold text-foreground tabular-nums mt-0.5 block">
                    {cancelledApptsCount}
                  </span>
                </div>

                <div className="border-l border-border/20 pl-1">
                  <span className="text-[10.5px] text-muted-foreground font-medium block">
                    No-show
                  </span>
                  <span className="text-[15px] font-semibold text-foreground tabular-nums mt-0.5 block">
                    {noShowApptsCount}
                  </span>
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      {/* ═══ BARRA INFERIOR DE NAVEGAÇÃO + BOTÃO PRETO CIRCULAR DE DOWNLOAD ═══ */}
      <div className="fixed bottom-5 left-0 right-0 z-30 px-4 max-w-md mx-auto flex items-center justify-between pointer-events-none">
        {/* Floating Nav Pill à esquerda com Ações */}
        <div className="pointer-events-auto bg-white/95 dark:bg-card/95 backdrop-blur-xl border border-border/40 rounded-full px-4 py-2 shadow-xl flex items-center gap-4">
          {/* WhatsApp */}
          <button
            type="button"
            onClick={handleShareWhatsApp}
            className="p-1.5 text-muted-foreground hover:text-[#25D366] active:scale-90 transition-all cursor-pointer"
            title="Compartilhar no WhatsApp"
            aria-label="Compartilhar no WhatsApp"
          >
            <MessageCircle className="w-5 h-5 stroke-[2] text-[#25D366]" />
          </button>

          {/* Baixar PDF */}
          <button
            type="button"
            onClick={handleDownloadPDF}
            className="p-1.5 text-muted-foreground hover:text-indigo-500 active:scale-90 transition-all cursor-pointer"
            title="Baixar em PDF"
            aria-label="Baixar em PDF"
          >
            <FileDown className="w-5 h-5 stroke-[2]" />
          </button>

          {/* Atualizar / Sincronizar */}
          <button
            type="button"
            onClick={handleRefresh}
            className="p-1.5 text-muted-foreground hover:text-foreground active:scale-90 transition-all cursor-pointer"
            title="Atualizar Indicadores"
            aria-label="Atualizar Indicadores"
          >
            <RefreshCw className="w-4 h-4 stroke-[2]" />
          </button>
        </div>

        {/* Botão Preto Circular Flutuante à direita (Baixar) */}
        <button
          type="button"
          onClick={handleExportCSV}
          className="pointer-events-auto w-12 h-12 rounded-full bg-black dark:bg-foreground text-white dark:text-background flex items-center justify-center shadow-xl hover:opacity-90 active:scale-90 transition-all cursor-pointer shrink-0"
          title="Baixar Relatório (CSV)"
          aria-label="Baixar Relatório"
        >
          <Download className="w-5 h-5 stroke-[2.2]" />
        </button>
      </div>

      {/* ═══ MODAL RECOMENDAÇÕES INTELIGENTES AI ═══ */}
      {aiModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-md rounded-t-[32px] sm:rounded-[32px] p-6 shadow-2xl border border-border/30 space-y-4 animate-in slide-in-from-bottom duration-200 text-left">
            <div className="flex items-center justify-between pb-2 border-b border-border/20">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <h3 className="text-[16px] font-semibold text-foreground tracking-tight">
                    Diagnóstico Estratégico AI
                  </h3>
                  <span className="text-[11.5px] text-muted-foreground">
                    Insights inteligentes para barbearia
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAiModalOpen(false)}
                className="w-8 h-8 rounded-full bg-secondary/80 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-90 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-[12.5px]">
              <div className="p-3.5 rounded-2xl bg-secondary/35 border border-border/30">
                <span className="font-semibold text-foreground block mb-0.5">
                  1. Otimização de Horários de Pico
                </span>
                <p className="text-muted-foreground leading-relaxed">
                  Quintas, sextas e sábados concentram a maior parte do faturamento. Considere abrir horários de encaixe nesses dias para maximizar sua rentabilidade.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-secondary/35 border border-border/30">
                <span className="font-semibold text-foreground block mb-0.5">
                  2. Elevação do Ticket Médio
                </span>
                <p className="text-muted-foreground leading-relaxed">
                  Oferecer acabamento de barba ou sobrancelha junto ao corte eleva seu faturamento médio por cliente em até 25% com o mesmo tempo de cadeira.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-secondary/35 border border-border/30">
                <span className="font-semibold text-foreground block mb-0.5">
                  3. Planos Recorrentes Dub
                </span>
                <p className="text-muted-foreground leading-relaxed">
                  Clientes cadastrados em planos mensais garantem receita previsível mesmo em semanas de menor movimento na barbearia.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setAiModalOpen(false)}
              className="w-full h-11 rounded-full bg-foreground text-background font-semibold text-[13px] hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* ═══ GAVETA PADRÃO DEFINIR META MENSAL (APPLE HIG / APP STANDARD) ═══ */}
      {goalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={() => setGoalModalOpen(false)} />
          <div className="relative w-full sm:max-w-md rounded-t-[28px] sm:rounded-2xl border border-border/70 dark:border-white/[0.1] bg-card p-5 pb-8 sm:pb-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom duration-200 text-left">
            {/* Handle pill no topo para visual de gaveta nativa */}
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto -mt-1 mb-2 sm:hidden" />

            <div className="flex items-center justify-between pb-2 border-b border-border/20">
              <div className="flex items-center gap-2.5">
                {/* Coroa sem nada por trás */}
                <span className="text-[26px] leading-none shrink-0 select-none" aria-hidden="true">
                  👑
                </span>
                <div>
                  <h3 className="text-[16px] font-semibold text-foreground tracking-tight">
                    Definir Meta Mensal
                  </h3>
                  <span className="text-[11.5px] text-muted-foreground">
                    Objetivo financeiro de faturamento
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGoalModalOpen(false)}
                className="w-8 h-8 rounded-full bg-secondary/80 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-90 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 pt-1">
              <label className="text-[12px] font-medium text-muted-foreground">
                Valor da Meta (R$)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] text-muted-foreground font-medium">
                  R$
                </span>
                <input
                  type="number"
                  step="100"
                  value={tempGoalInput}
                  onChange={(e) => setTempGoalInput(e.target.value)}
                  placeholder="Ex: 12000"
                  className="w-full h-11 pl-11 pr-4 rounded-xl bg-secondary/35 border border-border/40 text-foreground text-[15px] font-semibold tabular-nums focus:outline-none focus:ring-1 focus:ring-foreground transition-all"
                  autoFocus
                />
              </div>
              <span className="text-[11px] text-muted-foreground block">
                Esta meta será exibida no gráfico comparativo de faturamento.
              </span>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setGoalModalOpen(false)}
                className="flex-1 h-11 rounded-full bg-secondary text-foreground font-medium text-[13px] hover:bg-secondary/80 active:scale-[0.98] transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const cleanVal = parseFloat(tempGoalInput);
                  if (!isNaN(cleanVal) && cleanVal > 0) {
                    setMetaMensal(cleanVal);
                    try {
                      localStorage.setItem("barbeirodub_meta_mensal", cleanVal.toString());
                    } catch {}
                    toast.success("Meta mensal atualizada!");
                    setGoalModalOpen(false);
                  } else {
                    toast.error("Por favor, digite um valor válido.");
                  }
                }}
                className="flex-1 h-11 rounded-full bg-foreground text-background font-semibold text-[13px] hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer shadow-xs"
              >
                Salvar Meta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EstatisticasRelatorios;
