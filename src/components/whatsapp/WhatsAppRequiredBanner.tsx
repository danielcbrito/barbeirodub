import { Wifi, ChevronLeft, ChevronRight, WifiOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import whatsappIcon from "@/assets/whatsapp-icon.png";

interface WhatsAppRequiredBannerProps {
  variant?: "banner" | "fullblock";
  basePath?: string;
}

/**
 * Componente reutilizável que exibe aviso sobre necessidade de conectar WhatsApp.
 * - banner: card compacto para dashboards
 * - fullblock: tela cheia centralizada para módulos bloqueados (ex: Disparo)
 */
export function WhatsAppRequiredBanner({
  variant = "banner",
  basePath = "/admin",
}: WhatsAppRequiredBannerProps) {
  const navigate = useNavigate();

  const handleConnect = () => {
    navigate(`${basePath}/whatsapp`);
  };

  const handleBack = () => {
    navigate(-1);
  };

  if (variant === "fullblock") {
    return (
      <div className="relative flex flex-col items-center justify-center min-h-[80vh] px-6 text-center animate-fade-in">
        {/* Botão voltar — Padrão do sistema */}
        <button
          onClick={handleBack}
          className="absolute top-4 left-4 w-9 h-9 rounded-full bg-secondary/80 hover:bg-secondary border border-border/30 flex items-center justify-center active:scale-95 transition-all text-foreground"
          aria-label="Voltar"
        >
          <ChevronLeft className="w-5 h-5 stroke-[2.2]" />
        </button>

        {/* Logo WhatsApp */}
        <div className="relative mb-5">
          <img
            src={whatsappIcon}
            alt="WhatsApp"
            className="w-24 h-24 object-contain drop-shadow-lg"
          />
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-destructive/15 border-2 border-background flex items-center justify-center">
            <WifiOff className="w-3.5 h-3.5 text-destructive" />
          </div>
        </div>

        <h3 className="text-xl font-bold text-foreground mb-2">
          WhatsApp não conectado
        </h3>
        <p className="text-sm text-muted-foreground max-w-xs mb-8 leading-relaxed">
          Conecte seu WhatsApp para enviar mensagens, notificações e disparos automáticos para seus clientes.
        </p>

        <button
          onClick={handleConnect}
          className={cn(
            "flex items-center gap-2.5 px-7 py-3.5 rounded-xl",
            "bg-[#25D366] hover:bg-[#1EBE5A] text-foreground",
            "font-semibold text-sm transition-all duration-200",
            "shadow-lg shadow-[#25D366]/25 hover:shadow-[#25D366]/35",
            "active:scale-[0.97]"
          )}
        >
          <Wifi className="w-4 h-4" />
          Conectar WhatsApp
        </button>

        <p className="text-[11px] text-muted-foreground/50 mt-5 max-w-[260px]">
          Após a conexão, todas as funcionalidades de mensagens serão desbloqueadas automaticamente.
        </p>
      </div>
    );
  }

  // Variante banner (compacta para dashboards)
  return (
    <button
      onClick={handleConnect}
      className={cn(
        "w-full flex items-center gap-3 rounded-xl px-4 py-3",
        "bg-[#25D366]/[0.08] border border-[#25D366]/20",
        "transition-all duration-200 active:bg-[#25D366]/[0.12]",
        "hover:border-[#25D366]/30"
      )}
    >
      <img src={whatsappIcon} alt="WhatsApp" className="w-8 h-8 object-contain shrink-0" />
      <div className="flex-1 text-left min-w-0">
        <p className="text-sm font-semibold text-foreground">Conecte seu WhatsApp</p>
        <p className="text-[11px] text-muted-foreground truncate">
          Ative notificações e disparos de mensagens
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </button>
  );
}
