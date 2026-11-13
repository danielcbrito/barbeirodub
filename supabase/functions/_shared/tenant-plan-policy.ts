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

export interface TenantChargeSnapshot {
  correlationID?: string;
  status?: string;
  value?: number;
}

/** New tenant-plan receipts belong to the Woovi main account, never a barber/DUB subaccount. */
export function routeTenantPlanToMainAccount<T extends Record<string, unknown>>(payload: T): T {
  const routed = { ...payload } as Record<string, unknown>;
  delete routed.splits;
  return routed as T;
}

/** Card/monthly charges activate only after Woovi reports the exact completed charge. */
export function isCompletedTenantCharge(
  charge: TenantChargeSnapshot | undefined,
  correlationID: string,
  expectedValue: number,
): boolean {
  return charge?.correlationID === correlationID
    && Number(charge.value) === expectedValue
    && String(charge.status ?? '').toUpperCase() === 'COMPLETED';
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
