import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import { getAsaasConfig } from '../_shared/asaas-config.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Edge Function: get-barber-asaas-data
 * 
 * Busca saldo e extrato real da subconta Asaas do barbeiro.
 * Usa a API key individual da subconta (barbeiros_private.asaas_api_key).
 * Para barbeiros sem subconta individual, usa a conta compartilhada configurada.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // ── Auth ──
    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { barbeiro_id } = body;

    // ── Verificar permissão: admin ou dono do barbeiro ──
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const isGlobalAdmin = (roles || []).some(r => r.role === 'admin' || r.role === 'ti');
    const isTenantAdmin = (roles || []).some(r => r.role === 'tenant_admin');

    let targetBarbeiroId = barbeiro_id;

    if (!isGlobalAdmin && !isTenantAdmin) {
      // Barbeiro só pode ver seus próprios dados
      const { data: barbeiro } = await supabase
        .from('barbeiros')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!barbeiro) {
        return new Response(
          JSON.stringify({ error: 'Barbeiro não encontrado' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      targetBarbeiroId = barbeiro.id;
    }

    if (!targetBarbeiroId) {
      return new Response(
        JSON.stringify({ error: 'Barbeiro não informado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Administrador de barbearia só pode consultar barbeiros dos próprios tenants.
    if (isTenantAdmin && !isGlobalAdmin) {
      const [{ data: ownedTenants }, { data: targetBarber }] = await Promise.all([
        supabase.from('tenants').select('id').eq('owner_user_id', user.id),
        supabase.from('barbeiros').select('tenant_id').eq('id', targetBarbeiroId).maybeSingle(),
      ]);
      const ownedTenantIds = new Set((ownedTenants || []).map((tenant) => tenant.id));
      if (!targetBarber?.tenant_id || !ownedTenantIds.has(targetBarber.tenant_id)) {
        return new Response(
          JSON.stringify({ error: 'Sem permissão para consultar este barbeiro' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ── Buscar dados do barbeiro ──
    const { data: barbeiro } = await supabase
      .from('barbeiros')
      .select('id, apelido, asaas_account_id, asaas_wallet_id')
      .eq('id', targetBarbeiroId)
      .single();

    if (!barbeiro) {
      return new Response(
        JSON.stringify({ error: 'Barbeiro não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Determinar API key ──
    let apiKey: string | null = null;
    let isSharedAccount = false;

    if (barbeiro.asaas_account_id) {
      // Subconta: usar API key individual
      const { data: privData } = await supabase
        .from('barbeiros_private')
        .select('asaas_api_key')
        .eq('barbeiro_id', targetBarbeiroId)
        .single();

      apiKey = privData?.asaas_api_key || null;
    }

    // Fallback: conta principal (barbeiro compartilha a conta do admin/dono)
    if (!apiKey) {
      const config = getAsaasConfig();
      apiKey = config?.apiKey || null;
      isSharedAccount = true;
    }

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Chave de API Asaas não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[get-barber-asaas-data] Fetching for barbeiro: ${targetBarbeiroId}, hasSubaccount: ${!!barbeiro.asaas_account_id}, isSharedAccount: ${isSharedAccount}`);

    // ── Resolver base URL ──
    const asaasConfig = getAsaasConfig();
    const asaasBase = asaasConfig?.baseUrl || 'https://api.asaas.com/v3';
    console.log(`[get-barber-asaas-data] Usando PRODUÇÃO: ${asaasBase}`);

    // ── Buscar saldo ──
    const balanceRes = await fetch(`${asaasBase}/finance/balance`, {
      headers: { 'access_token': apiKey, 'Content-Type': 'application/json' },
    });

    let balance = { balance: 0, futureBalance: 0, statistics: { totalPending: 0 } };
    if (balanceRes.ok) {
      balance = await balanceRes.json();
    } else {
      console.error('[get-barber-asaas-data] Balance fetch failed:', balanceRes.status);
    }

    // ── Para contas compartilhadas: calcular saldo individual via DB ──
    // O saldo real no Asaas é o teto — ninguém pode ter mais do que existe na conta
    const asaasRealBalance = Number(balance.balance || 0);

    let individualBalance = {
      available: asaasRealBalance,
      future: Number(balance.futureBalance || 0),
      pending: Number(balance.statistics?.totalPending || 0),
    };

    let transactions: any[] = [];

    if (isSharedAccount) {
      // Conta compartilhada: usar DB para saldo individual e transações
      const { data: saldoData } = await supabase
        .rpc('calcular_saldo_barbeiro', {
          p_user_id: user.id,
          p_barbeiro_id: targetBarbeiroId,
        });

      if (saldoData) {
        const saldo = Array.isArray(saldoData) ? saldoData[0] : saldoData;
        const dbBalance = Number(saldo?.saldo_disponivel || 0);

        // O saldo individual nunca pode exceder o saldo real no Asaas
        // Se o Asaas mostra 0, o barbeiro também vê 0
        const cappedBalance = Math.min(Math.max(dbBalance, 0), Math.max(asaasRealBalance, 0));

        individualBalance = {
          available: cappedBalance,
          future: Number(saldo?.saldo_processando || 0),
          pending: 0,
        };
      }

      // Buscar transações do barbeiro via DB (agendamentos + saques)
      const { data: agendamentos } = await supabase
        .from('agendamentos')
        .select('id, preco, data, hora, payment_method, status, created_at')
        .eq('barbeiro_id', targetBarbeiroId)
        .eq('status', 'completed')
        .in('payment_method', ['pix', 'credit_card', 'debit_card'])
        .order('created_at', { ascending: false })
        .limit(50);

      const { data: taxas } = await supabase
        .from('taxas_gateway')
        .select('metodo_pagamento, taxa_fixa, taxa_percentual')
        .eq('ativo', true);

      const taxaMap = new Map((taxas || []).map((t: any) => [t.metodo_pagamento, t]));

      (agendamentos || []).forEach((a: any) => {
        const taxa = taxaMap.get(a.payment_method || '');
        const fixo = Number(taxa?.taxa_fixa || 0);
        const pct = Number(taxa?.taxa_percentual || 0);
        const liquido = a.preco - fixo - Math.round(a.preco * pct / 100 * 100) / 100;
        const metodo = a.payment_method === 'pix' ? 'Pix' : a.payment_method === 'credit_card' ? 'Crédito' : 'Débito';

        transactions.push({
          id: a.id,
          date: a.data || a.created_at,
          value: a.preco,
          netValue: Math.max(0, liquido),
          fee: fixo + Math.round(a.preco * pct / 100 * 100) / 100,
          balance: null,
          type: 'PAYMENT_RECEIVED',
          description: `Atendimento · ${metodo}`,
          status: 'CONFIRMED',
          paymentId: null,
        });
      });

      // Saques do barbeiro
      const { data: barberUser } = await supabase
        .from('barbeiros')
        .select('user_id')
        .eq('id', targetBarbeiroId)
        .single();

      if (barberUser?.user_id) {
        const { data: saques } = await supabase
          .from('saques')
          .select('id, valor, created_at, status')
          .eq('user_id', barberUser.user_id)
          .order('created_at', { ascending: false })
          .limit(20);

        (saques || []).forEach((s: any) => {
          transactions.push({
            id: s.id,
            date: s.created_at?.split('T')[0] || '',
            value: -Number(s.valor),
            netValue: -Number(s.valor),
            fee: 0,
            balance: null,
            type: 'TRANSFER',
            description: 'Saque · Transferência bancária',
            status: s.status === 'concluido' ? 'CONFIRMED' : 'PENDING',
            paymentId: null,
          });
        });
      }

      // Ordenar por data desc
      transactions.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    } else {
      // Subconta própria: buscar extrato do Asaas
      const statementsUrl = new URL(`${asaasBase}/financialTransactions`);
      statementsUrl.searchParams.append('limit', '50');
      statementsUrl.searchParams.append('order', 'desc');

      const statementsRes = await fetch(statementsUrl.toString(), {
        headers: { 'access_token': apiKey, 'Content-Type': 'application/json' },
      });

      if (statementsRes.ok) {
        const statementsData = await statementsRes.json();
        transactions = (statementsData.data || []).map((t: any) => ({
          id: t.id,
          date: t.date,
          value: t.value,
          netValue: t.netValue,
          fee: t.fee || 0,
          balance: t.balance,
          type: t.type,
          description: t.description || getTransactionDescription(t.type),
          status: t.status,
          paymentId: t.payment?.id || null,
        }));
      } else {
        console.error('[get-barber-asaas-data] Statements fetch failed:', statementsRes.status);

        // Fallback: buscar payments recentes
        const paymentsUrl = new URL(`${asaasBase}/payments`);
        paymentsUrl.searchParams.append('limit', '50');

        const paymentsRes = await fetch(paymentsUrl.toString(), {
          headers: { 'access_token': apiKey, 'Content-Type': 'application/json' },
        });

        if (paymentsRes.ok) {
          const paymentsData = await paymentsRes.json();
          transactions = (paymentsData.data || []).map((p: any) => ({
            id: p.id,
            date: p.paymentDate || p.confirmedDate || p.dateCreated,
            value: p.value,
            netValue: p.netValue,
            fee: (p.value || 0) - (p.netValue || p.value || 0),
            balance: null,
            type: mapPaymentStatus(p.status),
            description: p.description || `Pagamento ${p.billingType || ''}`,
            status: p.status,
            paymentId: p.id,
          }));
        }
      }
    }

    return new Response(
      JSON.stringify({
        balance: individualBalance,
        transactions,
        barbeiro: {
          id: barbeiro.id,
          nome: barbeiro.apelido,
          hasSubaccount: !!barbeiro.asaas_account_id,
          isSharedAccount,
        },
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[get-barber-asaas-data] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/** Mapeia tipos de transação Asaas para descrições legíveis */
function getTransactionDescription(type: string): string {
  const map: Record<string, string> = {
    PAYMENT_RECEIVED: 'Pagamento recebido',
    PAYMENT_FEE: 'Taxa de processamento',
    TRANSFER: 'Transferência bancária',
    TRANSFER_FEE: 'Taxa de transferência',
    REFUND: 'Estorno',
    CHARGEBACK: 'Chargeback',
    RECEIVABLE_ANTICIPATION: 'Antecipação de recebíveis',
    PAYMENT_DUNNING_RECEIVED: 'Recebimento de cobrança',
    BILL_PAYMENT: 'Pagamento de conta',
    INTERNAL_TRANSFER: 'Transferência interna',
    DEPOSIT: 'Depósito',
  };
  return map[type] || type;
}

/** Mapeia status de pagamento Asaas para tipo de transação */
function mapPaymentStatus(status: string): string {
  const map: Record<string, string> = {
    RECEIVED: 'PAYMENT_RECEIVED',
    CONFIRMED: 'PAYMENT_RECEIVED',
    OVERDUE: 'PAYMENT_OVERDUE',
    PENDING: 'PAYMENT_PENDING',
    REFUNDED: 'REFUND',
  };
  return map[status] || status;
}
