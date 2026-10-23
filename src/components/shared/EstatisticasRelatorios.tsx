import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useBarberReportData } from "@/hooks/useBarberReportData";
import { brazilDate, monthRevenue, serviceRevenue, revenueComparison, performanceMetrics } from "@/lib/barberReportMetrics";
import { Button } from "@/components/ui/button";
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

  const currentMonthStart = format(startOfMonth(selectedMonth), "yyyy-MM-dd");
  const currentMonthEnd = format(endOfMonth(selectedMonth), "yyyy-MM-dd");
  const prevMonthStart = format(startOfMonth(subMonths(selectedMonth, 1)), "yyyy-MM-dd");
  const prevMonthEnd = format(endOfMonth(subMonths(selectedMonth, 1)), "yyyy-MM-dd");
  const { data: dashboardData, isLoading: loading, isError, error, refetch } = useBarberReportData(barbeiroId, tenantId);

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
  const currentRevenue = monthRevenue(dashboardData, format(selectedMonth, "yyyy-MM"));
  const previousRevenue = monthRevenue(dashboardData, format(subMonths(selectedMonth, 1), "yyyy-MM"));
  const servicesRevCur = currentRevenue.services;
  const plansRevCur = currentRevenue.plans;
  const totalRevenueCur = currentRevenue.total;
  const comparison = revenueComparison(totalRevenueCur, previousRevenue.total);
  const revenueDelta = comparison.delta;
  const revenueGrowthPercent = comparison.percent;

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
  const performance = useMemo(() => performanceMetrics(dashboardData, format(selectedMonth, "yyyy-MM"), brazilDate(new Date())), [dashboardData, selectedMonth]);
  const scoreAnalytics = {
    score: performance.score,
    title: performance.score === null ? "Sem dados" : performance.score >= 80 ? "Excelente" : performance.score >= 60 ? "Em evolução" : "Atenção",
    solidColor: "hsl(var(--foreground))",
    badgeBg: "bg-foreground text-background",
    trackLength: 446.1,
    fillDashoffset: 446.1 * (1 - (performance.score ?? 0) / 100),
  };

  // ═══════════════════════════════════════════════════════
  // CÁLCULO DOS 6 MESES E CURVA SPLINE (IMAGEM 2)
  // ═══════════════════════════════════════════════════════
  const chartPointsData = useMemo(() => {
    const monthRevenues = availableMonths.map(m => monthRevenue(dashboardData, m.key).total);

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
      `📈 *Evolução:* ${(revenueGrowthPercent ?? 0) >= 0 ? (revenueGrowthPercent === null ? "Sem base" : `+${revenueGrowthPercent}%`) : (revenueGrowthPercent === null ? "Sem base" : `${revenueGrowthPercent}%`)}\n\n` +
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
          serviceRevenue(a).toFixed(2),
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
    const result = await refetch();
    if (result.error) toast.error("Não foi possível atualizar os indicadores.");
    else toast.success("Dados sincronizados!");
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
        {isError ? (
          <div className="py-12 space-y-4 text-center">
            <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : "Não foi possível carregar os indicadores."}</p>
            <Button variant="outline" onClick={() => refetch()}>Tentar novamente</Button>
          </div>
        ) : loading ? (
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
                    {scoreAnalytics.score === null ? "—" : `${scoreAnalytics.score} pts`}
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <p className="text-xs text-muted-foreground text-center">Cobertura dos indicadores: {performance.coverage}% · {format(selectedMonth, "MMMM yyyy", { locale: ptBR })}</p>
                <dl className="divide-y divide-border">
                  {performance.factors.map(factor => (
                    <div key={factor.label} className="py-3">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <dt>{factor.label}</dt><dd className="tabular-nums shrink-0">{factor.value === null ? "Sem dados" : `${Math.round(factor.value)} / 100`}</dd>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{factor.detail}</p>
                    </div>
                  ))}
                </dl>
                <p className="text-xs text-muted-foreground">Preço acessível, ocupação da agenda e uso do aplicativo: sem dados suficientes para avaliação.</p>
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
                          {isSel && <div className="w-1.5 h-1.5 rounded-full bg-success" />}
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
                      "inline-flex items-center px-2.5 py-0.5 rounded-full text-background text-[11.5px] font-semibold tabular-nums shadow-xs transition-colors",
                      (revenueGrowthPercent ?? 0) > 0
                        ? "bg-success"
                        : (revenueGrowthPercent ?? 0) < 0
                          ? "bg-destructive"
                          : "bg-muted-foreground/30 text-foreground"
                    )}
                  >
                    {(revenueGrowthPercent ?? 0) > 0 ? (revenueGrowthPercent === null ? "Sem base" : `+${revenueGrowthPercent}%`) : (revenueGrowthPercent === null ? "Sem base" : `${revenueGrowthPercent}%`)}
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
                  <span className="text-[15px] font-semibold text-success tabular-nums mt-0.5 block">
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
            <section className="pt-4 border-t border-border space-y-4">
              <h3 className="text-sm font-semibold">Desempenho semanal</h3>
              {performance.weeks.map(week => <div key={week.week} className="flex justify-between gap-3 text-xs"><span>Semana {week.week}</span><span className="text-muted-foreground tabular-nums">{week.appointments} agendados · {week.completed} concluídos</span></div>)}
              <h3 className="text-sm font-semibold pt-2">Desempenho diário</h3>
              {performance.daily.length === 0 && <p className="text-xs text-muted-foreground">Sem atendimentos no período.</p>}
              {performance.daily.map(day => <div key={day.date} className="flex flex-wrap justify-between gap-2 text-xs"><span>{format(new Date(`${day.date}T12:00:00`), "dd/MM")}</span><span className="text-muted-foreground tabular-nums">{day.appointments} agendados · {day.completed} concluídos · {formatMoney(day.revenue)}</span></div>)}
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
