/**
 * Asaas config shim — kept for legacy functions still referencing Asaas
 * (store-api, renew-subscription, delete-tenant-account, delete-barber,
 *  get-barber-asaas-data, process-withdrawal, create-tenant-barber).
 *
 * The PIX deposit/withdrawal flow has been migrated to Efí Bank.
 * This module remains so legacy functions can still bundle/deploy.
 */

export interface AsaasConfig {
  apiKey: string;
  baseUrl: string;
  isSandbox: boolean;
}

export function getAsaasConfig(): AsaasConfig | null {
  const apiKey = Deno.env.get("ASAAS_API_KEY");
  if (!apiKey) return null;

  const isSandbox = apiKey.startsWith("$aact_hmlg") || apiKey.includes("sandbox");
  return {
    apiKey,
    baseUrl: isSandbox
      ? "https://api-sandbox.asaas.com/v3"
      : "https://api.asaas.com/v3",
    isSandbox,
  };
}
