/**
 * URLs centralizadas do modo de testes (preview/publicado).
 * Garante que Cliente e Barbeiro sempre entrem pelas contas de teste.
 */

export const TEST_PREVIEW_URL = "https://id-preview--d8b57b7e-1177-4cc9-9763-a1418b6ad824.lovable.app";
export const TEST_PUBLISHED_URL = "https://dubadmin.lovable.app";
export const TEST_CLIENT_PREVIEW_URL = "https://id-preview--438e664d-987e-41f6-ae5f-9af4d94e4649.lovable.app";
export const TEST_CLIENT_PUBLISHED_URL = "https://dubagenda.lovable.app";

export type TestPreviewMode = "preview" | "published";
export type TestPreviewRole = "barbeiro" | "cliente";

export function getTestPreviewBaseUrl(mode: TestPreviewMode): string {
  return mode === "published" ? TEST_PUBLISHED_URL : TEST_PREVIEW_URL;
}

export function getTestAppBaseUrl(role: TestPreviewRole, mode: TestPreviewMode): string {
  if (role === "cliente") {
    return mode === "published" ? TEST_CLIENT_PUBLISHED_URL : TEST_CLIENT_PREVIEW_URL;
  }

  return getTestPreviewBaseUrl(mode);
}

export function buildTestLoginUrl(baseUrl: string, role: TestPreviewRole): string {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  return `${normalizedBaseUrl}/test-login?role=${role}`;
}

export function buildClientHomeUrl(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  return `${normalizedBaseUrl}/cliente`;
}
