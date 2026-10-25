import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronDown, Calendar, Clock, DollarSign, CheckCircle2, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { type ReportAppointment, serviceRevenue } from "@/lib/barberReportMetrics";

interface Props {
  monthDate: Date;
  weeks: { week: number; appointments: number; completed: number; revenue: number; elapsed: number }[];
  daily: { date: string; appointments: number; completed: number; revenue: number }[];
  appointments: ReportAppointment[];
  totalRevenue: number;
  totalAppointments: number;
  completedAppointments: number;
  completionRate: number;
  onBack: () => void;
}

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

function getStatusBadge(status?: string | null): { label: string; badge: string } {
  if (!status) return { label: "Pendente", badge: "bg-secondary text-muted-foreground border-border/30" };
  if (status === "completed") {
    return { label: "Concluído", badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" };
  }
  if (status === "confirmed") {
    return { label: "Confirmado", badge: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30" };
  }
  if (status === "no_show") {
    return { label: "No-show", badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" };
  }
  if (status.includes("cancelled")) {
    return { label: "Cancelado", badge: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30" };
  }
  return { label: status, badge: "bg-secondary text-muted-foreground border-border/30" };
}

export function DesempenhoDetalhadoView({
  monthDate,
  weeks,
  daily,
  appointments,
  totalRevenue,
  totalAppointments,
  completedAppointments,
  completionRate,
  onBack,
}: Props) {
  const [activeTab, setActiveTab] = useState<"semanal" | "diario">("semanal");
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => new Set());

  const toggleDay = (dateStr: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-24 w-full select-none animate-in fade-in duration-200">
      {/* HEADER NATIVO COM VOLTAR */}
      <header
        className="sticky top-0 z-30 bg-background/95 backdrop-blur-xl border-b border-border/15 w-full"
        style={{
          paddingTop: "max(var(--app-safe-top, env(safe-area-inset-top, 0px)), 12px)",
          paddingBottom: "12px",
        }}
      >
        <div className="max-w-2xl sm:max-w-3xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-card border border-border/30 shadow-xs hover:bg-secondary active:scale-95 transition-all text-foreground cursor-pointer shrink-0"
            aria-label="Voltar para relatórios"
          >
            <ChevronLeft className="w-5 h-5 stroke-[2]" />
          </button>

          <div className="text-center">
            <h1 className="text-[17px] font-semibold tracking-tight text-foreground leading-tight">
              Desempenho
            </h1>
            <span className="text-[11.5px] text-muted-foreground capitalize">
              {format(monthDate, "MMMM 'de' yyyy", { locale: ptBR })}
            </span>
          </div>

          <div className="w-10 h-10 shrink-0 pointer-events-none" />
        </div>
      </header>

      <main className="max-w-2xl sm:max-w-3xl mx-auto px-4 sm:px-6 pt-4 space-y-5 w-full text-left">
        {/* CARDS RESUMO / KPI */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
          <div className="p-3 sm:p-4 rounded-2xl bg-secondary/35 border border-border/30 text-left">
            <span className="text-[11px] sm:text-xs text-muted-foreground font-medium block">Agendados</span>
            <span className="text-[18px] sm:text-[22px] font-bold text-foreground tabular-nums mt-0.5 block">{totalAppointments}</span>
          </div>

          <div className="p-3 sm:p-4 rounded-2xl bg-secondary/35 border border-border/30 text-left">
            <span className="text-[11px] sm:text-xs text-muted-foreground font-medium block">Concluídos</span>
            <span className="text-[18px] sm:text-[22px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5 block">{completedAppointments}</span>
            <span className="text-[10px] sm:text-[11px] text-muted-foreground tabular-nums block">{completionRate}% taxa</span>
          </div>

          <div className="p-3 sm:p-4 rounded-2xl bg-secondary/35 border border-border/30 text-left">
            <span className="text-[11px] sm:text-xs text-muted-foreground font-medium block">Faturamento</span>
            <span className="text-[15px] sm:text-[20px] font-bold text-foreground tabular-nums mt-0.5 block truncate">{formatShortMoney(totalRevenue)}</span>
          </div>
        </div>

        {/* SELECTOR SEGMENTADO DE ABAS */}
        <div className="grid grid-cols-2 p-1 bg-secondary/40 rounded-xl border border-border/30 text-[13px] font-medium">
          <button
            type="button"
            onClick={() => setActiveTab("semanal")}
            className={cn(
              "py-1.5 rounded-lg transition-all cursor-pointer text-center",
              activeTab === "semanal"
                ? "bg-card text-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Semanal ({weeks.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("diario")}
            className={cn(
              "py-1.5 rounded-lg transition-all cursor-pointer text-center",
              activeTab === "diario"
                ? "bg-card text-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Diário ({daily.length})
          </button>
        </div>

        {/* ABA: DESEMPENHO SEMANAL */}
        {activeTab === "semanal" && (
          <div className="space-y-3 animate-in fade-in duration-150">
            {weeks.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                Nenhum dado semanal disponível para este mês.
              </div>
            ) : (
              weeks.map((week) => {
                const rate = week.appointments > 0 ? Math.round((week.completed / week.appointments) * 100) : 0;
                return (
                  <div key={week.week} className="p-4 rounded-2xl bg-secondary/25 border border-border/30 space-y-2.5 shadow-xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[14px] font-semibold text-foreground">Semana {week.week}</span>
                        <span className="text-[11.5px] text-muted-foreground block mt-0.5">
                          {week.appointments} agendados · {week.completed} concluídos
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[14px] font-bold text-foreground tabular-nums block">
                          {formatMoney(week.revenue)}
                        </span>
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold tabular-nums mt-0.5",
                          rate >= 80
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : rate >= 60
                              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                              : "bg-muted text-muted-foreground"
                        )}>
                          {rate}% realizado
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-secondary/60 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          rate >= 80 ? "bg-emerald-500" : rate >= 60 ? "bg-amber-500" : "bg-rose-500"
                        )}
                        style={{ width: `${rate}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ABA: DESEMPENHO DIÁRIO */}
        {activeTab === "diario" && (
          <div className="space-y-2.5 animate-in fade-in duration-150">
            {daily.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                Nenhum atendimento registrado neste mês.
              </div>
            ) : (
              daily.map((day) => {
                const dayAppts = appointments.filter((a) => a.data === day.date);
                const isExpanded = expandedDays.has(day.date);
                const dObj = new Date(`${day.date}T12:00:00`);
                const formattedDate = format(dObj, "EEEE, dd 'de' MMMM", { locale: ptBR });
                const capitalizedDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
                const dayRate = day.appointments > 0 ? Math.round((day.completed / day.appointments) * 100) : 0;

                return (
                  <div key={day.date} className="rounded-2xl bg-secondary/25 border border-border/30 overflow-hidden transition-all shadow-xs">
                    <button
                      type="button"
                      onClick={() => toggleDay(day.date)}
                      className="w-full p-3.5 flex items-center justify-between gap-3 text-left hover:bg-secondary/40 transition-colors cursor-pointer"
                    >
                      <div className="min-w-0">
                        <span className="text-[13.5px] font-semibold text-foreground block truncate">
                          {capitalizedDate}
                        </span>
                        <span className="text-[11.5px] text-muted-foreground block mt-0.5">
                          {day.appointments} agendados · {day.completed} concluídos
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5 shrink-0">
                        <div className="text-right">
                          <span className="text-[13px] font-bold text-foreground tabular-nums block">
                            {formatMoney(day.revenue)}
                          </span>
                          <span className={cn(
                            "text-[10.5px] font-medium block tabular-nums",
                            dayRate >= 80
                              ? "text-emerald-600 dark:text-emerald-400"
                              : dayRate >= 60
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-muted-foreground"
                          )}>
                            {dayRate}% taxa
                          </span>
                        </div>
                        <div className="w-6 h-6 rounded-full bg-secondary/60 flex items-center justify-center text-muted-foreground">
                          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", isExpanded && "rotate-180")} />
                        </div>
                      </div>
                    </button>

                    {/* Detalhamento de Agendamentos do Dia */}
                    {isExpanded && (
                      <div className="px-3 pb-3 pt-1 border-t border-border/20 space-y-1.5 animate-in fade-in duration-150">
                        {dayAppts.length === 0 ? (
                          <p className="text-[11.5px] text-muted-foreground py-2 text-center">Nenhum agendamento com detalhes para este dia.</p>
                        ) : (
                          dayAppts.map((appt) => {
                            const st = getStatusBadge(appt.status);
                            const rev = serviceRevenue(appt) || Number(appt.preco_final ?? appt.preco ?? 0);
                            return (
                              <div key={appt.id} className="p-2.5 rounded-xl bg-card border border-border/25 flex items-center justify-between gap-2.5 text-[12px]">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-semibold text-foreground tabular-nums shrink-0">{appt.hora ? appt.hora.slice(0, 5) : "--:--"}</span>
                                  <span className="text-muted-foreground truncate">{appt.servico?.nome || "Corte / Barba"}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className={cn("px-2 py-0.5 rounded-full text-[10.5px] font-medium border", st.badge)}>
                                    {st.label}
                                  </span>
                                  <span className="font-semibold text-foreground tabular-nums">
                                    {formatMoney(rev)}
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default DesempenhoDetalhadoView;
