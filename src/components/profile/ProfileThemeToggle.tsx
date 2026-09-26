import { Palette } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

/**
 * Toggle de tema claro/escuro inline para a tela de perfil.
 * Design limpo: apenas texto + switch, sem ícones sol/lua.
 */
export function ProfileThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left text-foreground hover:bg-secondary/40 active:bg-secondary/60 active:scale-[0.98] transition-all duration-150"
      style={{ minHeight: 48 }}
      aria-label={`Alternar para tema ${isDark ? "claro" : "escuro"}`}
    >
      {/* Ícone genérico */}
      <div className="w-8 h-8 rounded-lg bg-secondary/60 flex items-center justify-center flex-shrink-0">
        <Palette className="h-[17px] w-[17px] text-muted-foreground" />
      </div>

      <span className="flex-1 text-[13px] font-medium">
        Tema {isDark ? "Escuro" : "Claro"}
      </span>

      {/* Switch visual — sem sol/lua */}
      <div className={cn(
        "relative w-10 h-[22px] rounded-full transition-colors duration-200",
        isDark ? "bg-primary" : "bg-muted-foreground/25"
      )}>
        <div className={cn(
          "absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
          isDark ? "translate-x-[22px]" : "translate-x-[3px]"
        )} />
      </div>
    </button>
  );
}
