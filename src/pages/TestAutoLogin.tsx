/**
 * TestAutoLogin — Auto-login para contas de teste do painel TI.
 *
 * ⚠️ SEGURANÇA: Esta rota expõe credenciais de teste diretamente no bundle
 * do navegador. Por isso ela é permitida APENAS em ambiente de desenvolvimento
 * (import.meta.env.DEV). Em produção retorna 404-like.
 *
 * Para preview em produção, use um fluxo que não exponha credenciais:
 * emitir um token de curta duração no backend (edge function protegida) e
 * consumi-lo aqui.
 */

import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { persistPreviewAuthNamespace } from "@/lib/previewAuthNamespace";

const IS_DEV = import.meta.env.DEV;

// Credenciais lidas de variáveis de ambiente (VITE_*). Só existem em .env local.
const TEST_CREDENTIALS: Record<string, { email?: string; password?: string; redirect: string }> = {
  barbeiro: {
    email: import.meta.env.VITE_TEST_BARBER_EMAIL,
    password: import.meta.env.VITE_TEST_BARBER_PASSWORD,
    redirect: "/barbeiro",
  },
  cliente: {
    email: import.meta.env.VITE_TEST_CLIENT_EMAIL,
    password: import.meta.env.VITE_TEST_CLIENT_PASSWORD,
    redirect: "/cliente",
  },
};

export default function TestAutoLogin() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const attemptRef = useRef(0);

  const role = searchParams.get("role") || "";

  useEffect(() => {
    if (!IS_DEV) {
      setStatus("error");
      setErrorMsg("Auto-login de teste desabilitado em produção.");
      return;
    }

    const doLogin = async () => {
      const creds = TEST_CREDENTIALS[role];
      if (!creds?.email || !creds?.password) {
        setStatus("error");
        setErrorMsg(
          `Credenciais de teste não configuradas. Defina VITE_TEST_${role.toUpperCase()}_EMAIL e VITE_TEST_${role.toUpperCase()}_PASSWORD no .env.local`,
        );
        return;
      }

      try {
        persistPreviewAuthNamespace(`ti_${role}`);

        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.email === creds.email) {
          window.location.replace(creds.redirect);
          return;
        }

        await supabase.auth.signOut({ scope: "local" });

        const { error } = await supabase.auth.signInWithPassword({
          email: creds.email,
          password: creds.password,
        });

        if (error) {
          attemptRef.current += 1;
          if (attemptRef.current < 2) {
            await new Promise((r) => setTimeout(r, 1000));
            void doLogin();
            return;
          }
          setStatus("error");
          setErrorMsg(error.message);
          return;
        }

        for (let i = 0; i < 8; i++) {
          const { data: { session: s } } = await supabase.auth.getSession();
          if (s?.user?.email === creds.email) {
            window.location.replace(creds.redirect);
            return;
          }
          await new Promise((r) => setTimeout(r, 250));
        }
        window.location.replace(creds.redirect);
      } catch (err: any) {
        setStatus("error");
        setErrorMsg(err?.message || "Erro inesperado");
      }
    };

    void doLogin();
  }, [role]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      {status === "loading" ? (
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Entrando como {role === "barbeiro" ? "Barbeiro Teste" : "Cliente Teste"}...
          </p>
        </div>
      ) : (
        <div className="text-center space-y-2 p-6 max-w-md">
          <p className="text-sm text-destructive font-medium">Auto-login indisponível</p>
          <p className="text-xs text-muted-foreground">{errorMsg}</p>
        </div>
      )}
    </div>
  );
}
