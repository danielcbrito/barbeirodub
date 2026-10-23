export interface ReportAppointment {
  id: string; data: string; hora: string; status: string; preco: number;
  preco_final: number | null; is_free: boolean | null; payment_method: string | null;
  user_id: string; servico_id: string; observacoes: string | null;
  servico: { nome: string } | null;
}
export interface ReportPayment { id: string; valor: number; created_at: string; }
export interface ReportReview { rating: number; created_at: string; }
export interface ReportData {
  allAppointments: ReportAppointment[]; allCashPlans: ReportPayment[];
  allPixPlans: ReportPayment[]; allReviews: ReportReview[];
  activeSubscriptions: { id: string; user_id: string; status: string | null }[];
  previousClientIdsSet: Set<string>;
}
export function serviceRevenue(a: ReportAppointment): number {
  if (a.status !== 'completed' || a.is_free || a.payment_method === 'plano' || a.payment_method === 'fidelidade') return 0;
  return Number(a.preco_final ?? a.preco ?? 0);
}
export function monthRevenue(data: ReportData | undefined, month: string) {
  const services = (data?.allAppointments ?? []).filter(a => a.data.startsWith(month)).reduce((s, a) => s + serviceRevenue(a), 0);
  const sum = (rows: ReportPayment[]) => rows.filter(p => brazilDate(p.created_at).startsWith(month)).reduce((s, p) => s + Number(p.valor), 0);
  const plans = sum(data?.allCashPlans ?? []) + sum(data?.allPixPlans ?? []);
  return { services: Math.round(services * 100) / 100, plans: Math.round(plans * 100) / 100, total: Math.round((services + plans) * 100) / 100 };
}
export function revenueComparison(current: number, previous: number) {
  return { delta: Math.round((current - previous) * 100) / 100, percent: previous > 0 ? Number(((current - previous) / previous * 100).toFixed(1)) : null };
}
export function brazilDate(value: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
const clamp = (n: number) => Math.max(0, Math.min(100, n));
export function performanceMetrics(data: ReportData | undefined, month: string, today: string) {
  const all = data?.allAppointments ?? [];
  const current = all.filter(a => a.data.startsWith(month) && a.data <= today && a.status !== 'excluido');
  const completed = current.filter(a => a.status === 'completed');
  const resolved = current.filter(a => ['completed', 'no_show', 'cancelled_by_user', 'cancelled_by_admin'].includes(a.status));
  const reviews = (data?.allReviews ?? []).filter(r => brazilDate(r.created_at).startsWith(month) && r.rating >= 1 && r.rating <= 5);
  const averageRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;
  const clients = new Set(completed.map(a => a.user_id));
  const previousClients = new Set(all.filter(a => a.data < `${month}-01` && a.status === 'completed').map(a => a.user_id));
  const returning = [...clients].filter(id => previousClients.has(id)).length;
  const previousMonth = new Date(`${month}-15T12:00:00Z`); previousMonth.setUTCMonth(previousMonth.getUTCMonth() - 1);
  const previousKey = previousMonth.toISOString().slice(0, 7);
  const elapsedDay = month === today.slice(0, 7) ? Number(today.slice(8)) : new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  const prevCompleted = all.filter(a => a.data.startsWith(previousKey) && Number(a.data.slice(8)) <= elapsedDay && a.status === 'completed').length;
  const daily = new Map<string, { date: string; appointments: number; completed: number; revenue: number }>();
  for (const a of current) {
    const entry = daily.get(a.data) ?? { date: a.data, appointments: 0, completed: 0, revenue: 0 };
    entry.appointments++; entry.completed += a.status === 'completed' ? 1 : 0; entry.revenue += serviceRevenue(a); daily.set(a.data, entry);
  }
  const weeks = Array.from({ length: 5 }, (_, i) => ({ week: i + 1, appointments: 0, completed: 0, revenue: 0, elapsed: Math.max(0, Math.min(7, elapsedDay - i * 7)) }));
  for (const d of daily.values()) { const w = weeks[Math.floor((Number(d.date.slice(8)) - 1) / 7)]; if (w) { w.appointments += d.appointments; w.completed += d.completed; w.revenue += d.revenue; } }
  const observedWeeks = weeks.filter(w => w.elapsed === 7);
  const factors: { label: string; weight: number; value: number | null; detail: string }[] = [
    { label: 'Realização dos atendimentos', weight: 25, value: resolved.length ? completed.length / resolved.length * 100 : null, detail: `${completed.length} concluídos / ${resolved.length} encerrados` },
    { label: 'Satisfação dos clientes', weight: 25, value: averageRating === null ? null : (averageRating - 1) / 4 * 100, detail: averageRating === null ? 'Sem avaliações no período' : `${averageRating.toFixed(1)} / 5 · ${reviews.length} avaliações` },
    { label: 'Clientes que retornam', weight: 20, value: clients.size && previousClients.size ? returning / clients.size * 100 : null, detail: `${returning} retornos / ${clients.size} clientes · histórico observado` },
    { label: 'Evolução dos atendimentos', weight: 15, value: prevCompleted ? clamp(50 + (completed.length / prevCompleted - 1) * 50) : null, detail: `${completed.length} vs ${prevCompleted} · mesmos dias decorridos` },
    { label: 'Consistência semanal', weight: 10, value: observedWeeks.length >= 2 && observedWeeks.some(w => w.completed > 0) ? Math.min(...observedWeeks.map(w => w.completed)) / Math.max(...observedWeeks.map(w => w.completed)) * 100 : null, detail: `${observedWeeks.length} semanas completas observadas` },
    { label: 'Evolução mensal da receita', weight: 5, value: null, detail: 'Sem base anterior comparável' },
  ];
  const rev = (key: string) => {
    const filtered = data ? { ...data, allAppointments: all.filter(a => Number(a.data.slice(8)) <= elapsedDay), allCashPlans: data.allCashPlans.filter(p => Number(brazilDate(p.created_at).slice(8)) <= elapsedDay), allPixPlans: data.allPixPlans.filter(p => Number(brazilDate(p.created_at).slice(8)) <= elapsedDay) } : undefined;
    return monthRevenue(filtered, key).total;
  };
  const prevRevenue = rev(previousKey); const growth = factors[5];
  if (growth && prevRevenue > 0) { growth.value = clamp(50 + (rev(month) / prevRevenue - 1) * 50); growth.detail = 'Mesmos dias decorridos do mês anterior'; }
  const measured = factors.filter(f => f.value !== null);
  const coverage = measured.reduce((s, f) => s + f.weight, 0);
  const score = completed.length && coverage ? Math.round(measured.reduce((s, f) => s + (f.value ?? 0) * f.weight, 0) / coverage) : null;
  return { score, coverage, factors, daily: [...daily.values()].sort((a, b) => b.date.localeCompare(a.date)), weeks: weeks.filter(w => w.elapsed > 0), averageRating };
}