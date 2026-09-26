import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Valida CPF usando o algoritmo oficial
 */
function validateCPF(cpf: string): boolean {
  const cleanCPF = cpf.replace(/\D/g, '');
  
  if (cleanCPF.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cleanCPF)) return false;

  let sum = 0;
  let remainder;

  for (let i = 1; i <= 9; i++) {
    sum += parseInt(cleanCPF.substring(i - 1, i)) * (11 - i);
  }

  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCPF.substring(9, 10))) return false;

  sum = 0;
  for (let i = 1; i <= 10; i++) {
    sum += parseInt(cleanCPF.substring(i - 1, i)) * (12 - i);
  }

  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCPF.substring(10, 11))) return false;

  return true;
}

interface CreateSubscriptionRequest {
  planoId: string;
  paymentMethod: 'card' | 'pix';
  barbeiroId?: string;
  cardInfo?: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { planoId, paymentMethod, cardInfo, barbeiroId }: CreateSubscriptionRequest = await req.json();

    // If barbeiroId provided, fetch barber's wallet for split
    let barberWalletId: string | null = null;
    if (barbeiroId) {
      const { data: barber } = await supabase
        .from('barbeiros')
        .select('asaas_wallet_id')
        .eq('id', barbeiroId)
        .single();

      barberWalletId = barber?.asaas_wallet_id || null;
      console.log('Barber wallet for split:', { barbeiroId, walletId: barberWalletId });
    }
    // Fetch plan details
    const { data: plano, error: planoError } = await supabase
      .from('planos')
      .select('*')
      .eq('id', planoId)
      .eq('ativo', true)
      .single();

    if (planoError || !plano) {
      throw new Error('Plano não encontrado');
    }

