import { cn } from "@/lib/utils";

interface TimeSlotProps {
  time: string;
  isSelected: boolean;
  isDisabled: boolean;
  onSelect: () => void;
}

export function TimeSlot({ time, isSelected, isDisabled, onSelect }: TimeSlotProps) {
  return (
    <button
      onClick={onSelect}
      disabled={isDisabled}
      className={cn(
        "py-3 rounded-xl font-medium transition-all text-sm border",
        isDisabled && "opacity-30 cursor-not-allowed",
        isSelected
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card border-border text-foreground hover:bg-secondary"
      )}
    >
      {time}
    </button>
  );
}
