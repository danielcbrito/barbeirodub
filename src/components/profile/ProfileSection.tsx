import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProfileSectionProps {
  title: string;
  children: React.ReactNode;
  /** Delay de animação em relação às outras seções */
  index?: number;
}

/**
 * Seção agrupadora de itens do perfil.
 * Design: título discreto + card com itens separados por dividers finos.
 * Bordas arredondadas, sombra suave, padding generoso.
 */
export function ProfileSection({ title, children, index = 0 }: ProfileSectionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.08 * (index + 1), ease: [0.2, 0.9, 0.3, 1] }}
    >
      <p className="px-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1.5">
        {title}
      </p>
      <div className="mx-4 rounded-2xl bg-card border border-border/30 overflow-hidden divide-y divide-border/20 shadow-soft">
        {children}
      </div>
    </motion.div>
  );
}

interface ProfileItemProps {
  icon: React.ElementType;
  label: string;
  description?: string;
  onClick: () => void;
  destructive?: boolean;
}

/**
 * Item de navegação dentro de uma ProfileSection.
 * Design: ícone circular à esquerda, label + descrição, chevron à direita.
 * Tap target ≥48dp, feedback tátil com scale 0.98.
 */
export function ProfileItem({ icon: Icon, label, description, onClick, destructive }: ProfileItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3.5 px-4 py-3.5 text-left transition-all duration-150",
        "hover:bg-secondary/40 active:bg-secondary/60 active:scale-[0.98]",
        destructive ? "text-destructive" : "text-foreground"
      )}
      style={{ minHeight: 48 }}
      aria-label={label}
    >
      {/* Ícone em círculo sutil */}
      <div className={cn(
        "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
        destructive ? "bg-destructive/10" : "bg-secondary/60"
      )}>
        <Icon className={cn(
          "h-[17px] w-[17px]",
          destructive ? "text-destructive" : "text-muted-foreground"
        )} />
      </div>

      {/* Label + descrição */}
      <div className="flex-1 min-w-0">
        <span className="block text-[13px] font-medium leading-tight">{label}</span>
        {description && (
          <span className="block text-[11px] text-muted-foreground mt-0.5 leading-snug">{description}</span>
        )}
      </div>

      {/* Chevron */}
      <ChevronRight className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
    </button>
  );
}
