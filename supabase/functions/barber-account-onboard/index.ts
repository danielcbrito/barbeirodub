// Cadastro do barbeiro como empresa afiliada Woovi (conta própria no CPF/CNPJ dele).
// Ações: submit (envia pré-registro) | sync (verifica ativação e gera credencial).
import { requireUser } from '../_shared/woovi-auth.ts';
import { corsHeaders, errorResponse, jsonResponse, wooviFetch, WooviError } from '../_shared/woovi-client.ts';
import { appIdFrom, validateOnboarding } from '../_shared/barber-account-policy.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const ctx = await requireUser(req);
  if (ctx instanceof Response) return ctx;
  const { userId, admin } = ctx;
  let body: { action?: string } = {};
  try { body = await req.json(); } catch { /* vazio */ }
  const action = body.action === 'sync' ? 'sync' : body.action === 'submit' ? 'submit' : null;
  if (!action) return errorResponse('INVALID_ACTION', 'Ação inválida', 400);

  const { data: acc, error } = await admin.from('barber_payment_accounts').select('*').eq('user_id', userId).maybeSingle();
  if (error) return errorResponse('DB_ERROR', 'Falha ao ler cadastro', 500);
  if (!acc) return errorResponse('NOT_FOUND', 'Cadastro de recebimento não encontrado', 404);

  try {
    if (action === 'submit') {
      if (!['draft', 'rejected'].includes(acc.status)) return jsonResponse({ status: acc.status });
      const v = validateOnboarding(acc);
      if (!v.ok) return errorResponse('MISSING_FIELDS', `Complete: ${v.missing.join(', ')}`, 400, { missing: v.missing });
      const [firstName, ...rest] = acc.full_name.trim().split(/\s+/);
      const phone = acc.phone.replace(/\D/g, '');
      await wooviFetch('/api/v1/partner/company', { method: 'POST', body: {
        preRegistration: { name: acc.full_name.trim(), taxID: { taxID: v.doc, type: v.taxType }, website: 'https://barbeirodub.lovable.app' },
        user: { firstName, lastName: rest.join(' '), email: acc.email.trim(), phone: phone.startsWith('55') ? `+${phone}` : `+55${phone}`, taxID: { taxID: v.ownerCpf, type: 'BR:CPF' } },
      } });
      await admin.from('barber_payment_accounts').update({ status: 'pending', tax_id: v.doc, tax_type: v.taxType,
        status_message: 'Enviamos um e-mail e SMS da Woovi para você validar sua conta.' }).eq('id', acc.id);
      return jsonResponse({ status: 'pending' });
    }

    // sync: tenta gerar a credencial; só funciona após a conta ser ativada pela Woovi.
    if (acc.status !== 'pending') return jsonResponse({ status: acc.status });
    const res = await wooviFetch<{ application?: { clientId?: string; clientSecret?: string } }>(
      '/api/openpix/v1/partner/application', { method: 'POST', body: {
        application: { name: `DUB-${acc.barbeiro_id.slice(0, 8)}`, type: 'API' },
        taxID: { taxID: acc.tax_id, type: acc.tax_type },
      } });
    const app = res.application;
    if (!app?.clientId || !app?.clientSecret) return jsonResponse({ status: 'pending' });
    await admin.from('barber_payment_credentials').upsert({ barbeiro_id: acc.barbeiro_id, app_id: appIdFrom(app.clientId, app.clientSecret) });
    await admin.from('barber_payment_accounts').update({ status: 'approved', status_message: null }).eq('id', acc.id);
    return jsonResponse({ status: 'approved' });
  } catch (e) {
    const msg = e instanceof WooviError ? e.message : 'Falha ao falar com o banco';
    console.error('[barber-account-onboard]', action, e instanceof WooviError ? e.status : '', msg);
    if (action === 'sync') return jsonResponse({ status: 'pending', message: 'Conta ainda em análise na Woovi.' });
    if (/parceri/i.test(msg)) {
      return jsonResponse({ status: 'unavailable', message: 'A criação de contas ainda não foi liberada pelo banco. Tente novamente mais tarde.' });
    }
    return errorResponse('BANK_ERROR', msg, 502);
  }
});
