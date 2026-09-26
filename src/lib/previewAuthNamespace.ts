/**
 * Helpers para preservar o namespace de autenticação da prévia.
 * Isso permite que o auto-login de teste continue acessando a mesma
 * sessão após navegar de /test-login para /barbeiro ou /cliente.
 */

export const PREVIEW_AUTH_NAMESPACE_KEY = "__dub_preview_auth_namespace__";

const VALID_PREVIEW_ROLES = new Set(["barbeiro", "cliente"]);

export function getPreviewAuthNamespace(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const params = new URLSearchParams(window.location.search);
    const roleParam = params.get("role")?.trim().toLowerCase();

    if (roleParam && VALID_PREVIEW_ROLES.has(roleParam)) {
      return `ti_${roleParam}`;
    }

    if (typeof window.name === "string" && window.name.startsWith("ti_")) {
      return window.name;
    }

    const persistedNamespace = window.sessionStorage.getItem(PREVIEW_AUTH_NAMESPACE_KEY);
    if (persistedNamespace?.startsWith("ti_")) {
      return persistedNamespace;
    }

    // Só usamos namespace quando o Painel TI sinaliza explicitamente.
    // Fallback por pathname/iframe quebrava a sessão persistente: o login feito
    // em `/` podia ser salvo em um storage e a abertura direta de `/barbeiro`
    // procurava a sessão em outro storage, parecendo logout.
    return null;
  } catch {
    return null;
  }
}

export function persistPreviewAuthNamespace(namespace: string) {
  if (typeof window === "undefined") return;

  window.name = namespace;
  window.sessionStorage.setItem(PREVIEW_AUTH_NAMESPACE_KEY, namespace);
}

export function clearPreviewAuthNamespace() {
  if (typeof window === "undefined") return;

  window.name = "";
  window.sessionStorage.removeItem(PREVIEW_AUTH_NAMESPACE_KEY);
}