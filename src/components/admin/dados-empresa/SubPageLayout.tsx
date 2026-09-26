import { useNavigate } from "react-router-dom";
import { Loader2, Save } from "lucide-react";
import { cn } from "@/lib/utils";

interface SubPageLayoutProps {
  title: string;
  backPath: string;
  children: React.ReactNode;
  hasChanges: boolean;
  saving: boolean;
  onSave: () => void;
  /** Se fornecido, substitui a navegação por rota — útil para navegação por estado */
  onBack?: () => void;
}

/**
 * Layout padrão para sub-telas de edição de dados da empresa.
 * Header com seta curva + título, conteúdo livre, botão salvar fixo na base.
 */
export function SubPageLayout({
  title,
  backPath,
  children,
  hasChanges,
  saving,
  onSave,
  onBack,
}: SubPageLayoutProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) onBack();
    else navigate(backPath);
  };

  return (
    <div className="pb-28 -mx-3 -mt-3">
      {/* ── Header fixo ── */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/30">
        <div className="flex items-center gap-2.5 px-4 h-14">
          <button
            onClick={handleBack}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary/50 active:scale-95 transition-all"
            aria-label="Voltar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
              <path d="M9 14L4 9l5-5" />
              <path d="M4 9h10a4 4 0 0 1 4 4v1" />
            </svg>
          </button>
          <h1 className="text-[19px] font-medium tracking-tight text-foreground flex-1">{title}</h1>
        </div>
      </div>

      {/* ── Conteúdo ── */}
      <div className="px-4 pt-5 space-y-4">
        {children}
      </div>

      {/* ── Botão Salvar fixo — sempre visível, opaco quando inativo ── */}
      <div className="fixed bottom-4 left-0 right-0 px-5 z-30" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <button
          onClick={onSave}
          disabled={saving || !hasChanges}
          className={cn(
            "w-full h-11 rounded-xl text-[13px] font-semibold tracking-wide flex items-center justify-center gap-2",
            "bg-foreground text-background",
            "active:scale-[0.98] transition-all duration-300",
            "shadow-lg shadow-background/50",
            hasChanges && !saving
              ? "opacity-100 hover:bg-foreground/90"
              : "opacity-30 pointer-events-none"
          )}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Salvar alterações
        </button>
      </div>
    </div>
  );
}
