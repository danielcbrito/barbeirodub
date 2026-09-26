import { useEffect, useState, useRef } from "react";
import type { User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

const readCachedSupabaseUser = (): User | null => {
  if (typeof window === "undefined") return null;

  try {
    const authKey = Object.keys(window.localStorage).find(
      (key) => key.startsWith("sb-") && key.endsWith("-auth-token"),
    );
    if (!authKey) return null;

    const raw = window.localStorage.getItem(authKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const user = parsed?.user || parsed?.currentSession?.user;
    return user?.id ? (user as User) : null;
  } catch {
    return null;
  }
};

/**
 * ═══════════════════════════════════════════════════════════════
 * useAuthReady — Sessão persistente e resiliente
 * ═══════════════════════════════════════════════════════════════
 *
 * Aguarda a restauração da sessão antes de liberar queries autenticadas.
 *
 * Estratégia de persistência:
 *  1. Supabase persiste tokens em localStorage (configurado no client).
 *  2. `autoRefreshToken: true` renova tokens automaticamente.
 *  3. Em caso de falha no refresh, NÃO destruímos a sessão — apenas
 *     marcamos como não-autenticado e deixamos o usuário na landing.
 *     Quando ele reabrir o app, tentamos novamente.
 *
 * Isso garante que o barbeiro só precisa logar UMA VEZ e a sessão
 * persiste indefinidamente enquanto o localStorage não for limpo.
 */
export function useAuthReady() {
  const cachedUser = readCachedSupabaseUser();
  const [user, setUser] = useState<User | null>(cachedUser);
  const [isReady, setIsReady] = useState(!!cachedUser);
  const retryCountRef = useRef(0);

  useEffect(() => {
    let isMounted = true;
    let initialSessionResolved = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;

      // TOKEN_REFRESHED com sucesso — reseta contador de tentativas
      if (event === "TOKEN_REFRESHED" && session) {
        retryCountRef.current = 0;
      }

      setUser(session?.user ?? null);

      // Evita liberar a aplicação antes da restauração inicial da sessão.
      if (initialSessionResolved) {
        setIsReady(true);
      }
    });

    // Safety-net: nunca deixar o app preso em tela branca se getSession()
    // travar (rede instável, storage bloqueado, iframe restrito, offline).
    // Após 3.5s liberamos a UI mesmo sem resposta do Supabase.
    const readyTimeout = window.setTimeout(() => {
      if (!isMounted || initialSessionResolved) return;
      console.warn("[useAuthReady] getSession timeout — liberando UI sem sessão");
      initialSessionResolved = true;
      setIsReady(true);
    }, cachedUser ? 300 : 1200);

    void supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!isMounted) return;

      initialSessionResolved = true;
      window.clearTimeout(readyTimeout);

      if (error) {
        console.warn("[useAuthReady] Falha ao restaurar sessão:", error.message);
        // Não destrói tokens — pode ser erro de rede temporário.
        // Na próxima abertura do app, o Supabase tentará refresh novamente.
      }

      setUser(session?.user ?? null);
      setIsReady(true);
    }).catch((err) => {
      if (!isMounted) return;
      console.warn("[useAuthReady] getSession rejeitado:", err);
      initialSessionResolved = true;
      window.clearTimeout(readyTimeout);
      setIsReady(true);
    });

    return () => {
      isMounted = false;
      window.clearTimeout(readyTimeout);
      subscription.unsubscribe();
    };
  }, []);

  return { user, isReady };
}
