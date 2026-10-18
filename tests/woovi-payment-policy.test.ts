import { describe, expect, test } from 'bun:test';
import { PAYMENT_PROVIDER, assertWooviMethod, assertConfirmedAmount, isConfirmedWooviPayment } from '../supabase/functions/_shared/woovi-payment-policy';

describe('Woovi payment bank', () => {
  test('uses Woovi as the bank', () => expect(PAYMENT_PROVIDER).toBe('woovi'));
  test('supports Pix without routing card payments to another bank', () => {
    expect(() => assertWooviMethod('pix')).not.toThrow();
    expect(() => assertWooviMethod('card')).toThrow();
  });
  test('does not confirm payment from an expired or missing reservation', () => {
    expect(isConfirmedWooviPayment(null)).toBe(false);
    expect(isConfirmedWooviPayment('ACTIVE')).toBe(false);
    expect(isConfirmedWooviPayment('COMPLETED')).toBe(true);
  });
  test('requires bank completion and the exact expected amount', () => {
    expect(() => assertConfirmedAmount(13080, 13080, 'COMPLETED')).not.toThrow();
    expect(() => assertConfirmedAmount(13080, 13079, 'COMPLETED')).toThrow();
    expect(() => assertConfirmedAmount(13080, 13080, 'ACTIVE')).toThrow();
  });
});