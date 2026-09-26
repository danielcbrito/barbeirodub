import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Get active or suspended subscription (PIX pending payment)
    const { data: subscription, error: subError } = await supabase
      .from('assinaturas')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['active', 'suspended'])
      .maybeSingle();

    if (subError) {
      console.error('Error fetching subscription:', subError);
      throw new Error('Erro ao buscar assinatura');
    }

    if (!subscription) {
      throw new Error('Nenhuma assinatura encontrada para cancelar');
    }

    const asaasApiKey = Deno.env.get('ASAAS_API_KEY');
    if (!asaasApiKey) {
      throw new Error('Asaas API key not configured');
    }

    // Cancel subscription in Asaas
    if (subscription.gateway_subscription_id) {
      console.log('Canceling Asaas subscription:', subscription.gateway_subscription_id);

      const asaasResponse = await fetch(
        `https://api.asaas.com/v3/subscriptions/${subscription.gateway_subscription_id}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'access_token': asaasApiKey,
          },
        }
      );

      if (!asaasResponse.ok) {
        const errorText = await asaasResponse.text();
        console.error('Asaas cancellation error:', {
          status: asaasResponse.status,
          statusText: asaasResponse.statusText,
          body: errorText
        });
        throw new Error('Erro ao cancelar assinatura no gateway de pagamento');
      }

      console.log('Asaas subscription canceled successfully');
    }

    // Update subscription status in database
    const { error: updateError } = await supabase
      .from('assinaturas')
      .update({ status: 'cancelled' })
      .eq('id', subscription.id);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Assinatura cancelada com sucesso',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in cancel-subscription:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Erro ao cancelar assinatura',
        details: error.toString()
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
