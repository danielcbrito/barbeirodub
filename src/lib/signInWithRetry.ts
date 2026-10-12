import { supabase } from "@/integrations/supabase/client";

/**
 * Login resiliente: se o servidor de autenticação demorar ou falhar
 * temporariamente (504/500/timeout), tenta de novo até 3 vezes
 * em vez de deixar o botão carregando para sempre.
 */
export async function signInWithRetry(email: string, password: string, attempts = 3) {
  let last: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>> | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await Promise.race([
        supabase.auth.signInWithPassword({ email, password }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 15000)),
      ]);
      last = res;
      const status = (res.error as { status?: number } | null)?.status ?? 0;
      const transient = res.error && (status >= 500 || status === 0 || /timeout|fetch|network/i.test(res.error.message));
      if (!transient) return res;
    } catch (e) {
      last = { data: { user: null, session: null }, error: e as never } as never;
    }
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  return last!;
}
