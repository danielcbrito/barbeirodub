import { requireInternalCaller } from '../_shared/internal-auth.ts';
import { serviceClient } from '../_shared/woovi-auth.ts';
import { createWooviCharge } from '../_shared/woovi-charge.ts';
import { corsHeaders, jsonResponse } from '../_shared/woovi-client.ts';
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const unauthorized = requireInternalCaller(req);
  if (unauthorized) return unauthorized;
  try {
    const admin = serviceClient();
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const { data: subscriptions, error } = await admin.from('assinaturas')
      .select('id,user_id,barbeiro_id,next_billing_date,planos(nome,preco_mensal)')
      .eq('status', 'active').eq('payment_method', 'pix').lte('next_billing_date', today).limit(100);
    if (error) throw error;
    const results = [];
    for (const sub of subscriptions ?? []) {
      try {
        const plan = Array.isArray(sub.planos) ? sub.planos[0] : sub.planos;
        if (!plan || !sub.barbeiro_id) throw new Error('Plano ou barbeiro ausente');
        const payment = await createWooviCharge(admin, { correlationID: `due-${sub.id}-${sub.next_billing_date}`,
          userId: sub.user_id, barberId: sub.barbeiro_id, amount: plan.preco_mensal,
          comment: `Mensalidade ${plan.nome}`, target: { assinatura_id: sub.id },
        });
        // Generating a charge is not payment: do not advance the paid cycle here.
        results.push({ subscription_id: sub.id, payment_id: payment.id, status: 'pending_payment' });
      } catch (error) { results.push({ subscription_id: sub.id, status: 'error', error: error instanceof Error ? error.message : 'Erro Woovi' }); }
    }
    return jsonResponse({ success: true, processed: results.length, results });
  } catch (error) { return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Erro ao gerar cobranças' }, 500); }
});
