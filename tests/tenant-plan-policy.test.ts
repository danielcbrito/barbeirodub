import { describe, expect, test } from 'bun:test';
import {
  hasCompletedTenantInstallment,
  isApprovedTenantSubscription,
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
});
