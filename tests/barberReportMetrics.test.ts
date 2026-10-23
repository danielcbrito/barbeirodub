import { describe, test, expect } from 'bun:test';
import { monthRevenue, performanceMetrics, revenueComparison, serviceRevenue, type ReportAppointment, type ReportData } from '../src/lib/barberReportMetrics';
const apt = (overrides: Partial<ReportAppointment> = {}): ReportAppointment => ({ id: '1', data: '2026-10-10', hora: '10:00', status: 'completed', preco: 50, preco_final: null, is_free: false, payment_method: 'cash', user_id: 'client', servico_id: 'service', observacoes: null, servico: null, ...overrides });
const data = (overrides: Partial<ReportData> = {}): ReportData => ({ allAppointments: [], allCashPlans: [], allPixPlans: [], allReviews: [], activeSubscriptions: [], previousClientIdsSet: new Set(), ...overrides });
describe('shared home and report revenue', () => {
  test('does not include confirmed appointments', () => expect(serviceRevenue(apt({ status: 'confirmed' }))).toBe(0));
  test('uses final discounted price even when zero', () => { expect(serviceRevenue(apt({ preco_final: 30 }))).toBe(30); expect(serviceRevenue(apt({ preco_final: 0 }))).toBe(0); });
  test('does not count a plan cut a second time', () => expect(serviceRevenue(apt({ payment_method: 'plano' }))).toBe(0));
  test('does not count free loyalty services', () => expect(serviceRevenue(apt({ is_free: true }))).toBe(0));
  test('home and report consume the same complete receipt sum', () => {
    const rows = data({ allAppointments: [apt()], allCashPlans: [{ id: 'cash', valor: 100, created_at: '2026-10-05T12:00:00Z' }], allPixPlans: [{ id: 'pix', valor: 150, created_at: '2026-10-06T12:00:00Z' }] });
    expect(monthRevenue(rows, '2026-10')).toEqual({ services: 50, plans: 250, total: 300 });
    expect(monthRevenue(rows, '2026-09').total).toBe(0);
  });
  test('never invents a positive comparison without a previous month', () => expect(revenueComparison(2836, 0)).toEqual({ delta: 2836, percent: null }));
  test('same amounts give the same growth in both screens', () => expect(revenueComparison(2836, 2616.8)).toEqual({ delta: 219.2, percent: 8.4 }));
  test('receipt dates use Sao Paulo rather than UTC month', () => expect(monthRevenue(data({ allPixPlans: [{ id: 'p', valor: 100, created_at: '2026-10-01T01:00:00Z' }] }), '2026-09').total).toBe(100));
});
describe('observed performance', () => {
  test('empty account has no invented score or review', () => { const result = performanceMetrics(data(), '2026-10', '2026-10-23'); expect(result.score).toBeNull(); expect(result.averageRating).toBeNull(); expect(result.coverage).toBe(0); });
  test('future appointments do not reduce completion performance', () => {
    const result = performanceMetrics(data({ allAppointments: [apt(), apt({ id: 'future', data: '2026-10-30', status: 'confirmed' })] }), '2026-10', '2026-10-23');
    expect(result.factors[0]?.value).toBe(100); expect(result.daily.length).toBe(1);
  });
  test('uses only actual reviews in selected month', () => {
    const result = performanceMetrics(data({ allReviews: [{ rating: 1, created_at: '2026-09-01T12:00:00Z' }, { rating: 4, created_at: '2026-10-01T12:00:00Z' }] }), '2026-10', '2026-10-23');
    expect(result.averageRating).toBe(4);
  });
});