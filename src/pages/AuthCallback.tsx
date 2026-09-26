import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import logoDub from "@/assets/logo-dub.png";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

function sanitizeNextPath(path: string | null): string | null {
  if (!path) return null;
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  return path;
}

/**
 * AuthCallback — Processa magic links, OAuth redirects, confirmações de e-mail
 *
 * Fluxo:
 *  1. Detecta tipo de callback (magiclink, signup, recovery, OAuth)
 *  2. Estabelece sessão
 *  3. Redireciona para AuthRouter (que decide destino por role)
 */
const AuthCallback = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const nextPath = sanitizeNextPath(new URLSearchParams(window.location.search).get("next"));

        // Tokens vêm no hash da URL (padrão Supabase)
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        const type = hashParams.get("type");
        const error = hashParams.get("error");
        const errorDescription = hashParams.get("error_description");

        if (error) {
          console.error("[AuthCallback] Error:", error, errorDescription);
          setErrorMessage(errorDescription || "Erro na confirmação");
          setStatus("error");
          return;
        }

        // Tipos tratados: signup, email_change, recovery, invite, magiclink
        const isHandledType = ["signup", "email_change", "recovery", "invite", "magiclink"].includes(type || "");

        if (isHandledType && accessToken && refreshToken) {
          const { data, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (sessionError) {
            console.error("[AuthCallback] Session error:", sessionError);
            setErrorMessage("Erro ao processar confirmação");
            setStatus("error");
            return;
          }

          // Limpar e-mail temporário do magic link
          localStorage.removeItem("emailParaLogin");
          localStorage.removeItem("pendingVerificationEmail");
          setStatus("success");

          const userId = data.session?.user?.id;

          // Recovery → resetar senha
          if (type === "recovery" && userId) {
            toast.success("Verificação concluída! Redirecionando...");
            setTimeout(() => navigate("/resetar-senha"), 1500);
            return;
          }

          // Redirecionamento explícito tem prioridade para evitar cair no app errado
          if (userId) {
            toast.success("Login realizado com sucesso!");
            if (nextPath) {
              setTimeout(() => navigate(nextPath, { replace: true }), 1500);
              return;
            }
            setTimeout(() => navigate("/", { replace: true }), 1500);
            return;
          }

          // Fallback
          toast.success("E-mail confirmado com sucesso!");
          setTimeout(() => navigate("/", { replace: true }), 2000);
          return;
        }

        // Tentar sessão existente (caso de OAuth redirect)
        const { data: { session }, error: getSessionError } = await supabase.auth.getSession();

        if (getSessionError) {
          console.error("[AuthCallback] Get session error:", getSessionError);
          setErrorMessage("Erro ao verificar sessão");
          setStatus("error");
          return;
        }

        if (session?.user) {
          localStorage.removeItem("emailParaLogin");
          localStorage.removeItem("pendingVerificationEmail");
          setStatus("success");

          toast.success("Login realizado com sucesso!");
          if (nextPath) {
            setTimeout(() => navigate(nextPath, { replace: true }), 1500);
            return;
          }
          setTimeout(() => navigate("/", { replace: true }), 1500);
          return;
        }

        setErrorMessage("Link de confirmação inválido ou expirado");
        setStatus("error");
      } catch (err) {
        console.error("[AuthCallback] Processing error:", err);
        setErrorMessage("Erro ao processar confirmação");
        setStatus("error");
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden px-4" style={{ background: '#000000' }}>
      {/* Ambient background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '6s', animationDelay: '2s' }} />
      </div>

      <div className="relative z-10 w-full max-w-[480px] animate-fade-in">
        <div className="flex justify-center mb-12 animate-scale-in">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
            <img src={logoDub} alt="DUB" className="relative w-16 h-16 object-contain drop-shadow-2xl" />
          </div>
        </div>

        <div className="relative group">
          <div className="absolute -inset-[1px] bg-gradient-to-b from-primary/20 via-primary/5 to-transparent rounded-2xl blur-sm opacity-60" />
          <div
            className="relative bg-gradient-to-b from-white/[0.07] to-white/[0.02] rounded-2xl p-10 border border-foreground/10 shadow-2xl overflow-hidden text-center"
            style={{ backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)' }}
          >
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

            {status === "loading" && (
              <>
                <Loader2 className="w-16 h-16 text-primary mx-auto mb-6 animate-spin" />
                <h2 className="text-2xl font-semibold text-foreground mb-4">Confirmando...</h2>
                <p className="text-foreground/60">Aguarde enquanto processamos seu acesso</p>
              </>
            )}

            {status === "success" && (
              <>
                <div className="relative mx-auto mb-6 w-20 h-20">
                  <div className="absolute inset-0 bg-green-500/20 rounded-full blur-xl animate-pulse" />
                  <CheckCircle2 className="relative w-20 h-20 text-green-500" />
                </div>
                <h2 className="text-2xl font-semibold text-foreground mb-4">Confirmado!</h2>
                <p className="text-foreground/60 mb-6">Redirecionando...</p>
                <div className="flex items-center justify-center gap-2 text-foreground/40">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Redirecionando...</span>
                </div>
              </>
            )}

            {status === "error" && (
              <>
                <div className="relative mx-auto mb-6 w-20 h-20">
                  <div className="absolute inset-0 bg-destructive/20 rounded-full blur-xl" />
                  <XCircle className="relative w-20 h-20 text-destructive" />
                </div>
                <h2 className="text-2xl font-semibold text-foreground mb-4">Erro</h2>
                <p className="text-foreground/60 mb-6">{errorMessage}</p>
                <Button
                  onClick={() => navigate("/")}
                  className="w-full h-12 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary text-foreground font-semibold rounded-xl"
                >
                  Voltar ao início
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthCallback;
