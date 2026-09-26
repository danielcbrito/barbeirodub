import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail, CheckCircle, Loader2 } from "lucide-react";
import logoDub from "@/assets/logo-dub.png";

const EmailVerification = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isVerified, setIsVerified] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    // Get email from URL params or localStorage
    const email = searchParams.get("email") || localStorage.getItem("pendingVerificationEmail");
    if (email) {
      setUserEmail(email);
      localStorage.setItem("pendingVerificationEmail", email);
    }

    // Check if user just verified their email
    const checkEmailVerification = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user?.email_confirmed_at) {
        setIsVerified(true);
        localStorage.removeItem("pendingVerificationEmail");
        
        // Wait 1.5s then redirect to login
        setTimeout(() => {
          navigate("/auth?mode=login&verified=true");
        }, 1500);
      }
    };

    checkEmailVerification();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user?.email_confirmed_at) {
        setIsVerified(true);
        localStorage.removeItem("pendingVerificationEmail");
        
        setTimeout(() => {
          navigate("/auth?mode=login&verified=true");
        }, 1500);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, searchParams]);

  const handleResendEmail = async () => {
    if (!userEmail) {
      toast.error("Email não encontrado. Por favor, faça o cadastro novamente.");
      return;
    }

    setIsResending(true);

    try {
      // Use production URL for email redirects (never localhost)
      const productionUrl = window.location.origin.includes("localhost")
        ? "https://dubadmin.lovable.app"
        : window.location.origin;

      console.log("[EmailVerification] Resend requested for:", userEmail);

      const { error } = await supabase.auth.resend({
        type: "signup",
        email: userEmail,
        options: {
          emailRedirectTo: `${productionUrl}/auth/callback`,
        },
      });

      if (error) {
        console.error("[EmailVerification] Error resending email:", error);

        const message = error.message || "Erro ao reenviar email. Tente novamente.";

        if (message.includes("only request this after")) {
          toast.error(
            "Você acabou de solicitar um email. Aguarde alguns minutos antes de tentar novamente."
          );
        } else if (message.toLowerCase().includes("rate limit")) {
          toast.error(
            "Muitas tentativas de reenvio. Aguarde alguns minutos e tente novamente."
          );
        } else if (message.toLowerCase().includes("email not found")) {
          toast.error(
            "Não encontramos este email. Verifique se digitou corretamente ou faça o cadastro novamente."
          );
        } else {
          toast.error("Erro ao reenviar email. Tente novamente em alguns instantes.");
        }

        return;
      }

      toast.success("Email de confirmação reenviado com sucesso!");
    } catch (error: any) {
      console.error("[EmailVerification] Unexpected error:", error);
      toast.error("Erro inesperado ao reenviar email. Tente novamente.");
    } finally {
      setIsResending(false);
    }
  };
  const handleBackToLogin = () => {
    localStorage.removeItem("pendingVerificationEmail");
    navigate("/auth?mode=login");
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden px-4" style={{ background: '#000000' }}>
      {/* Ambient background lights - Premium glow effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '6s', animationDelay: '2s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/3 rounded-full blur-[150px]" />
      </div>

      {/* Content wrapper - Centered */}
      <div className="relative z-10 w-full max-w-[420px] animate-fade-in">
        
        {/* Logo at top - Floating */}
        <div className="flex justify-center mb-12 animate-scale-in">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
            <img 
              src={logoDub} 
              alt="DUB" 
              className="relative w-16 h-16 object-contain drop-shadow-2xl"
            />
          </div>
        </div>

        {/* Luxury Glass Card - Mirror effect */}
        <div className="relative group">
          {/* Outer glow */}
          <div className="absolute -inset-[1px] bg-gradient-to-b from-primary/20 via-primary/5 to-transparent rounded-2xl blur-sm opacity-60 group-hover:opacity-100 transition-opacity duration-500" />
          
          {/* Main card with glassmorphism */}
          <div 
            className="relative bg-gradient-to-b from-white/[0.07] to-white/[0.02] rounded-2xl p-10 border border-foreground/10 shadow-2xl overflow-hidden"
            style={{
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            }}
          >
            {/* Top reflection line */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
            
            {/* Icon with elegant glow */}
            <div className="flex justify-center mb-8">
              <div className="relative">
                {isVerified ? (
                  <>
                    <div className="absolute inset-0 bg-primary/30 blur-2xl rounded-full" />
                    <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/30">
                      <CheckCircle className="h-8 w-8 text-primary drop-shadow-lg" />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="absolute inset-0 bg-foreground/10 blur-xl rounded-full" />
                    <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center border border-foreground/20">
                      <Mail className="h-8 w-8 text-foreground/90 drop-shadow-lg" />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Content - Ultra clean */}
            <div className="text-center space-y-6">
              <h1 className="text-2xl font-semibold text-foreground tracking-tight" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
                {isVerified ? "Conta Verificada" : "Confirme seu e-mail"}
              </h1>

              {isVerified ? (
                <div className="space-y-5">
                  <p className="text-sm text-foreground/60">
                    Redirecionando...
                  </p>
                  <div className="flex justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {userEmail && (
                    <div className="relative px-5 py-4 bg-foreground/5 rounded-xl border border-foreground/10 backdrop-blur-sm">
                      <p className="text-sm font-medium text-foreground/90 break-all">
                        {userEmail}
                      </p>
                    </div>
                  )}

                  {/* Premium CTA button */}
                  <Button
                    onClick={handleResendEmail}
                    disabled={isResending}
                    className="relative w-full h-12 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary text-foreground font-semibold rounded-xl transition-all duration-300 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/40 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isResending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Reenviando...
                      </>
                    ) : (
                      "Reenviar e-mail"
                    )}
                  </Button>

                  {/* Elegant back link */}
                  <button
                    onClick={handleBackToLogin}
                    className="text-sm text-foreground/50 hover:text-foreground/90 transition-colors duration-300 font-medium"
                  >
                    Voltar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailVerification;
