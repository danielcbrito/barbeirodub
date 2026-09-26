/**
 * Cliente Efí Bank — autenticação OAuth2 com mTLS (certificado .p12 → PEM/base64).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ROTEAMENTO POR TENANT (test vs prod)
 * ─────────────────────────────────────────────────────────────────────────────
 * Tenants marcados com `is_test = true` (contas de homologação interna da DUB)
 * usam as credenciais e URL de HOMOLOGAÇÃO da Efí.
 * Os demais tenants (produção real) usam as credenciais e URL de PRODUÇÃO.
 *
 * Secrets esperados:
 *   • Homologação: EFI_CLIENT_ID, EFI_CLIENT_SECRET, EFI_CERTIFICATE_BASE64
 *   • Produção:    EFI_CLIENT_ID_PROD, EFI_CLIENT_SECRET_PROD, EFI_CERTIFICATE_BASE64_PROD
 */

const EFI_BASE_URL_TEST = "https://pix-h.api.efipay.com.br"; // Homologação
const EFI_BASE_URL_PROD = "https://pix.api.efipay.com.br";   // Produção

export type EfiEnv = "test" | "prod";

interface EfiTokenCache {
  token: string;
  expires_at: number;
}

// Cache separado por ambiente para evitar contaminação entre prod/test
const tokenCache: Record<EfiEnv, EfiTokenCache | null> = {
  test: null,
  prod: null,
};

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function getEfiCredentials(env: EfiEnv) {
  if (env === "prod") {
    return {
      baseUrl: EFI_BASE_URL_PROD,
      clientId: getRequiredEnv("EFI_CLIENT_ID_PROD"),
      clientSecret: getRequiredEnv("EFI_CLIENT_SECRET_PROD"),
      certB64: getRequiredEnv("EFI_CERTIFICATE_BASE64_PROD"),
    };
  }
  return {
    baseUrl: EFI_BASE_URL_TEST,
    clientId: getRequiredEnv("EFI_CLIENT_ID"),
    clientSecret: getRequiredEnv("EFI_CLIENT_SECRET"),
    certB64: getRequiredEnv("EFI_CERTIFICATE_BASE64"),
  };
}

/**
 * Cria um cliente Deno HTTP com certificado mTLS para o ambiente escolhido.
 * O certificado deve estar em PEM (base64) — converter .p12 com:
 *   openssl pkcs12 -in cert.p12 -out cert.pem -nodes
 */
function createMtlsClient(env: EfiEnv) {
  const { certB64 } = getEfiCredentials(env);
  const certPem = atob(certB64);
  return Deno.createHttpClient({
    cert: certPem,
    key: certPem, // PEM com cert+key juntos
  });
}

/**
 * Obtém access_token OAuth2 da Efí (cache em memória por ambiente).
 */
export async function getEfiAccessToken(env: EfiEnv = "test"): Promise<string> {
  const cached = tokenCache[env];
  if (cached && cached.expires_at > Date.now() + 30_000) {
    return cached.token;
  }

  const { baseUrl, clientId, clientSecret } = getEfiCredentials(env);
  const basicAuth = btoa(`${clientId}:${clientSecret}`);
  const client = createMtlsClient(env);

  try {
    const response = await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ grant_type: "client_credentials" }),
      // @ts-ignore — Deno extension
      client,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Efí auth failed (${env}): ${response.status} ${text}`);
    }

    const data = await response.json();
    tokenCache[env] = {
      token: data.access_token,
      expires_at: Date.now() + (data.expires_in - 60) * 1000,
    };
    return tokenCache[env]!.token;
  } finally {
    client.close();
  }
}

/**
 * Faz uma requisição autenticada à API Efí com mTLS no ambiente escolhido.
 */
export async function efiRequest<T = any>(
  path: string,
  init: RequestInit & { body?: any; env?: EfiEnv } = {}
): Promise<T> {
  const env: EfiEnv = init.env ?? "test";
  const token = await getEfiAccessToken(env);
  const { baseUrl } = getEfiCredentials(env);
  const client = createMtlsClient(env);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      // @ts-ignore
      client,
    });

    const text = await response.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    if (!response.ok) {
      throw new Error(
        `Efí ${path} (${env}) ${response.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`
      );
    }
    return data as T;
  } finally {
    client.close();
  }
}

/**
 * Resolve o ambiente Efí (test/prod) para um determinado tenant.
 * Tenants `is_test = true` usam homologação; demais, produção.
 */
export async function resolveEfiEnvForTenant(
  admin: { from: (table: string) => any },
  tenantId: string | null | undefined
): Promise<EfiEnv> {
  if (!tenantId) return "prod"; // sem tenant → assume produção (mais seguro: bloqueado pelo admin)
  const { data } = await admin
    .from("tenants")
    .select("is_test")
    .eq("id", tenantId)
    .maybeSingle();
  return data?.is_test === true ? "test" : "prod";
}

export { EFI_BASE_URL_TEST, EFI_BASE_URL_PROD };
