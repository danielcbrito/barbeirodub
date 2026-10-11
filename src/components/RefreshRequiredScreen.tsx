import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RefreshRequiredScreenProps {
  onRefresh: () => void | Promise<void>;
}

export function RefreshRequiredScreen({ onRefresh }: RefreshRequiredScreenProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleUpdate = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);

    // Dispara a atualização imediata
    try {
      void onRefresh();
    } catch (err) {
      console.warn("[RefreshRequiredScreen] erro em onRefresh:", err);
    }

    // Garante que o navegador recarregue instantaneamente sem latência
    window.setTimeout(() => {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("v_refresh", String(Date.now()));
        window.location.replace(url.toString());
      } catch {
        window.location.reload();
      }
    }, 120);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-background text-foreground flex flex-col items-center justify-center p-6 select-none pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
      <div className="flex flex-col items-center text-center max-w-xs w-full">
        {/* Logo oficial DUB: Preta no tema claro, Branca no tema escuro */}
        <div className="flex items-center gap-1.5 select-none mb-8">
          <img
            src="/auth-assets/dub_logo_d.png"
            alt="D"
            className="h-10 sm:h-11 w-auto object-contain block dark:invert"
            draggable={false}
          />
          <span
            className="text-[40px] sm:text-[44px] font-bold text-foreground tracking-[-0.04em] lowercase leading-none"
            style={{ fontFamily: "'Plus Jakarta Sans', Inter, -apple-system, sans-serif" }}
          >
            ub
          </span>
        </div>

        {/* Título direto */}
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground mb-2">
          Nova versão disponível
        </h1>

        {/* Mensagem simples e objetiva */}
        <p className="text-sm text-muted-foreground leading-relaxed mb-8 font-normal">
          Uma atualização foi publicada. Toque abaixo para atualizar.
        </p>

        {/* Botão de Ação: Cápsula Apple preto/branco sem vermelho */}
        <Button
          type="button"
          onClick={handleUpdate}
          disabled={isRefreshing}
          className="w-full h-12 rounded-full bg-foreground text-background hover:bg-foreground/90 font-medium text-sm gap-2 shadow-xs transition-all active:scale-[0.98] disabled:opacity-75"
        >
          <RefreshCw
            className={cn(
              "w-4 h-4 transition-transform duration-300",
              isRefreshing && "animate-spin"
            )}
          />
          <span>{isRefreshing ? "Atualizando..." : "Atualizar"}</span>
        </Button>
      </div>
    </div>
  );
}
