import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import { requireInternalCaller } from '../_shared/internal-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const unauthorized = requireInternalCaller(req);
  if (unauthorized) return unauthorized;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const asaasApiKey = Deno.env.get('ASAAS_API_KEY');
    if (!asaasApiKey) {
      throw new Error('ASAAS_API_KEY not configured');
    }

    console.log('Starting subscription charge generation...');

    // Get all active subscriptions with PIX payment method
    const { data: subscriptions, error: subsError } = await supabase
      .from('assinaturas')
      .select(`
        *,
        planos!inner(*),
        profiles!inner(*)
      `)
      .eq('status', 'active')
      .eq('payment_method', 'pix');

    if (subsError) throw subsError;

    console.log(`Found ${subscriptions?.length || 0} active PIX subscriptions`);

    const today = new Date();
    const results = [];

    for (const subscription of subscriptions || []) {
      try {
        const nextBilling = new Date(subscription.next_billing_date);
        
        // Check if billing is due (today or past due)
        if (nextBilling <= today) {
          console.log(`Generating charge for subscription ${subscription.id}`);

          // Create customer in Asaas if needed
          const customerData = {
            name: subscription.profiles.nome,
            email: subscription.profiles.id, // Using user ID as email reference
            cpfCnpj: subscription.profiles.cpf || '00000000000',
            externalReference: subscription.user_id,
          };

          let asaasCustomerId = subscription.gateway_subscription_id;

          if (!asaasCustomerId) {
            // Create customer
            const customerResponse = await fetch('https://api.asaas.com/v3/customers', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'access_token': asaasApiKey,
              },
              body: JSON.stringify(customerData),
            });

            if (!customerResponse.ok) {
              throw new Error(`Failed to create customer: ${await customerResponse.text()}`);
            }

            const customer = await customerResponse.json();
            asaasCustomerId = customer.id;

            // Update subscription with customer ID
            await supabase
              .from('assinaturas')
              .update({ gateway_subscription_id: asaasCustomerId })
              .eq('id', subscription.id);
          }

          // Create PIX payment in Asaas
          const paymentData = {
            customer: asaasCustomerId,
            billingType: 'PIX',
            value: subscription.planos.preco_mensal,
            dueDate: today.toISOString().split('T')[0],
            description: `Mensalidade ${subscription.planos.nome} - ${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`,
            externalReference: subscription.id,
          };

          const paymentResponse = await fetch('https://api.asaas.com/v3/payments', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'access_token': asaasApiKey,
            },
            body: JSON.stringify(paymentData),
          });

          if (!paymentResponse.ok) {
            throw new Error(`Failed to create payment: ${await paymentResponse.text()}`);
          }

          const payment = await paymentResponse.json();

          // Save payment to database
          await supabase
            .from('pagamentos')
            .insert({
              user_id: subscription.user_id,
              assinatura_id: subscription.id,
              metodo: 'pix',
              valor: subscription.planos.preco_mensal,
              status: 'pending',
              gateway_payment_id: payment.id,
            });

          // Update next billing date (add 30 days)
          const newNextBilling = new Date(nextBilling);
          newNextBilling.setDate(newNextBilling.getDate() + 30);
          
          await supabase
            .from('assinaturas')
            .update({ 
              next_billing_date: newNextBilling.toISOString().split('T')[0],
              updated_at: new Date().toISOString(),
            })
            .eq('id', subscription.id);

          results.push({
            subscription_id: subscription.id,
            payment_id: payment.id,
            status: 'success',
          });

          console.log(`Charge created successfully for subscription ${subscription.id}`);
        }
      } catch (error) {
        console.error(`Error processing subscription ${subscription.id}:`, error);
        results.push({
          subscription_id: subscription.id,
          status: 'error',
          error: (error as Error).message,
        });
      }
    }

    console.log('Subscription charge generation complete');

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: results.length,
        results 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
