import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ScheduleHeader } from "@/components/shared/ScheduleHeader";

interface SubPageLayoutProps {
  title: string;
  subtitle?: string;
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
 * Usa o ScheduleHeader padrão com a seta oficial do sistema e botão Salvar fixo na base.
 */
export function SubPageLayout({
  title,
  subtitle,
  backPath,
  children,
  hasChanges,
  saving,
  onSave,
  onBack,
}: SubPageLayoutProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (backPath) {
      navigate(backPath, { replace: true });
    } else if (window.history.length > 1) {
      navigate(-1);
    }
  };

  return (
    <div className="pb-32 min-h-app bg-background">
      {/* ── Header Padrão do Sistema ── */}
      <ScheduleHeader
        title={title}
        subtitle={subtitle}
        onBack={handleBack}
      />

      {/* ── Conteúdo em largura natural (sem estreitamento excessivo) ── */}
      <div className="px-4 pt-4 w-full space-y-4">
        {children}
      </div>

      {/* ── Botão Salvar visível apenas quando houver alterações pendentes ── */}
      <AnimatePresence>
        {hasChanges && (
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed bottom-4 left-0 right-0 px-4 z-40 pointer-events-none"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="w-full pointer-events-auto">
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className={cn(
                  "w-full h-12 rounded-2xl text-[14px] font-semibold tracking-wide flex items-center justify-center gap-2",
                  "bg-foreground text-background",
                  "active:scale-[0.98] transition-all duration-200",
                  "shadow-lg shadow-black/10 dark:shadow-black/40 cursor-pointer",
                  saving && "opacity-80 pointer-events-none"
                )}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>Salvar alterações</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
