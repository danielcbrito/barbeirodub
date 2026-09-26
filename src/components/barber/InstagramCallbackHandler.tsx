import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface InstagramCallbackHandlerProps {
  barbeiroId: string;
  basePath?: string;
}

/**
 * Componente que captura o callback do Instagram OAuth.
 * Troca o authorization code pelo token e redireciona de volta ao perfil.
 */
export function InstagramCallbackHandler({ barbeiroId, basePath = "/barbeiro" }: InstagramCallbackHandlerProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      toast.error("Autorização negada pelo Instagram");
      navigate(`${basePath}/perfil`, { replace: true });
      return;
    }

    if (!code) {
      toast.error("Código de autorização não encontrado");
      navigate(`${basePath}/perfil`, { replace: true });
      return;
    }

    exchangeCode(code);
  }, []);

  const exchangeCode = async (code: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("instagram-auth", {
        body: {
          action: "exchange_code",
          barbeiro_id: barbeiroId,
          code,
        },
      });

      if (error || !data?.success) {
        setStatus("error");
        toast.error(data?.error || "Erro ao conectar Instagram");
        setTimeout(() => navigate(`${basePath}/perfil`, { replace: true }), 2000);
        return;
      }

      setStatus("success");
      toast.success(`Instagram @${data.username} conectado com sucesso! 🎉`);
      setTimeout(() => navigate(`${basePath}/perfil`, { replace: true }), 1500);
    } catch (err) {
      setStatus("error");
      toast.error("Erro ao processar conexão com Instagram");
      setTimeout(() => navigate(`${basePath}/perfil`, { replace: true }), 2000);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      {status === "loading" && (
        <>
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <p className="text-[14px] text-muted-foreground">Conectando Instagram...</p>
        </>
      )}
      {status === "success" && (
        <>
          <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <span className="text-2xl">✅</span>
          </div>
          <p className="text-[14px] text-foreground font-medium">Instagram conectado!</p>
          <p className="text-[12px] text-muted-foreground">Redirecionando...</p>
        </>
      )}
      {status === "error" && (
        <>
          <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <span className="text-2xl">❌</span>
          </div>
          <p className="text-[14px] text-destructive font-medium">Erro na conexão</p>
          <p className="text-[12px] text-muted-foreground">Redirecionando...</p>
        </>
      )}
    </div>
  );
}
