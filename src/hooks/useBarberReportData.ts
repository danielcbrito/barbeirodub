import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { brazilDate, type ReportData } from '@/lib/barberReportMetrics';

// Pages are deliberately smaller than PostgREST's default row cap.
export async function readAllPages<T>(load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const result = await load(from, from + 499);
    if (result.error) throw result.error;
    const page = result.data ?? []; rows.push(...page);
    if (page.length < 500) return rows;
  }
}
export function useBarberReportData(barbeiroId?: string | null, tenantId?: string | null, enabled = true) {
  const client = useQueryClient();
  const today = brazilDate(new Date());
  const start = new Date(`${today.slice(0, 7)}-01T12:00:00Z`); start.setUTCMonth(start.getUTCMonth() - 12);
  const first = start.toISOString().slice(0, 10);
  const query = useQuery({
    queryKey: ['barber-report-v2', barbeiroId ?? null, tenantId ?? null, today],
    enabled,
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: true,
    refetchInterval: 300_000,
    queryFn: async (): Promise<ReportData> => {
      let scopeTenant = tenantId;
      if (!barbeiroId && !scopeTenant) {
        const result = await supabase.rpc('get_user_tenant_id');
        if (result.error) throw result.error;
        scopeTenant = result.data;
      }
      if (!barbeiroId && !scopeTenant) throw new Error('Não foi possível identificar a barbearia do relatório.');
      const ids = barbeiroId ? [barbeiroId] : (await readAllPages((from, to) => supabase.from('barbeiros').select('id').eq('tenant_id', scopeTenant ?? '').order('id').range(from, to))).map(b => b.id);
      const empty: ReportData = { allAppointments: [], allCashPlans: [], allPixPlans: [], allReviews: [], activeSubscriptions: [], previousClientIdsSet: new Set() };
      if (!ids.length) return empty;
      const [apts, cash, subs, reviews] = await Promise.all([
        readAllPages((f, t) => supabase.from('agendamentos').select('id, preco, preco_final, status, data, hora, is_free, payment_method, user_id, servico_id, observacoes, servico:servicos(nome)').in('barbeiro_id', ids).gte('data', first).lte('data', today).order('id').range(f, t)),
        readAllPages((f, t) => supabase.from('pagamentos_plano_barbearia').select('id, valor, created_at').in('barbeiro_id', ids).gte('created_at', `${first}T00:00:00-03:00`).order('id').range(f, t)),
        readAllPages((f, t) => supabase.from('assinaturas').select('id, user_id, status').in('barbeiro_id', ids).order('id').range(f, t)),
        readAllPages((f, t) => supabase.from('barbeiro_avaliacoes').select('id, rating, created_at').in('barber_id', ids).gte('created_at', `${first}T00:00:00-03:00`).order('id').range(f, t)),
      ]);
      const pix = [];
      for (let i = 0; i < subs.length; i += 100) {
        pix.push(...await readAllPages((f, t) => supabase.from('pagamentos').select('id, valor, created_at, data_pagamento').in('assinatura_id', subs.slice(i, i + 100).map(s => s.id)).is('agendamento_id', null).eq('status', 'paid').neq('metodo', 'cash').gte('created_at', `${first}T00:00:00-03:00`).order('id').range(f, t)));
      }
      return { allAppointments: apts, allCashPlans: cash, allPixPlans: pix.map(p => ({ ...p, created_at: p.data_pagamento ?? p.created_at })), allReviews: reviews, activeSubscriptions: subs.filter(s => s.status === 'active' || s.status === 'pending_cash'), previousClientIdsSet: new Set(apts.filter(a => a.status === 'completed' && a.data < `${today.slice(0, 7)}-01`).map(a => a.user_id)) };
    },
  });
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => { void client.invalidateQueries({ queryKey: ['barber-report-v2', barbeiroId ?? null, tenantId ?? null] }); }, 500); };
    const channel = supabase.channel(`report-${Math.random().toString(36).slice(2)}`);
    for (const table of ['agendamentos', 'pagamentos_plano_barbearia', 'assinaturas', 'pagamentos', 'barbeiro_avaliacoes']) {
      const field = table === 'barbeiro_avaliacoes' ? 'barber_id' : 'barbeiro_id';
      channel.on('postgres_changes', { event: '*', schema: 'public', table, ...(barbeiroId && table !== 'pagamentos' ? { filter: `${field}=eq.${barbeiroId}` } : {}) }, refresh);
    }
    channel.subscribe();
    return () => { clearTimeout(timer); void supabase.removeChannel(channel); };
  }, [client, barbeiroId, tenantId, enabled]);
  return query;
}