import { describe, expect, test } from "bun:test";
import {
  getMissingTenantCheckoutFields,
  isValidCnpj,
  isValidCpf,
} from "../supabase/functions/_shared/tenant-checkout-requirements";
import {
  buildTenantPlanCardPayload,
  buildTenantPlanPixAutomaticPayload,
} from "../supabase/functions/_shared/tenant-plan-payload";

const customer = {
  name: "Barbearia Exemplo",
  taxID: "52.998.224-725",
  email: "financeiro@exemplo.com.br",
  phone: "5511999999999",
  address: {
    street: "Rua das Flores",
    number: "123",
    neighborhood: "Centro",
    city: "São Paulo",
    state: "SP",
    country: "BR",
    zipcode: "01001000",
  },
};

describe("Tenant checkout requirements", () => {
  test("accepts a complete payer with a mathematically valid CPF", () => {
    expect(isValidCpf(customer.taxID)).toBe(true);
    expect(getMissingTenantCheckoutFields(customer)).toEqual([]);
  });

  test("accepts a valid CNPJ and rejects invalid documents", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(getMissingTenantCheckoutFields({ ...customer, taxID: "12345678901" })).toContain("CPF ou CNPJ válido");
  });

  test("requires every address field instead of inventing bank data", () => {
    const missing = getMissingTenantCheckoutFields({
      ...customer,
      address: { zipcode: "01001000" },
    });
    expect(missing).toEqual([
      "Rua / Logradouro",
      "Número do endereço",
      "Bairro",
      "Cidade",
      "Estado (UF)",
    ]);
  });

  test("requires valid contact fields for both payment methods", () => {
    const missing = getMissingTenantCheckoutFields({ ...customer, email: "invalido", phone: "119" });
    expect(missing).toContain("E-mail válido");
    expect(missing).toContain("Telefone ou WhatsApp válido");
  });
});

describe("Tenant plan Woovi payloads", () => {
  test("creates Pix Automatic with monthly recurrence and payment on approval", () => {
    const payload = buildTenantPlanPixAutomaticPayload({
      planName: "Dupla",
      value: 6990,
      correlationID: "dub-tenant-plan-1",
      customer,
      chargeDay: 13,
    });
    expect(payload.frequency).toBe("MONTHLY");
    expect(payload.type).toBe("PIX_RECURRING");
    expect(payload.pixRecurringOptions.journey).toBe("PAYMENT_ON_APPROVAL");
    expect(payload.dayGenerateCharge).toBe(13);
    expect("splits" in payload).toBe(false);
    expect(payload.comment.length).toBeLessThan(30);
  });

  test("keeps card as a main-account charge without simulating a monthly mandate", () => {
    const payload = buildTenantPlanCardPayload({
      planName: "Dupla",
      value: 6990,
      correlationID: "dub-card-1",
      customer,
    });
    expect(payload.type).toBe("CREDIT_CARD");
    expect("frequency" in payload).toBe(false);
    expect("splits" in payload).toBe(false);
  });
});