    // Fetch user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      throw new Error('Perfil não encontrado');
    }

    // Validate CPF
    if (!profile.cpf || !validateCPF(profile.cpf)) {
      throw new Error('CPF inválido. Por favor, atualize seu perfil com um CPF válido.');
    }

    // Check if user is blocked
    if (profile.blocked) {
      throw new Error('Usuário bloqueado. Entre em contato com o suporte.');
    }

    // Check if user already has an active subscription
    const { data: existingSubscription } = await supabase
      .from('assinaturas')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (existingSubscription) {
      throw new Error('Você já possui uma assinatura ativa');
    }

    const asaasApiKey = Deno.env.get('ASAAS_API_KEY');
    if (!asaasApiKey) {
      throw new Error('Asaas API key not configured');
    }

    // Create or get customer in Asaas
    const asaasCustomer = {
      name: profile?.nome || 'Cliente',
      email: user.email || 'noemail@example.com',
      cpfCnpj: profile?.cpf || '',
      externalReference: user.id,
    };

    console.log('Creating/fetching Asaas customer for subscription');

    // Search for existing customer first
    const customerSearchUrl = `https://api.asaas.com/v3/customers?externalReference=${user.id}`;
    const customerSearchResponse = await fetch(customerSearchUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'access_token': asaasApiKey,
      },
    });

    const customerSearchResult = await customerSearchResponse.json();
    let customerId = null;

    if (customerSearchResult.data && customerSearchResult.data.length > 0) {
      customerId = customerSearchResult.data[0].id;
      console.log('Using existing customer:', customerId);
    } else {
      // Create new customer
      const customerCreateResponse = await fetch('https://api.asaas.com/v3/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access_token': asaasApiKey,
        },
        body: JSON.stringify(asaasCustomer),
      });

      const customerCreateResult = await customerCreateResponse.json();

      if (!customerCreateResponse.ok || customerCreateResult.errors) {
        console.error('Asaas customer error:', customerCreateResult);
        throw new Error(customerCreateResult.errors?.[0]?.description || 'Erro ao criar cliente no Asaas');
      }

      customerId = customerCreateResult.id;
      console.log('Created new customer:', customerId);
    }

    // Create subscription in Asaas
    const subscriptionData: any = {
      customer: customerId,
      billingType: paymentMethod === 'pix' ? 'PIX' : 'CREDIT_CARD',
      value: plano.preco_mensal,
      nextDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      cycle: 'MONTHLY',
      description: `Assinatura ${plano.nome}`,
      externalReference: user.id,
    };

    // Split 100% do valor para a subconta do barbeiro
    if (barberWalletId) {
      subscriptionData.split = [{
        walletId: barberWalletId,
        percentualValue: 100,
      }];
      console.log('Adding split to subscription:', { walletId: barberWalletId, percentualValue: 100 });
    }

    // For credit card, add card info
    if (paymentMethod === 'card' && cardInfo) {
      subscriptionData.creditCard = {
        holderName: cardInfo.holderName,
        number: cardInfo.number.replace(/\s/g, ''),
        expiryMonth: cardInfo.expiryMonth,
        expiryYear: cardInfo.expiryYear,
        ccv: cardInfo.ccv,
      };
      subscriptionData.creditCardHolderInfo = {
        name: cardInfo.holderName,
        email: user.email,
        cpfCnpj: profile.cpf || '00000000000',
        postalCode: '00000000',
        addressNumber: '0',
        phone: '0000000000',
      };
    }

    console.log('Creating Asaas subscription:', { 
      ...subscriptionData, 
      creditCard: paymentMethod === 'card' ? '[REDACTED]' : undefined 
    });

    const asaasResponse = await fetch('https://api.asaas.com/v3/subscriptions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': asaasApiKey,
      },
      body: JSON.stringify(subscriptionData),
    });

    const asaasResult = await asaasResponse.json();

    console.log('Asaas subscription response:', { 
      status: asaasResponse.status, 
      id: asaasResult.id,
      hasError: !!asaasResult.errors 
    });

    if (!asaasResponse.ok || asaasResult.errors) {
      console.error('Asaas error:', asaasResult);
      throw new Error(asaasResult.errors?.[0]?.description || 'Erro ao criar assinatura no Asaas');
    }

     // Fetch the first payment details to get PIX QR Code
    let firstPaymentDetails: any = null;
    if (asaasResult.id) {
      try {
        // Get payments for this subscription
        const paymentsResponse = await fetch(`https://api.asaas.com/v3/payments?subscription=${asaasResult.id}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'access_token': asaasApiKey,
          },
        });

        const paymentsResult = await paymentsResponse.json();
        console.log('Subscription payments:', { count: paymentsResult.data?.length || 0 });

        if (paymentsResult.data && paymentsResult.data.length > 0) {
          const firstPayment = paymentsResult.data[0];
          firstPaymentDetails = {
            id: firstPayment.id,
            status: firstPayment.status,
            value: firstPayment.value,
          };

          // For PIX, fetch QR Code
          if (paymentMethod === 'pix') {
            const qrCodeResponse = await fetch(`https://api.asaas.com/v3/payments/${firstPayment.id}/pixQrCode`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'access_token': asaasApiKey,
              },
            });

            if (qrCodeResponse.ok) {
              const qrCodeData = await qrCodeResponse.json();
              firstPaymentDetails.pixQrCode = qrCodeData;
              console.log('PIX QR Code fetched for subscription');
            } else {
              console.error('Failed to fetch PIX QR Code:', await qrCodeResponse.text());
            }
          }
        }
      } catch (error) {
        console.error('Error fetching payment details:', error);
      }
    }

    // Calculate next billing date
    const nextBillingDate = new Date(asaasResult.nextDueDate);

    // Determine initial subscription status
    // For PIX, use 'suspended' until payment is confirmed (enum doesn't have 'pending')
    // For card, mark as 'active' if first payment is confirmed, otherwise 'suspended'
    const initialStatus = (paymentMethod === 'pix') 
      ? 'suspended' 
      : (firstPaymentDetails?.status === 'CONFIRMED' ? 'active' : 'suspended');

    console.log('Subscription initial status:', { 
      paymentMethod, 
      firstPaymentStatus: firstPaymentDetails?.status,
      initialStatus 
    });

    // Save subscription to database
    const { data: subscription, error: subscriptionError } = await supabase
      .from('assinaturas')
      .insert({
        user_id: user.id,
        plano_id: planoId,
        barbeiro_id: barbeiroId || null,
        status: initialStatus,
        payment_method: paymentMethod,
        gateway_subscription_id: asaasResult.id,
        next_billing_date: nextBillingDate.toISOString().split('T')[0],
      })
      .select()
      .single();

    if (subscriptionError) throw subscriptionError;

    // Unblock user if they were blocked (only if payment is confirmed)
    if (profile.blocked && initialStatus === 'active') {
      await supabase
        .from('profiles')
        .update({ blocked: false })
        .eq('id', user.id);
    }

    // Build response
    const response: any = {
      success: true,
      subscription,
      asaasSubscription: {
        id: asaasResult.id,
        status: asaasResult.status,
        nextDueDate: asaasResult.nextDueDate,
      },
      message: paymentMethod === 'pix' 
        ? 'Assinatura criada! Complete o pagamento via PIX.' 
        : 'Assinatura criada com sucesso!',
    };

    // Add first payment details if available
    if (firstPaymentDetails) {
      response.asaasSubscription.firstPayment = firstPaymentDetails;
    }

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in create-subscription:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Erro ao criar assinatura',
        details: error.toString()
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
