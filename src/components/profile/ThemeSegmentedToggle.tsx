import { Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Toggle de tema minimalista em formato de pílula segmentada.
 * Design premium, discreto e moderno — pensado para viver dentro da tela de perfil.
 */
export function ThemeSegmentedToggle({ className }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const current = (theme === "system" ? resolvedTheme : theme) || "light";
  const isDark = mounted && current === "dark";

  return (
    <div className={cn("flex items-center justify-center", className)}>
      <div
        role="tablist"
        aria-label="Tema do aplicativo"
        className="relative inline-flex items-center rounded-full bg-secondary/60 dark:bg-muted/40 border border-border/50 p-1 shadow-sm"
      >
        {/* Indicador deslizante */}
        <div
          className={cn(
            "absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full bg-background shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-transform duration-300 ease-out",
            isDark ? "translate-x-[calc(100%+4px)]" : "translate-x-0"
          )}
          aria-hidden
        />

        <button
          role="tab"
          aria-selected={!isDark}
          onClick={() => setTheme("light")}
          className={cn(
            "relative z-10 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-colors",
            !isDark ? "text-foreground" : "text-muted-foreground"
          )}
        >
          <Sun className="h-3.5 w-3.5" strokeWidth={2} />
          Claro
        </button>

        <button
          role="tab"
          aria-selected={isDark}
          onClick={() => setTheme("dark")}
          className={cn(
            "relative z-10 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-colors",
            isDark ? "text-foreground" : "text-muted-foreground"
          )}
        >
          <Moon className="h-3.5 w-3.5" strokeWidth={2} />
          Escuro
        </button>
      </div>
    </div>
  );
}
