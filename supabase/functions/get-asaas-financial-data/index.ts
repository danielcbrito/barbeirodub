import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AsaasBalance {
  balance: number;
  futureBalance: number;
  pendingBalance: number;
}

interface AsaasFinancialStats {
  balance: AsaasBalance;
  payments: {
    totalReceived: number;
    totalCreated: number;
    totalPaid: number;
    totalOverdue: number;
    totalRefunded: number;
  };
  fees: {
    totalFees: number;
    pixFees: number;
    creditCardFees: number;
    boletoFees: number;
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify authentication (use anon key + forward Authorization header)
    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
    if (!authHeader) {
      console.log('[get-asaas-financial-data] Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      console.log('[get-asaas-financial-data] Auth error:', authError?.message || 'No user');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[get-asaas-financial-data] User authenticated:', user.id);

    // Verify role: admin, tenant_admin, or barber
    const { data: allRoles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const allowedRoles = ['admin', 'tenant_admin', 'barber'];
    const hasAccess = (allRoles || []).some(r => allowedRoles.includes(r.role));

    if (!hasAccess) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const asaasApiKey = Deno.env.get('ASAAS_API_KEY');
    if (!asaasApiKey) {
      return new Response(
        JSON.stringify({ error: 'Asaas API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { dateFrom, dateTo } = await req.json();

    console.log('Fetching Asaas financial data from', dateFrom, 'to', dateTo);

    // Fetch balance (PRODUCTION)
    const balanceResponse = await fetch('https://api.asaas.com/v3/finance/balance', {
      headers: {
        'access_token': asaasApiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!balanceResponse.ok) {
      throw new Error(`Asaas balance API error: ${balanceResponse.statusText}`);
    }

    const balanceData = await balanceResponse.json();

    // Fetch payments with filters
    const paymentsUrl = new URL('https://api.asaas.com/v3/payments');
    if (dateFrom) paymentsUrl.searchParams.append('dateCreated[ge]', dateFrom);
    if (dateTo) paymentsUrl.searchParams.append('dateCreated[le]', dateTo);
    paymentsUrl.searchParams.append('limit', '100');

    const paymentsResponse = await fetch(paymentsUrl.toString(), {
      headers: {
        'access_token': asaasApiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!paymentsResponse.ok) {
      throw new Error(`Asaas payments API error: ${paymentsResponse.statusText}`);
    }

    const paymentsData = await paymentsResponse.json();

    // Calculate statistics
    let totalReceived = 0;
    let totalCreated = 0;
    let totalPaid = 0;
    let totalOverdue = 0;
    let totalRefunded = 0;
    let totalFees = 0;

    const paymentsByMethod: Record<string, number> = {};
    const feesByMethod: Record<string, number> = {
      PIX: 0,
      CREDIT_CARD: 0,
      BOLETO: 0,
    };

    const transactions: any[] = [];

    for (const payment of paymentsData.data || []) {
      totalCreated += payment.value || 0;

      if (payment.status === 'RECEIVED' || payment.status === 'CONFIRMED') {
        totalPaid += payment.value || 0;
        totalReceived += payment.netValue || payment.value || 0;
        
        const fee = (payment.value || 0) - (payment.netValue || payment.value || 0);
        totalFees += fee;

        // Aggregate by payment method
        const method = payment.billingType || 'UNKNOWN';
        paymentsByMethod[method] = (paymentsByMethod[method] || 0) + (payment.value || 0);
        feesByMethod[method] = (feesByMethod[method] || 0) + fee;
      }

      if (payment.status === 'OVERDUE') {
        totalOverdue += payment.value || 0;
      }

      if (payment.status === 'REFUNDED') {
        totalRefunded += payment.value || 0;
      }

      transactions.push({
        id: payment.id,
        date: payment.paymentDate || payment.dueDate || payment.dateCreated,
        description: payment.description || 'Pagamento',
        value: payment.value,
        netValue: payment.netValue,
        fee: (payment.value || 0) - (payment.netValue || payment.value || 0),
        status: payment.status,
        billingType: payment.billingType,
        customer: payment.customer,
      });
    }

    const financialStats: AsaasFinancialStats = {
      balance: {
        balance: balanceData.balance || 0,
        futureBalance: balanceData.futureBalance || 0,
        pendingBalance: balanceData.pendingBalance || 0,
      },
      payments: {
        totalReceived,
        totalCreated,
        totalPaid,
        totalOverdue,
        totalRefunded,
      },
      fees: {
        totalFees,
        pixFees: feesByMethod.PIX || 0,
        creditCardFees: feesByMethod.CREDIT_CARD || 0,
        boletoFees: feesByMethod.BOLETO || 0,
      },
    };

    return new Response(
      JSON.stringify({
        stats: financialStats,
        paymentsByMethod,
        transactions,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching Asaas financial data:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
