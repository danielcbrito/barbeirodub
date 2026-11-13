export interface TenantSubscriptionSnapshot {
  correlationID?: string;
  status?: string;
  value?: number;
  pixRecurring?: { status?: string };
}

export interface TenantInstallmentSnapshot {
  status?: string;
  value?: number;
}

/** Journey 3 activates only after Woovi reports an active, approved mandate. */
export function isApprovedTenantSubscription(
  subscription: TenantSubscriptionSnapshot | undefined,
  correlationID: string,
  expectedValue: number,
): boolean {
  return subscription?.correlationID === correlationID
    && Number(subscription.value) === expectedValue
    && String(subscription.status ?? '').toUpperCase() === 'ACTIVE'
    && String(subscription.pixRecurring?.status ?? '').toUpperCase() === 'APPROVED';
}

/** A renewal requires a real completed installment with the contracted amount. */
export function hasCompletedTenantInstallment(
  installments: TenantInstallmentSnapshot[] | undefined,
  expectedValue: number,
): boolean {
  return Boolean(installments?.some(
    (installment) => String(installment.status ?? '').toUpperCase() === 'COMPLETED'
      && Number(installment.value) === expectedValue,
  ));
}
