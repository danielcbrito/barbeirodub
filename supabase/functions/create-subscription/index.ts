import { requireUser } from '../_shared/woovi-auth.ts';
import { corsHeaders, jsonResponse } from '../_shared/woovi-client.ts';
import { createWooviCharge } from '../_shared/woovi-charge.ts';
import { assertWooviMethod } from '../_shared/woovi-payment-policy.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const ctx = await requireUser(req);
  if (ctx instanceof Response) return ctx;
  try {
    const { planoId, paymentMethod, barbeiroId } = await req.json();
    assertWooviMethod(paymentMethod);
    if (paymentMethod !== 'pix') throw new Error('Use o fluxo presencial existente para dinheiro');
    if (!planoId || !barbeiroId) throw new Error('Plano e barbeiro obrigatórios');
    const { admin, userId } = ctx;
    const [{ data: plan, error: planError }, { data: barber, error: barberError }, { data: profile, error: profileError }] = await Promise.all([
      admin.from('planos').select('id, nome, preco_mensal, tenant_id').eq('id', planoId).eq('ativo', true).single(),
      admin.from('barbeiros').select('id, tenant_id, woovi_pix_key').eq('id', barbeiroId).eq('ativo', true).single(),
      admin.from('profiles').select('blocked').eq('id', userId).single(),
    ]);
    if (planError || barberError || profileError) throw new Error('Erro ao consultar plano, barbeiro ou cliente');
    if (!plan || !barber || plan.tenant_id !== barber.tenant_id) throw new Error('Plano e barbeiro devem pertencer à mesma barbearia');
    if (profile?.blocked) throw new Error('Usuário bloqueado. Entre em contato com o suporte.');
    if (!barber.woovi_pix_key) throw new Error('Carteira Woovi do barbeiro não configurada');
    const { data: existing, error: existingError } = await admin.from('assinaturas').select('id').eq('user_id', userId).in('status', ['active', 'pending_cash', 'pending_renewal']).limit(1);
    if (existingError) throw existingError;
    if (existing?.length) throw new Error('Você já possui uma assinatura ativa ou pendente');
    // Reuse the same unpaid intent rather than create duplicate subscriptions on retry.
    const { data: unpaid, error: unpaidError } = await admin.from('assinaturas').select('id').eq('user_id', userId).eq('plano_id', planoId).eq('barbeiro_id', barbeiroId).eq('status', 'suspended').eq('payment_method', 'pix').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (unpaidError) throw unpaidError;
    let subscriptionId = unpaid?.id;
    if (!subscriptionId) {
      const { data: subscription, error } = await admin.from('assinaturas').insert({
        user_id: userId, plano_id: planoId, barbeiro_id: barbeiroId, status: 'suspended', payment_method: 'pix',
      }).select('id').single();
      if (error) throw error;
      subscriptionId = subscription.id;
    }
    const wooviPayment = await createWooviCharge(admin, {
      correlationID: `sub-${subscriptionId}`, userId, barberId: barbeiroId,
      amount: plan.preco_mensal, comment: `Plano ${plan.nome}`,
      target: { assinatura_id: subscriptionId },
    });
    const { error: saveError } = await admin.from('assinaturas').update({
      gateway_subscription_id: wooviPayment.id,
      pix_qr_code: wooviPayment.pixQrCode.encodedImage, pix_payload: wooviPayment.pixQrCode.payload,
    }).eq('id', subscriptionId);
    if (saveError) throw saveError;
    return jsonResponse({ success: true, subscriptionId, wooviSubscription: {
      id: wooviPayment.id, firstPayment: wooviPayment,
    } });
  } catch (error) {
    console.error('[create-subscription]', error);
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Erro ao criar assinatura' }, 400);
  }
});
