import { describe, expect, test } from 'bun:test';
import {
  hasCompletedTenantInstallment,
  isApprovedTenantSubscription,
  isCompletedTenantCharge,
  routeTenantPlanToMainAccount,
} from '../supabase/functions/_shared/tenant-plan-policy';

const approved = {
  correlationID: 'dub-tenant-plan-1',
  status: 'ACTIVE',
  value: 6990,
  pixRecurring: { status: 'APPROVED' },
};

describe('Tenant plan bank confirmation', () => {
  test('activates only the exact approved and active Woovi subscription', () => {
    expect(isApprovedTenantSubscription(approved, 'dub-tenant-plan-1', 6990)).toBe(true);
    expect(isApprovedTenantSubscription({ ...approved, status: 'INACTIVE' }, 'dub-tenant-plan-1', 6990)).toBe(false);
    expect(isApprovedTenantSubscription({ ...approved, pixRecurring: { status: 'CREATED' } }, 'dub-tenant-plan-1', 6990)).toBe(false);
  });

  test('rejects a different correlation or amount before activating', () => {
    expect(isApprovedTenantSubscription(approved, 'another-id', 6990)).toBe(false);
    expect(isApprovedTenantSubscription(approved, 'dub-tenant-plan-1', 6989)).toBe(false);
  });

  test('renews only with a completed installment for the exact monthly amount', () => {
    expect(hasCompletedTenantInstallment([{ status: 'COMPLETED', value: 6990 }], 6990)).toBe(true);
    expect(hasCompletedTenantInstallment([{ status: 'ACTIVE', value: 6990 }], 6990)).toBe(false);
    expect(hasCompletedTenantInstallment([{ status: 'COMPLETED', value: 6990 }], 12990)).toBe(false);
    expect(hasCompletedTenantInstallment([], 6990)).toBe(false);
  });

  test('routes every new tenant-plan payment to the main account without subaccount splits', () => {
    const routed = routeTenantPlanToMainAccount({
      value: 6990,
      splits: [{ splitType: 'SPLIT_SUB_ACCOUNT', pixKey: 'legacy-dub', value: 6990 }],
    });
    expect(routed.value).toBe(6990);
    expect('splits' in routed).toBe(false);
  });

  test('activates a card payment only after the exact charge is completed', () => {
    const charge = { correlationID: 'dub-card-1', status: 'COMPLETED', value: 6990 };
    expect(isCompletedTenantCharge(charge, 'dub-card-1', 6990)).toBe(true);
    expect(isCompletedTenantCharge({ ...charge, status: 'ACTIVE' }, 'dub-card-1', 6990)).toBe(false);
    expect(isCompletedTenantCharge(charge, 'another-id', 6990)).toBe(false);
    expect(isCompletedTenantCharge(charge, 'dub-card-1', 12990)).toBe(false);
  });
});
