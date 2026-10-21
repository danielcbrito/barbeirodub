import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { wooviFetch, WooviError } from './woovi-client.ts';

interface ChargeInput {
  correlationID: string;
  userId: string;
  barberId: string;
  amount: number;
  comment: string;
  target?: Record<string, unknown>;
}
interface ChargeResponse { charge?: { identifier?: string; brCode?: string; qrCodeImage?: string; status?: string; value?: number } }

export async function createWooviCharge(admin: SupabaseClient<any>, input: ChargeInput) {
  const cents = Math.round(input.amount * 100);
  if (!Number.isSafeInteger(cents) || cents < 100) throw new Error('Valor mínimo para Pix: R$ 1,00');
  const { data: barber, error } = await admin.from('barbeiros').select('id, woovi_pix_key').eq('id', input.barberId).eq('ativo', true).maybeSingle();
  if (error) throw error;
  if (!barber?.woovi_pix_key) throw new Error('Carteira Woovi do barbeiro não configurada');
  // Persist intent before asking the bank, so an early callback can be reconciled.
  const { error: intentError } = await admin.from('woovi_charges').upsert({
    correlation_id: input.correlationID, user_id: input.userId, barbeiro_id: input.barberId,
    value_centavos: cents, ...input.target,
  }, { onConflict: 'correlation_id', ignoreDuplicates: true });
  if (intentError) throw intentError;
  const { data: existing, error: existingError } = await admin.from('woovi_charges').select('value_centavos, user_id, barbeiro_id').eq('correlation_id', input.correlationID).single();
  if (existingError) throw existingError;
  if (existing.user_id !== input.userId || existing.barbeiro_id !== input.barberId || existing.value_centavos !== cents) throw new Error('CHARGE_INTENT_MISMATCH');
  let response: ChargeResponse;
  try {
    response = await wooviFetch<ChargeResponse>(`/api/v1/charge/${encodeURIComponent(input.correlationID)}`);
  } catch (error) {
    if (!(error instanceof WooviError) || error.status !== 404) throw error;
    // Taxa bancária fixa cobrada pela Woovi em cada Pix (R$ 0,50).
    // Descontada do split da subconta do barbeiro para que cada profissional
    // pague a taxa do seu próprio Pix recebido e mantenha o caixa equilibrado.
    const feeCentavos = 50;
    const splitValue = Math.max(0, cents - feeCentavos);
    response = await wooviFetch<ChargeResponse>('/api/v1/charge', { method: 'POST', body: {
      correlationID: input.correlationID, value: cents, comment: input.comment,
      splits: [{ splitType: 'SPLIT_SUB_ACCOUNT', pixKey: barber.woovi_pix_key, value: splitValue }],
    } });
  }
  const charge = response.charge;
  if (charge?.value !== cents) throw new Error('BANK_CHARGE_VALUE_MISMATCH');
  if (!charge?.brCode) throw new Error('Woovi não retornou código Pix; cobrança precisa ser conferida antes de tentar novamente');
  const { error: saveError } = await admin.from('woovi_charges').update({
    charge_id: charge.identifier ?? null, br_code: charge.brCode, qr_code_image: charge.qrCodeImage ?? null,
    raw_response: response,
  }).eq('correlation_id', input.correlationID);
  if (saveError) throw new Error('Cobrança criada na Woovi, mas registro local falhou; solicite reconciliação');
  return { id: input.correlationID, status: 'ACTIVE', value: input.amount,
    pixQrCode: { encodedImage: charge.qrCodeImage ?? '', payload: charge.brCode } };
}