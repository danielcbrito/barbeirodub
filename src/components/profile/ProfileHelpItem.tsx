import { Bell } from "lucide-react";

/**
 * Item placeholder "Central de ajuda" com badge "Em breve".
 */
export function ProfileHelpItem() {
  return (
    <div className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left" style={{ minHeight: 48 }}>
      <div className="w-8 h-8 rounded-lg bg-secondary/40 flex items-center justify-center flex-shrink-0">
        <Bell className="h-[17px] w-[17px] text-muted-foreground/35" />
      </div>
      <span className="flex-1 text-[13px] font-medium text-muted-foreground/45">
        Central de ajuda
      </span>
      <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/40 bg-muted/40 px-2 py-0.5 rounded-md">
        Em breve
      </span>
    </div>
  );
}
