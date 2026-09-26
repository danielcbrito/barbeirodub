import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import whatsappLogo from "@/assets/whatsapp-logo.png";
import { Loader2, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

const VerificarWhatsApp = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userId = searchParams.get("user_id");
  const phone = searchParams.get("phone");

  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(300);
  const [verificationStatus, setVerificationStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  useEffect(() => {
    if (timeRemaining > 0 && verificationStatus === 'pending') {
      const timer = setTimeout(() => setTimeRemaining(timeRemaining - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [timeRemaining, verificationStatus]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatPhoneDisplay = (phoneNumber: string | null) => {
    if (!phoneNumber) return "";
    const cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.length === 11) {
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
    }
    return phoneNumber;
  };

  const handleVerify = async () => {
    if (code.length !== 6) {
      toast.error("Digite o código completo de 6 dígitos");
      return;
    }

    if (!userId) {
      toast.error("Sessão inválida. Faça o cadastro novamente.");
      navigate("/auth?mode=signup");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-verification', {
        body: { action: 'verify', user_id: userId, code }
      });

      if (error) throw error;

      if (data?.success) {
        setVerificationStatus('success');
        toast.success("Cadastro confirmado com sucesso!");
        
        setTimeout(() => {
          navigate("/auth?mode=login&verified=whatsapp");
        }, 2000);
      } else {
        setVerificationStatus('error');
        setErrorMessage(data?.error || "Código inválido");
        toast.error(data?.error || "Código inválido");
        
        setTimeout(() => {
          setVerificationStatus('pending');
          setCode("");
        }, 2000);
      }
    } catch (error: any) {
      console.error("Erro ao verificar:", error);
      setVerificationStatus('error');
      setErrorMessage("Erro ao verificar código. Tente novamente.");
      toast.error("Erro ao verificar código");
      
      setTimeout(() => {
        setVerificationStatus('pending');
      }, 2000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;

    if (!userId) {
      toast.error("Sessão inválida. Faça o cadastro novamente.");
      navigate("/auth?mode=signup");
      return;
    }

    setIsResending(true);

    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-verification', {
        body: { action: 'resend', user_id: userId }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success("Novo código enviado!");
        setCooldown(60);
        setTimeRemaining(300);
        setCode("");
        setVerificationStatus('pending');
        setErrorMessage("");
      } else {
        if (data?.cooldown_remaining) {
          setCooldown(data.cooldown_remaining);
        }
        toast.error(data?.error || "Erro ao reenviar código");
      }
    } catch (error: any) {
      console.error("Erro ao reenviar:", error);
      toast.error("Erro ao reenviar código");
    } finally {
      setIsResending(false);
    }
  };

  useEffect(() => {
    if (code.length === 6 && verificationStatus === 'pending') {
      handleVerify();
    }
  }, [code]);

  useEffect(() => {
    if (!userId) {
      toast.error("Link inválido. Faça o cadastro novamente.");
      navigate("/auth?mode=signup");
    }
  }, [userId, navigate]);

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col bg-black">
      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-[360px] relative z-10">
          
          {/* WhatsApp Logo */}
          <div className="flex justify-center mb-8">
            {verificationStatus === 'success' ? (
              <div className="w-16 h-16 rounded-full bg-[#25D366]/20 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-[#25D366]" />
              </div>
            ) : verificationStatus === 'error' ? (
              <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center">
                <XCircle className="w-8 h-8 text-destructive" />
              </div>
            ) : (
              <img src={whatsappLogo} alt="WhatsApp" className="w-14 h-14 object-contain" />
            )}
          </div>

          {/* Title */}
          <div className="text-center mb-8">
            <h1 className="text-xl font-semibold text-foreground">
              {verificationStatus === 'success' 
                ? "Tudo certo!" 
                : verificationStatus === 'error'
                ? "Código incorreto"
                : "Confirme seu WhatsApp"}
            </h1>
            <p className="mt-2 text-sm text-foreground/50">
              {verificationStatus === 'success' 
                ? "Redirecionando..." 
                : verificationStatus === 'error'
                ? errorMessage
                : (
                  <>
                    Enviamos um código para{" "}
                    <span className="text-[#25D366]">{formatPhoneDisplay(phone)}</span>
                  </>
                )}
            </p>
          </div>

          {verificationStatus === 'pending' && (
            <>
              {/* OTP Input */}
              <div className="flex justify-center mb-6">
                <InputOTP
                  maxLength={6}
                  value={code}
                  onChange={setCode}
                  disabled={isLoading}
                >
                  <InputOTPGroup className="gap-2">
                    {[0, 1, 2, 3, 4, 5].map((index) => (
                      <InputOTPSlot
                        key={index}
                        index={index}
                        className="w-11 h-13 text-lg font-semibold bg-foreground/[0.05] border-foreground/[0.1] text-foreground rounded-lg focus:border-[#25D366] focus:ring-1 focus:ring-[#25D366]/30"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>

              {/* Timer */}
              <div className="text-center mb-6">
                <span className={`text-xs ${timeRemaining <= 60 ? 'text-destructive' : 'text-foreground/40'}`}>
                  Expira em {formatTime(timeRemaining)}
                </span>
              </div>

              {/* Verify Button */}
              <Button
                onClick={handleVerify}
                disabled={code.length !== 6 || isLoading}
                className="w-full h-11 bg-[#25D366] hover:bg-[#22c55e] text-foreground font-medium rounded-lg transition-all disabled:opacity-50"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verificando...
                  </span>
                ) : (
                  "Confirmar"
                )}
              </Button>

              {/* Resend */}
              <div className="mt-6 text-center">
                <button
                  onClick={handleResend}
                  disabled={cooldown > 0 || isResending}
                  className="text-sm text-foreground/50 hover:text-foreground/70 transition-colors disabled:opacity-50"
                >
                  {isResending ? (
                    "Reenviando..."
                  ) : cooldown > 0 ? (
                    `Reenviar em ${cooldown}s`
                  ) : (
                    "Não recebeu? Reenviar código"
                  )}
                </button>
              </div>
            </>
          )}

          {/* Back Link */}
          <div className="mt-8 text-center">
            <button
              onClick={() => navigate("/auth?mode=signup")}
              className="text-sm text-foreground/40 hover:text-foreground/60 transition-colors"
            >
              Voltar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerificarWhatsApp;