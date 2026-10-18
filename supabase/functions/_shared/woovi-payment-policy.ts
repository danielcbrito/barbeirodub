export const PAYMENT_PROVIDER = 'woovi';
export function assertWooviMethod(method: string): void {
  if (method !== 'pix' && method !== 'cash') {
    throw new Error('Cartão online indisponível: a integração atual da Woovi aceita Pix.');
  }
}
export function assertConfirmedAmount(expected: number, actual: number, status: string): void {
  if (status !== 'COMPLETED') throw new Error('PAYMENT_NOT_CONFIRMED');
  if (!Number.isSafeInteger(expected) || expected <= 0 || expected !== actual) throw new Error('VALUE_MISMATCH');
}
export function isConfirmedWooviPayment(status: string | null | undefined): boolean {
  return status === 'COMPLETED';
}