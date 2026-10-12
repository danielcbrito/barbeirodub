import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  ChevronRight,
  Eye,
  EyeOff,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { useBarberDashboard, type DashboardData } from "@/hooks/useBarberDashboard";
import { useSetupCompletion } from "@/hooks/useSetupCompletion";
import { useIsMobile } from "@/hooks/use-mobile";
import type { BarberContext } from "@/pages/Barbeiro";

import { CreateBankBanner } from "./CreateBankBanner";
import { SetupCompletionBanner } from "./SetupCompletionBanner";
import { CampaignPromoBanners } from "@/components/admin/CampaignPromoBanners";

/* ─────────────────────────────────────────────
 * BarberDashboard — tela inicial do barbeiro.
 * Renderização cache-first (0ms), zero skeleton.
 * ───────────────────────────────────────────── */

interface BarberDashboardProps {
  barberContext: BarberContext;
  basePath?: string;
  isTenantAdmin?: boolean;
}

const STATUS_META: Record<string, { label: string; dot: string }> = {
  pending:            { label: "Pendente",   dot: "bg-amber-400" },
  confirmed:          { label: "Confirmado", dot: "bg-emerald-400" },
  completed:          { label: "Concluído",  dot: "bg-sky-400" },
  cancelled_by_admin: { label: "Cancelado",  dot: "bg-red-400" },
  cancelled_by_user:  { label: "Cancelado",  dot: "bg-red-400" },
  no_show:            { label: "Faltou",     dot: "bg-muted-foreground" },
};

const statusOf = (s: string) => STATUS_META[s] ?? STATUS_META.pending;

