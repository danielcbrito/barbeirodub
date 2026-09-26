import { Button } from "@/components/ui/button";
import { type LucideIcon } from "lucide-react";

interface BarberEmptyStateProps {
  /** Main text — be specific about what's missing */
  primary: string;
  /** Secondary text — tell the barber what happens next */
  secondary: string;
  /** Optional CTA button */
  actionLabel?: string;
  onAction?: () => void;
  /** Optional icon (Lucide component) */
  icon?: LucideIcon;
}

/**
 * Inline empty state for barber lists.
 * Centered, padded, specific copy — never generic.
 */
export function BarberEmptyState({
  primary,
  secondary,
  actionLabel,
  onAction,
  icon: Icon,
}: BarberEmptyStateProps) {
  return (
    <div className="flex flex-col items-center text-center py-12">
      {Icon && (
        <Icon
          className="w-7 h-7 text-muted-foreground/30 mb-3"
          strokeWidth={1.5}
        />
      )}
      <p className="text-[15px] font-semibold text-muted-foreground">
        {primary}
      </p>
      <p className="text-[13px] text-[#4B5563] mt-1.5 max-w-[280px] leading-relaxed">
        {secondary}
      </p>
      {actionLabel && onAction && (
        <Button
          variant="outline"
          size="sm"
          onClick={onAction}
          className="mt-4"
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
