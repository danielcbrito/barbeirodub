import { routeTenantPlanToMainAccount } from "./tenant-plan-policy.ts";
import type { TenantCheckoutCustomer } from "./tenant-checkout-requirements.ts";

interface TenantPlanPayloadInput {
  planName: string;
  value: number;
  correlationID: string;
  customer: TenantCheckoutCustomer;
  chargeDay?: number;
}

/** Journey 3 collects the first installment and the payer's monthly mandate together. */
export function buildTenantPlanPixAutomaticPayload({
  planName,
  value,
  correlationID,
  customer,
  chargeDay,
}: TenantPlanPayloadInput) {
  return routeTenantPlanToMainAccount({
    name: `DUB ${planName}`,
    value,
    customer,
    correlationID,
    comment: `DUB ${planName} mensal`.slice(0, 29),
    frequency: "MONTHLY",
    type: "PIX_RECURRING",
    pixRecurringOptions: {
      journey: "PAYMENT_ON_APPROVAL",
      retryPolicy: "THREE_RETRIES_7_DAYS",
    },
    dayGenerateCharge: chargeDay,
    dayDue: 3,
  });
}

/** Woovi card checkout is a confirmed single monthly payment, not a stored-card mandate. */
export function buildTenantPlanCardPayload({
  value,
  correlationID,
  customer,
}: TenantPlanPayloadInput) {
  return routeTenantPlanToMainAccount({
    correlationID,
    value,
    type: "CREDIT_CARD",
    customer,
  });
}