const formatBRL = (n: number) =>
  `R$\u00A0${n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const formatShortDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

const EMPTY_DASHBOARD: DashboardData = {
  todayCount: 0,
  yesterdayCount: 0,
  pendingCount: 0,
  nextAppointment: null,
  monthRevenue: 0,
  lastMonthRevenue: 0,
  monthCuts: 0,
  lastMonthCuts: 0,
  recentAppointments: [],
};

export function BarberDashboard({
  barberContext,
  basePath = "/barbeiro",
}: BarberDashboardProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const { data: dashboardData } = useBarberDashboard(barberContext.barbeiroId);
  // Nunca renderiza em branco: se a query falhar, mantém a última estrutura conhecida.
  const data = dashboardData ?? EMPTY_DASHBOARD;

  const [revenueVisible, setRevenueVisible] = useState(true);

  const setup = useSetupCompletion({
    userId: barberContext.userId,
    barbeiroId: barberContext.barbeiroId,
    basePath,
    tenantId: barberContext.tenantId,
    excludeSteps: ["whatsapp", "carteira"],
  });

  /* Realtime — invalida cache quando agendamentos mudam */
  useEffect(() => {
    const channel = supabase
      .channel(`barber-dash-realtime-${barberContext.barbeiroId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agendamentos",
          filter: `barbeiro_id=eq.${barberContext.barbeiroId}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: QUERY_KEYS.barbeiro.dashboard(barberContext.barbeiroId),
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [barberContext.barbeiroId, queryClient]);

  const todayDiff = useMemo(
    () => (data ? data.todayCount - data.yesterdayCount : 0),
    [data],
  );
  const revenueGrowth = useMemo(() => {
    if (!data || data.lastMonthRevenue === 0) return 0;
    return Math.round(((data.monthRevenue - data.lastMonthRevenue) / data.lastMonthRevenue) * 100);
  }, [data]);
  const cutsDiff = useMemo(
    () => (data ? data.monthCuts - data.lastMonthCuts : 0),
    [data],
  );

  

  const todayLabel = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR });

  /* ─── Blocos reutilizáveis ─── */

  const HeaderToday = ({ compact }: { compact: boolean }) => (
    <div>
      <p
        className={cn(
          "text-muted-foreground uppercase font-medium capitalize",
          compact ? "text-[11px] tracking-widest" : "text-xs tracking-[0.2em] mb-1",
        )}
      >
        {todayLabel}
      </p>
      <div className={cn("flex items-baseline gap-2", compact ? "mt-1" : "gap-3")}>
        <span
          className={cn(
            "font-bold text-foreground leading-none tabular-nums",
            compact ? "text-2xl" : "text-3xl tracking-tight",
          )}
        >
          {data.todayCount}
        </span>
        <span className="text-sm text-muted-foreground">
          agendamento{data.todayCount !== 1 ? "s" : ""} hoje
        </span>
        {todayDiff !== 0 && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium ml-1",
              compact ? "text-[11px]" : "text-xs",
              todayDiff > 0 ? "text-emerald-500" : "text-red-500",
            )}
          >
            {todayDiff > 0 ? (
              <ArrowUpRight className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />
            ) : (
              <ArrowDownRight className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />
            )}
            {todayDiff > 0 ? "+" : ""}
            {todayDiff}
            {!compact && " vs ontem"}
          </span>
        )}
      </div>
    </div>
  );

  const NextAppointment = () =>
    data.nextAppointment ? (
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl bg-card border border-border",
          isMobile ? "px-4 py-3" : "gap-4 rounded-2xl px-6 py-4",
        )}
      >
        {!isMobile && <div className="w-1 self-stretch rounded-full bg-primary shrink-0" />}
        <div className="flex flex-col min-w-0 flex-1">
          <span
            className={cn(
              "uppercase tracking-widest text-muted-foreground",
              isMobile ? "text-[10px] font-medium" : "text-[10px] font-bold",
            )}
          >
            {isMobile ? "Próximo" : "Próximo atendimento"}
          </span>
          <p
            className={cn(
              "text-foreground truncate mt-0.5",
              isMobile ? "text-sm font-semibold" : "text-sm font-bold",
            )}
          >
            {data.nextAppointment.clientName}
          </p>
          <p
            className={cn(
              "truncate",
              isMobile ? "text-xs text-muted-foreground" : "text-xs font-medium text-foreground/60",
            )}
          >
            {data.nextAppointment.serviceName}
          </p>
        </div>
        <span
          className={cn(
            "font-mono shrink-0 tabular-nums text-foreground",
            isMobile ? "text-base font-bold" : "text-xl font-black",
          )}
        >
          {data.nextAppointment.hora}
        </span>
      </div>
    ) : null;

  // Card de confirmações pendentes removido do dashboard (não exibir "pendente").
  const PendingButton = () => null;


  const MonthSummary = () => (
    <div>
      <p
        className={cn(
          "uppercase tracking-widest text-muted-foreground",
          isMobile ? "text-[10px] font-medium mb-2" : "text-[10px] font-bold mb-3",
        )}
      >
        Resumo do mês
      </p>
      <div className={cn("grid grid-cols-2", isMobile ? "gap-3" : "gap-4")}>
        {/* Receita */}
        <div
          className={cn(
            "bg-card border border-border",
            isMobile ? "rounded-xl px-4 py-3" : "rounded-2xl px-6 py-4",
          )}
        >
          <div className="flex items-center gap-1.5">
            {!isMobile && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
            <p
              className={cn(
                "uppercase text-muted-foreground",
                isMobile
                  ? "text-[10px] tracking-wider font-medium"
                  : "text-[10px] tracking-wider font-bold",
              )}
            >
              Receita
            </p>
            <button
              onClick={() => setRevenueVisible((v) => !v)}
              className="ml-auto p-0.5 rounded-full hover:bg-foreground/[0.06] transition-colors"
              aria-label={revenueVisible ? "Ocultar receita" : "Mostrar receita"}
            >
              {revenueVisible ? (
                <Eye className={cn(isMobile ? "w-3 h-3" : "w-3.5 h-3.5", "text-muted-foreground")} />
              ) : (
                <EyeOff className={cn(isMobile ? "w-3 h-3" : "w-3.5 h-3.5", "text-muted-foreground")} />
              )}
            </button>
          </div>
          <p
            className={cn(
              "text-foreground tabular-nums",
              isMobile ? "text-lg font-bold mt-0.5" : "text-2xl font-black leading-none",
            )}
          >
            {revenueVisible ? formatBRL(data.monthRevenue) : "R$\u00A0••••"}
          </p>
          {revenueVisible && revenueGrowth !== 0 && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium",
                isMobile
                  ? "text-[10px]"
                  : "text-[10px] font-bold mt-1 px-1.5 py-0.5 rounded-full",
                revenueGrowth > 0
                  ? isMobile
                    ? "text-emerald-500"
                    : "bg-emerald-500/15 text-emerald-400"
                  : isMobile
                  ? "text-red-500"
                  : "bg-red-500/15 text-red-400",
              )}
            >
              {revenueGrowth > 0 ? "+" : ""}
              {revenueGrowth}%
            </span>
          )}
        </div>

        {/* Cortes */}
        <div
          className={cn(
            "bg-card border border-border",
            isMobile ? "rounded-xl px-4 py-3" : "rounded-2xl px-6 py-4",
          )}
        >
          <div className="flex items-center gap-1.5">
            {!isMobile && <div className="w-1.5 h-1.5 rounded-full bg-gold" />}
            <p
              className={cn(
                "uppercase text-muted-foreground",
                isMobile
                  ? "text-[10px] tracking-wider font-medium"
                  : "text-[10px] tracking-wider font-bold",
              )}
            >
              Cortes
            </p>
          </div>
          <p
            className={cn(
              "text-foreground tabular-nums",
              isMobile ? "text-lg font-bold mt-0.5" : "text-2xl font-black leading-none",
            )}
          >
            {data.monthCuts}
          </p>
          {cutsDiff !== 0 && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium",
                isMobile
                  ? "text-[10px]"
                  : "text-[10px] font-bold mt-1 px-1.5 py-0.5 rounded-full",
                cutsDiff > 0
                  ? isMobile
                    ? "text-emerald-500"
                    : "bg-emerald-500/15 text-emerald-400"
                  : isMobile
                  ? "text-red-500"
                  : "bg-red-500/15 text-red-400",
              )}
            >
              {cutsDiff > 0 ? "+" : ""}
              {cutsDiff}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  const RecentActivity = () => {
    const empty = data.recentAppointments.length === 0;
    return (
      <div>
        <p
          className={cn(
            "uppercase tracking-widest text-muted-foreground",
            isMobile ? "text-[10px] font-medium mb-2" : "text-[10px] font-bold mb-3",
          )}
        >
          Atividade recente
        </p>
        <div
          className={cn(
            isMobile
              ? "space-y-1"
              : "rounded-2xl border border-border overflow-hidden divide-y divide-border/60 bg-card",
          )}
        >
          {data.recentAppointments.map((apt) => {
            const meta = statusOf(apt.status);
            return (
              <div
                key={apt.id}
                className={cn(
                  "flex items-center gap-3 transition-colors",
                  isMobile
                    ? "px-3 py-2.5 rounded-lg hover:bg-card"
                    : "px-4 py-3 hover:bg-foreground/[0.03]",
                )}
              >
                <div
                  className={cn(
                    "rounded-full flex items-center justify-center shrink-0",
                    isMobile
                      ? "w-7 h-7 bg-secondary"
                      : "w-8 h-8 bg-primary/15 border border-primary/25",
                  )}
                >
                  <span
                    className={cn(
                      "font-semibold",
                      isMobile ? "text-[11px] text-muted-foreground" : "text-[12px] font-bold text-primary",
                    )}
                  >
                    {apt.clientName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      "text-foreground truncate",
                      isMobile ? "text-[13px] font-medium" : "text-[13px] font-semibold",
                    )}
                  >
                    {apt.clientName}
                  </p>
                  <p
                    className={cn(
                      "truncate",
                      isMobile
                        ? "text-[11px] text-muted-foreground"
                        : "text-[11px] font-medium text-foreground/55",
                    )}
                  >
                    {apt.serviceName} · {formatShortDate(apt.data)} {isMobile ? "" : "às "}
                    {apt.hora}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={cn(
                      "rounded-full",
                      isMobile ? "w-1.5 h-1.5" : "w-2 h-2",
                      meta.dot,
                    )}
                  />
                  <span
                    className={cn(
                      "font-semibold",
                      isMobile
                        ? "text-[10px] text-muted-foreground font-medium"
                        : "text-[10px] text-foreground/60",
                    )}
                  >
                    {meta.label}
                  </span>
                </div>
              </div>
            );
          })}

          {empty && (
            <div className="flex flex-col items-center text-center py-12">
              <Calendar className="w-7 h-7 text-muted-foreground/30 mb-3" strokeWidth={1.5} />
              <p className="text-[15px] font-semibold text-muted-foreground">
                Nenhuma atividade recente.
              </p>
              <p className="text-[13px] text-muted-foreground/60 mt-1.5 max-w-[280px]">
                Seus agendamentos concluídos aparecerão aqui automaticamente.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  };

  /* ─── Layout ─── */

  if (isMobile) {
    return (
      <div className="pt-5 pb-6 px-4 space-y-5">
        <SetupCompletionBanner
          percentage={setup.percentage}
          steps={setup.steps}
          loading={setup.loading}
          variant="compact"
        />
        <HeaderToday compact />
        <NextAppointment />
        <PendingButton />
        <MonthSummary />
        <CampaignPromoBanners basePath={basePath} />
        <RecentActivity />
        <div className="pb-2">
          <CreateBankBanner barbeiroId={barberContext.barbeiroId} basePath={basePath} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <SetupCompletionBanner
        percentage={setup.percentage}
        steps={setup.steps}
        loading={setup.loading}
        variant="compact"
      />
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <HeaderToday compact={false} />
      </div>
      <CreateBankBanner barbeiroId={barberContext.barbeiroId} basePath={basePath} />
      <NextAppointment />
      <PendingButton />
      <MonthSummary />
      <CampaignPromoBanners basePath={basePath} />
      <RecentActivity />
    </div>
  );
}
