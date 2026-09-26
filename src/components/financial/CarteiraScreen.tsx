import { useEffect } from "react";
import { Loader2 } from "lucide-react";

interface Props {
  barbeiroId?: string;
  onBack?: () => void;
}

const EFI_APP_SCHEME = "efibank://";
const EFI_APP_STORE_IOS = "https://apps.apple.com/br/app/ef%C3%AD-bank/id1438916030";
const EFI_APP_STORE_ANDROID = "https://play.google.com/store/apps/details?id=br.com.gerencianet.app";
const EFI_WEB_FALLBACK = "https://app.efibank.com.br";

function detectPlatform(): "ios" | "android" | "web" {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "web";
}

/**
 * CarteiraScreen — Redireciona imediatamente para o app Efí Bank.
 * Sem UI intermediária. Fallback para store/web se o app não estiver instalado.
 */
export function CarteiraScreen({ onBack }: Props) {
  useEffect(() => {
    const platform = detectPlatform();

    if (platform === "web") {
      window.location.href = EFI_WEB_FALLBACK;
      return;
    }

    const fallback = platform === "ios" ? EFI_APP_STORE_IOS : EFI_APP_STORE_ANDROID;
    const start = Date.now();

    const timer = window.setTimeout(() => {
      if (Date.now() - start < 2500 && document.visibilityState === "visible") {
        window.location.href = fallback;
      }
    }, 1200);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        clearTimeout(timer);
        // Quando o usuário voltar pro DUB, retorna à tela anterior
        const onReturn = () => {
          if (document.visibilityState === "visible") {
            document.removeEventListener("visibilitychange", onReturn);
            onBack?.();
          }
        };
        document.addEventListener("visibilitychange", onReturn);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    window.location.href = EFI_APP_SCHEME;

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [onBack]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
