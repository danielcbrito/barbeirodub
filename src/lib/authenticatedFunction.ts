export interface FunctionSession {
  access_token: string;
  expires_at?: number;
}

interface FunctionResult<T> {
  data: T | null;
  error: Error | null;
}

interface FunctionDependencies {
  getSession: () => Promise<FunctionSession | null>;
  refreshSession: () => Promise<FunctionSession | null>;
  invoke: <T>(name: string, body: Record<string, unknown>, token: string) => Promise<FunctionResult<T>>;
}

const expiredSession = () => new Error("Sua sessão expirou. Entre novamente para continuar.");

/** Never send the anonymous key as the identity of a signed-in caller. */
export function createAuthenticatedFunction(dependencies: FunctionDependencies) {
  let refreshing: Promise<FunctionSession | null> | undefined;
  const refresh = () => {
    if (!refreshing) {
      refreshing = dependencies.refreshSession().finally(() => { refreshing = undefined; });
    }
    return refreshing;
  };

  return async function invoke<T = any>(name: string, options: { body: Record<string, unknown> }): Promise<FunctionResult<T>> {
    try {
      let session = await dependencies.getSession();
      if (!session?.access_token) return { data: null, error: expiredSession() };
      if (session.expires_at && session.expires_at <= Date.now() / 1000 + 60) {
        session = await refresh();
        if (!session?.access_token) return { data: null, error: expiredSession() };
      }

      const result = await dependencies.invoke<T>(name, options.body, session.access_token);
      const status = (result.error as (Error & { context?: { status?: number } }) | null)?.context?.status;
      if (status !== 401) return result;

      // An expired/revoked access token can be repaired once; no retry on permissions or server errors.
      const renewed = await refresh();
      if (!renewed?.access_token) return { data: null, error: expiredSession() };
      const retried = await dependencies.invoke<T>(name, options.body, renewed.access_token);
      const retryStatus = (retried.error as (Error & { context?: { status?: number } }) | null)?.context?.status;
      return retryStatus === 401 ? { data: null, error: expiredSession() } : retried;
    } catch {
      return { data: null, error: new Error("Não foi possível validar sua sessão. Tente novamente.") };
    }
  };
}